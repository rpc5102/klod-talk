// The translator's pure parts: what is sent, and what a reload leaves to do.

import { describe, expect, test } from 'claude-code/testing'

import { EMPTY_CAVE } from '../hooks/atoms'
import {
  FIXED,
  MAX_TOKENS,
  TIMEOUT_MS,
  afterReload,
  announcement,
  promptFor,
  requestFor,
} from '../hooks/translator'
import { WORDS } from '../hooks/words'
import { SAMPLES } from './fixtures'

const crashloop = SAMPLES.find(sample => sample.id === 'crashloop')!
const job = { id: 'turn-1', text: crashloop.chat, level: 'caveman' } as const

describe('the prompt', () => {
  test('the fixed part carries the rules and the whole word list', () => {
    expect(FIXED).toContain('Same facts, same order, same numbers.')
    expect(FIXED).toContain('First line: SIZE n, from 0 (nothing wrong) to 5 (everything on fire).')
    expect(FIXED).toContain('answer only: JOKES OFF')
    for (const [term, caveWord] of WORDS) {
      expect(FIXED).toContain(`${term} = ${caveWord}`)
    }
  })

  test('the changing part is the level and the answer, fences removed', () => {
    const text = 'Raise the limit:\n\n```yaml\nmemory: 2.5Gi\n```\n\nThen roll `coredns`.'
    expect(promptFor(text, 'very')).toBe('Level: very caveman. Text: Raise the limit:\n\nThen roll `coredns`.')
    expect(promptFor(crashloop.chat, 'less').startsWith('Level: less cave. Text: Your pod is in')).toBe(true)
  })

  test('the fixed text goes in system, with the one cache mark', () => {
    expect(requestFor(job, 'haiku', false)).toEqual({
      model: 'haiku',
      system: [{ text: FIXED, cache: true }],
      prompt: promptFor(job.text, job.level),
      maxTokens: MAX_TOKENS,
      timeoutMs: TIMEOUT_MS,
    })
    expect([MAX_TOKENS, TIMEOUT_MS]).toEqual([500, 8000])
  })

  test('behind Bedrock, Vertex or a gateway it leads the prompt instead', () => {
    expect(requestFor(job, 'haiku', true)).toEqual({
      model: 'haiku',
      prompt: [{ text: FIXED, cache: true }, { text: promptFor(job.text, job.level) }],
      maxTokens: MAX_TOKENS,
      timeoutMs: TIMEOUT_MS,
    })
  })
})

describe('afterReload()', () => {
  const source = { id: 'turn-1', text: 'An answer.', level: 'caveman' } as const

  test('a call the reload dropped is made again', () => {
    expect(afterReload({ ...EMPTY_CAVE, source, phase: 'chewing' }, false, 'caveman')).toBe('translate')
  })

  test('a level change translates the same answer again', () => {
    expect(afterReload({ ...EMPTY_CAVE, source, phase: 'done' }, false, 'very')).toBe('translate')
    expect(afterReload({ ...EMPTY_CAVE, source, phase: 'failed' }, false, 'less')).toBe('translate')
  })

  test('streaming goes on; done stays', () => {
    expect(afterReload({ ...EMPTY_CAVE, source, phase: 'streaming' }, false, 'caveman')).toBe('reveal')
    expect(afterReload({ ...EMPTY_CAVE, source, phase: 'done' }, false, 'caveman')).toBe('nothing')
  })

  test('nothing to do with no answer yet, or with jokes off', () => {
    expect(afterReload(EMPTY_CAVE, false, 'very')).toBe('nothing')
    expect(afterReload({ ...EMPTY_CAVE, source, phase: 'chewing' }, true, 'very')).toBe('nothing')
  })
})

test('the announcement is his line, then the whole cave answer', () => {
  const paragraphs = [[{ text: 'Box fall.', isTerm: false }], [{ text: 'Fix:', isTerm: true }, { text: ' belly.', isTerm: false }]]
  expect(announcement('caveman', paragraphs)).toBe('Me make big words small. Box fall. Fix: belly.')
})
