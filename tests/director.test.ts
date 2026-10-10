// The director's pure parts: desired() over a table of facts, breaksHold()
// and the next wake time. Lines come from the prototypes and samples.

import { describe, expect, test } from 'claude-code/testing'

import type { CaveWords, PoseState, SessionFacts } from '../types'
import { EMPTY_CAVE, EMPTY_FACTS, FIRST_POSE } from '../hooks/atoms'
import {
  EXPLAIN_MS,
  RESULT_MS,
  SLEEP_MS,
  TYPING_MS,
  breaksHold,
  desired,
  nextWakeAt,
} from '../hooks/director'
import { A2, A3, STATUS_LINES } from './fixtures'

const NOW = 1_000_000_000

function facts(over: Partial<SessionFacts> = {}): SessionFacts {
  return { ...EMPTY_FACTS, quietSince: NOW - 1000, ...over }
}

function words(over: Partial<CaveWords> = {}): CaveWords {
  return { ...EMPTY_CAVE, ...over }
}

function shown(over: Partial<PoseState> = {}): PoseState {
  return { ...FIRST_POSE, since: NOW - 500, holdUntil: NOW + 1500, ...over }
}

const turn = { id: 'turn-1', startedAt: NOW - 3000 }
const happy = { pose: 'happy', why: 'done', asksUser: false, endedAt: NOW - 1000 } as const
const asks = { pose: 'shrug', why: 'asks', asksUser: true, endedAt: NOW - 1000 } as const
const source = { id: 'turn-1', text: 'An answer.', level: 'caveman' } as const

describe('desired()', () => {
  test('Idle when nothing happens', () => {
    const want = desired(facts(), words(), NOW)
    expect(want.name).toBe('idle')
    expect(want.status).toBe(STATUS_LINES['idle']!)
  })

  test('Impatient for 1.5 s after a keystroke', () => {
    const typing = facts({ typingAt: NOW - TYPING_MS + 1 })
    expect(desired(typing, words(), NOW).name).toBe('impatient')
    expect(desired(typing, words(), NOW).status).toBe(A2.scenes[0]!.status)
    expect(desired(facts({ typingAt: NOW - TYPING_MS }), words(), NOW).name).toBe('idle')
  })

  test('Thinking while a turn runs, and for every tool until Phase 2', () => {
    expect(desired(facts({ turn }), words(), NOW).name).toBe('thinking')
    const running = [{ toolUseId: 'toolu_1', tool: 'Read', startedAt: NOW - 40_000 }]
    expect(desired(facts({ turn, running }), words(), NOW).name).toBe('thinking')
  })

  test('Snack while the words chew, over a running turn', () => {
    const want = desired(facts({ turn }), words({ phase: 'chewing', source }), NOW)
    expect(want.name).toBe(A3.chew.sprite)
    expect(want.status).toBe(A3.chew.status)
    expect(want.meta).toBe(A3.chew.meta)
  })

  test('Explaining while the words stream and for 2 s after the last lands', () => {
    const streaming = words({ phase: 'streaming', source })
    const want = desired(facts({ result: happy }), streaming, NOW)
    expect(want.name).toBe('explaining')
    expect(want.status).toBe(A3.levels.find(level => level.name === 'Caveman')!.status)
    const landed = words({ phase: 'done', source, explainedAt: NOW - EXPLAIN_MS + 1 })
    expect(desired(facts({ result: happy }), landed, NOW).name).toBe('explaining')
    const later = words({ phase: 'done', source, explainedAt: NOW - EXPLAIN_MS })
    expect(desired(facts({ result: happy }), later, NOW).name).toBe('happy')
  })

  test('Explaining speaks at the level the words were made at', () => {
    for (const [level, name] of [
      ['less', 'Less cave'],
      ['very', 'Very caveman'],
      ['rock', 'Literal rock'],
    ] as const) {
      const streaming = words({ phase: 'streaming', source: { ...source, level } })
      const status = A3.levels.find(one => one.name === name)!.status
      expect(desired(facts(), streaming, NOW).status).toBe(status)
    }
  })

  test('Panic beats everything but jokes off, chewing included', () => {
    const panicking = facts({ panicUntil: NOW + 1, turn })
    const want = desired(panicking, words({ phase: 'chewing', source }), NOW)
    expect(want.name).toBe('panic')
    expect(want.status).toBe(A3.scenes.find(scene => scene.id === 'error')!.status)
    expect(desired(facts({ panicUntil: NOW }), words(), NOW).name).toBe('idle')
  })

  test('A failed translation is a Shrug beat: "Me brain hurt."', () => {
    const beat = { name: 'failed', lengthMs: 2000 } as const
    const want = desired(facts({ ownBeats: [beat], turn }), words({ phase: 'failed' }), NOW)
    expect(want.name).toBe('shrug')
    expect(want.status).toBe('Me brain hurt.')
    expect(want.beat).toEqual(beat)
  })

  test('The result holds 60 quiet seconds, then Idle', () => {
    const fresh = { ...happy, endedAt: NOW - RESULT_MS + 1 }
    expect(desired(facts({ result: fresh }), words(), NOW).name).toBe('happy')
    const stale = { ...happy, endedAt: NOW - RESULT_MS }
    expect(desired(facts({ result: stale }), words(), NOW).name).toBe('idle')
  })

  test('A question for you keeps Shrug up until you answer', () => {
    const old = { ...asks, endedAt: NOW - 10 * RESULT_MS }
    const want = desired(facts({ result: old, typingAt: NOW }), words(), NOW)
    expect(want.name).toBe('shrug')
    expect(want.status).toBe(STATUS_LINES['shrug']!)
    expect(want.meta).toBe('Claude asked you something')
  })

  test('An API error ends on Shrug, a refusal on Shrug', () => {
    const error = { pose: 'shrug', why: 'error', asksUser: false, endedAt: NOW } as const
    expect(desired(facts({ result: error }), words(), NOW).meta).toBe('The turn ended on an API error')
    const refusal = { ...error, why: 'refusal' } as const
    expect(desired(facts({ result: refusal }), words(), NOW).name).toBe('shrug')
  })

  test('Sleep after 20 quiet minutes', () => {
    const want = desired(facts({ quietSince: NOW - SLEEP_MS }), words(), NOW)
    expect(want.name).toBe('sleep')
    expect(want.status).toBe(A3.scenes.find(scene => scene.id === 'idle')!.status)
    expect(desired(facts({ quietSince: NOW - SLEEP_MS + 1 }), words(), NOW).name).toBe('idle')
  })

  test('Jokes off: Idle, standing still, whatever happens', () => {
    const busy = facts({ jokesOff: true, turn, typingAt: NOW, panicUntil: NOW + 1 })
    const want = desired(busy, words({ phase: 'chewing' }), NOW)
    expect(want).toMatchObject({ name: 'idle', isStill: true, status: 'No jokes for this one.' })
  })

  test('The louder trigger wins, all the way down the list', () => {
    const everything = facts({
      panicUntil: NOW + 1,
      ownBeats: [{ name: 'failed', lengthMs: 2000 }],
      turn,
      result: asks,
      typingAt: NOW,
      quietSince: NOW - SLEEP_MS,
    })
    const chewing = words({ phase: 'chewing', source })
    const order: string[] = []
    let current = everything
    let currentWords = chewing
    const peel = [
      () => (current = { ...current, panicUntil: 0 }),
      () => (currentWords = words({ phase: 'streaming', source })),
      () => (currentWords = words({ phase: 'done', source })),
      () => (current = { ...current, ownBeats: [] }),
      () => (current = { ...current, turn: null }),
      () => (current = { ...current, result: null }),
      () => (current = { ...current, typingAt: null }),
      () => (current = { ...current, quietSince: NOW }),
    ]
    order.push(desired(current, currentWords, NOW).name)
    for (const step of peel) {
      step()
      order.push(desired(current, currentWords, NOW).name)
    }
    expect(order).toEqual([
      'panic',
      'snack',
      'explaining',
      'shrug',
      'thinking',
      'shrug',
      'impatient',
      'sleep',
      'idle',
    ])
  })
})

describe('breaksHold()', () => {
  const want = (name: PoseState['name']) => ({
    name,
    status: '',
    meta: '',
    isStill: false,
    beat: null,
  })

  test('Panic cuts in at once', () => {
    expect(breaksHold(want('panic'), shown({ name: 'thinking' }), words())).toBe(true)
  })

  test('Snack ends the moment the words arrive', () => {
    const snack = shown({ name: 'snack' })
    expect(breaksHold(want('explaining'), snack, words({ phase: 'streaming' }))).toBe(true)
    expect(breaksHold(want('shrug'), snack, words({ phase: 'failed' }))).toBe(true)
    expect(breaksHold(want('thinking'), snack, words({ phase: 'chewing' }))).toBe(false)
  })

  test('Anything else waits out the hold', () => {
    expect(breaksHold(want('thinking'), shown({ name: 'impatient' }), words())).toBe(false)
    expect(breaksHold(want('impatient'), shown({ name: 'sleep' }), words())).toBe(false)
    expect(breaksHold(want('happy'), shown({ name: 'explaining' }), words())).toBe(false)
  })
})

describe('nextWakeAt()', () => {
  test('The nearest moment the answer could change', () => {
    const pose = shown({ holdUntil: NOW + 1500 })
    const typing = facts({ typingAt: NOW - 500 })
    expect(nextWakeAt(typing, words(), pose, NOW)).toBe(NOW + 1000)
    expect(nextWakeAt(facts(), words(), pose, NOW)).toBe(NOW + 1500)
  })

  test('Explaining, the result and sleep each wake him', () => {
    const past = shown({ holdUntil: NOW - 1 })
    const landed = words({ phase: 'done', explainedAt: NOW - 500 })
    expect(nextWakeAt(facts(), landed, past, NOW)).toBe(NOW + EXPLAIN_MS - 500)
    const result = facts({ result: { ...happy, endedAt: NOW - 1000 } })
    expect(nextWakeAt(result, words(), past, NOW)).toBe(NOW - 1000 + RESULT_MS)
    expect(nextWakeAt(facts(), words(), past, NOW)).toBe(NOW - 1000 + SLEEP_MS)
  })

  test('A question for you waits on you, not the clock', () => {
    const past = shown({ holdUntil: NOW - 1 })
    const waiting = facts({ result: asks, quietSince: NOW - SLEEP_MS - 1 })
    expect(nextWakeAt(waiting, words(), past, NOW)).toBeNull()
  })
})
