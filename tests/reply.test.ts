// The reply parser, the fence stripper, the glossary and the question check.

import { describe, expect, test } from 'claude-code/testing'

import { glossaryFor, parseReply, plainText, segments, withoutFences } from '../hooks/reply'
import { asksUser } from '../hooks/tracker'
import { WORDS } from '../hooks/words'
import { A2, A3, SAMPLES } from './fixtures'
import { replyFor } from './world'

describe('withoutFences()', () => {
  test('takes fenced blocks out and keeps inline code', () => {
    const text = [
      'Raise `resources.limits.memory` to `2.5Gi`:',
      '',
      '```yaml',
      'resources:',
      '  limits:',
      '    memory: 2.5Gi',
      '```',
      '',
      'Then roll the pods.',
    ].join('\n')
    expect(withoutFences(text)).toBe(
      'Raise `resources.limits.memory` to `2.5Gi`:\n\nThen roll the pods.',
    )
  })

  test('tildes, longer fences and an unclosed fence', () => {
    expect(withoutFences('a\n~~~\ncode\n~~~\nb')).toBe('a\nb')
    expect(withoutFences('a\n````md\n```\ninner\n```\n````\nb')).toBe('a\nb')
    expect(withoutFences('a\n```\nnever closed')).toBe('a')
    expect(withoutFences('```\nonly code\n```')).toBe('')
  })
})

describe('parseReply()', () => {
  test('reads the SIZE line, paragraphs and *terms*', () => {
    const reply = parseReply('SIZE 3\nBox eat *two mammoth*.\n\n*Fix:* bigger belly.')
    expect(reply).toEqual({
      kind: 'cave',
      size: 3,
      paragraphs: [
        [
          { text: 'Box eat ', isTerm: false },
          { text: 'two mammoth', isTerm: true },
          { text: '.', isTerm: false },
        ],
        [
          { text: 'Fix:', isTerm: true },
          { text: ' bigger belly.', isTerm: false },
        ],
      ],
    })
  })

  test('reads every prototype take back as drawn', () => {
    for (const level of [...A2.levels, ...A3.levels]) {
      for (const take of level.takes) {
        expect(parseReply(replyFor(2, take))).toEqual({ kind: 'cave', size: 2, paragraphs: take })
      }
    }
  })

  test('reads the samples\' **bold** as terms', () => {
    for (const sample of SAMPLES) {
      const reply = parseReply([`SIZE ${sample.mammoths}`, ...sample.cave].join('\n\n'))
      if (reply.kind !== 'cave') {
        throw new Error(`${sample.id} read as jokes off`)
      }
      expect(reply.size).toBe(sample.mammoths)
      expect(reply.paragraphs.map(plainText)).toEqual(sample.cave.map(text => text.replaceAll('**', '')))
    }
  })

  test('SIZE is clamped, spelled loosely, or missing', () => {
    expect(parseReply('SIZE 9\nUgh.')).toMatchObject({ size: 5 })
    expect(parseReply('Size: 2\nUgh.')).toMatchObject({ size: 2 })
    expect(parseReply('**SIZE 4**\nUgh.')).toMatchObject({ size: 4 })
    expect(parseReply('Ugh.')).toMatchObject({ size: null })
  })

  test('JOKES OFF, however it comes', () => {
    expect(parseReply('JOKES OFF')).toEqual({ kind: 'jokes-off' })
    expect(parseReply('  jokes off.  ')).toEqual({ kind: 'jokes-off' })
    expect(parseReply('SIZE 5\nJOKES OFF')).toEqual({ kind: 'jokes-off' })
  })

  test('lines without blank lines between are paragraphs each', () => {
    const reply = parseReply('SIZE 1\nOne rock.\nTwo rock.')
    expect(reply).toMatchObject({ paragraphs: [[{ text: 'One rock.' }], [{ text: 'Two rock.' }]] })
  })

  test('garbage reads as no paragraphs', () => {
    expect(parseReply('')).toEqual({ kind: 'cave', size: null, paragraphs: [] })
    expect(parseReply('SIZE 2\n\n   \n')).toEqual({ kind: 'cave', size: 2, paragraphs: [] })
  })

  test('a lone asterisk stays text', () => {
    expect(segments('2 * 3 * 4 rock')).toEqual([{ text: '2 * 3 * 4 rock', isTerm: false }])
    expect(segments('**Fix:** eat')).toEqual([
      { text: 'Fix:', isTerm: true },
      { text: ' eat', isTerm: false },
    ])
  })
})

describe('glossaryFor()', () => {
  test('lists the word-list pairs whose cave word is on screen, in list order', () => {
    const reply = parseReply(
      'SIZE 3\n*Little box* fall down. *Big Boss Rock* wait.\n\n*Two caveman, one leg.* *Fix:* eat.',
    )
    if (reply.kind !== 'cave') {
      throw new Error('read as jokes off')
    }
    expect(glossaryFor(reply.paragraphs, WORDS)).toEqual([
      ['Kubernetes', 'Big Boss Rock'],
      ['Pod', 'little box'],
      ['Race condition', 'two caveman, one leg'],
    ])
  })
})

describe('asksUser()', () => {
  test('an answer that ends by asking you something', () => {
    expect(asksUser('Fixed the date bug. Want me to push it?')).toBe(true)
    expect(asksUser('Which one do you want?\n\n```diff\n- a\n+ b\n```')).toBe(true)
    expect(asksUser('Should I keep `freezegun`?**')).toBe(true)
  })

  test('an answer that does not', () => {
    expect(asksUser('Build succeeded. 212 tests passed.')).toBe(false)
    expect(asksUser('Why? The cache was stale. Fixed now.')).toBe(false)
    expect(asksUser('')).toBe(false)
  })
})
