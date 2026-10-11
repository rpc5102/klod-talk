// The director's pure parts: desired() over a table of facts, the tool
// poses, breaksHold() and the next wake time. Lines come from the
// prototypes (A2, A3, the A4 tool session) and the samples.

import { describe, expect, test } from 'claude-code/testing'

import type { CaveWords, PoseState, RunningTool, SessionFacts, TurnResult } from '../types'
import { EMPTY_CAVE, EMPTY_FACTS, FIRST_POSE } from '../hooks/atoms'
import {
  DANCE_MS,
  EXPLAIN_MS,
  PILATES_MS,
  RESULT_MS,
  SLEEP_MS,
  TYPING_MS,
  breaksHold,
  desired,
  nextWakeAt,
} from '../hooks/director'
import { newTurn } from '../hooks/tracker'
import { A2, A3, A4, STATUS_LINES } from './fixtures'

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

const turn = newTurn('turn-1', NOW - 3000)
const happy: TurnResult = { pose: 'happy', why: 'done', asksUser: false, failedRun: null, endedAt: NOW - 1000 }
const asks: TurnResult = { pose: 'shrug', why: 'asks', asksUser: true, failedRun: null, endedAt: NOW - 1000 }
const source = { id: 'turn-1', text: 'An answer.', level: 'caveman' } as const
const a4 = (id: string) => A4.scenes.find(scene => scene.id === id)!

function running(over: Partial<RunningTool> = {}): RunningTool {
  return { toolUseId: 'toolu_1', tool: 'Bash', kind: 'other', summary: 'ls', startedAt: NOW - 100, ...over }
}

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

  test('Thinking while a turn runs, and for a quick tool with no pose of its own', () => {
    expect(desired(facts({ turn }), words(), NOW).name).toBe('thinking')
    expect(desired(facts({ turn, running: [running()] }), words(), NOW).name).toBe('thinking')
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
    const why = words({ phase: 'failed', problem: 'API error 404, model not found' })
    expect(desired(facts({ ownBeats: [beat] }), why, NOW).meta).toBe(
      'Translation failed: API error 404, model not found',
    )
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
    const error: TurnResult = { pose: 'shrug', why: 'error', asksUser: false, failedRun: null, endedAt: NOW }
    expect(desired(facts({ result: error }), words(), NOW).meta).toBe('The turn ended on an API error')
    const refusal: TurnResult = { ...error, why: 'refusal' }
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
      permissionWait: { tool: 'Bash', since: NOW - 10, isQuestion: false },
      ownBeats: [{ name: 'failed', lengthMs: 2000 }],
      turn,
      running: [running({ tool: 'Read', kind: 'read' })],
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
      () => (current = { ...current, permissionWait: null }),
      () => (currentWords = words({ phase: 'streaming', source })),
      () => (currentWords = words({ phase: 'done', source })),
      () => (current = { ...current, ownBeats: [] }),
      () => (current = { ...current, running: [] }),
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
      'sign',
      'snack',
      'explaining',
      'shrug',
      'read',
      'thinking',
      'shrug',
      'impatient',
      'sleep',
      'idle',
    ])
  })
})

describe('tool poses', () => {
  const pose = (tool: RunningTool, over: Partial<SessionFacts> = {}) =>
    desired(facts({ turn, running: [tool], ...over }), words(), NOW)

  test('Read, Hunt and Shout copy what Claude is looking at', () => {
    const read = pose(running({ tool: 'Read', kind: 'read', summary: 'src/billing/invoice.py' }))
    expect(read).toMatchObject({ name: 'read', status: a4('read').status, meta: a4('read').meta })
    const hunt = pose(running({ tool: 'Grep', kind: 'search', summary: 'Grep' }))
    expect(hunt).toMatchObject({ name: 'hunt', status: a4('hunt').status, meta: a4('hunt').meta })
    expect(pose(running({ kind: 'search', summary: 'rg' })).meta).toBe('Claude ran rg')
    const shout = pose(running({ tool: 'WebSearch', kind: 'web', summary: 'pytest freeze time' }))
    expect(shout).toMatchObject({ name: 'shout', status: a4('shout').status, meta: a4('shout').meta })
    expect(pose(running({ tool: 'WebFetch', kind: 'web', summary: 'docs.python.org' })).meta).toBe(
      'Claude fetched docs.python.org',
    )
  })

  test('Carve counts the files the turn edited', () => {
    const edits = { ...turn, edited: ['src/billing/invoice.py', 'tests/billing/test_invoice.py'] }
    const carve = pose(running({ tool: 'Edit', kind: 'edit', summary: 'tests/billing/test_invoice.py' }), { turn: edits })
    expect(carve).toMatchObject({ name: 'carve', status: a4('carve').status, meta: a4('carve').meta })
    const one = pose(running({ tool: 'Edit', kind: 'edit' }), { turn: { ...turn, edited: ['a.py'] } })
    expect(one.meta).toBe('Claude edited 1 file')
  })

  test('An edit right after a failed test or build run is Bonk', () => {
    const failed = { ...turn, lastRunFailed: true, lastRunKind: 'test' as const }
    const bonk = pose(running({ tool: 'Edit', kind: 'edit' }), { turn: failed })
    expect(bonk).toMatchObject({ name: 'bonk', status: STATUS_LINES['bonk']! })
    const fixed = { ...turn, lastRunFailed: false, lastRunKind: 'test' as const }
    expect(pose(running({ tool: 'Edit', kind: 'edit' }), { turn: fixed }).name).toBe('carve')
  })

  test('Tests, builds and deploys strike flint; any command past 30 s dances', () => {
    for (const kind of ['test', 'build', 'deploy'] as const) {
      const flint = pose(running({ kind, summary: 'pytest' }))
      expect(flint).toMatchObject({ name: 'flint', status: a4('test').status, meta: a4('test').meta })
      expect(pose(running({ kind, startedAt: NOW - DANCE_MS + 1 })).name).toBe('flint')
      const dance = pose(running({ kind, summary: 'gh run watch', startedAt: NOW - DANCE_MS }))
      expect(dance).toMatchObject({ name: 'dance', status: a4('ci').status })
    }
    expect(pose(running({ kind: 'other', startedAt: NOW - DANCE_MS })).name).toBe('dance')
    expect(pose(running({ kind: 'install', startedAt: NOW - DANCE_MS })).name).toBe('dance')
  })

  test('Anything else thinks under 5 s and does Pilates past it; only Bash dances', () => {
    expect(pose(running({ kind: 'install', startedAt: NOW - PILATES_MS + 1 })).name).toBe('thinking')
    const pilates = pose(running({ kind: 'install', startedAt: NOW - PILATES_MS }))
    expect(pilates).toMatchObject({ name: 'pilates', status: STATUS_LINES['pilates']! })
    const mcp = running({ tool: 'mcp__db__query', kind: 'other', summary: 'mcp__db__query', startedAt: NOW - DANCE_MS })
    expect(pose(mcp).name).toBe('pilates')
  })

  test('The newest running tool decides', () => {
    const older = running({ toolUseId: 'toolu_1', tool: 'Read', kind: 'read' })
    const newer = running({ toolUseId: 'toolu_2', tool: 'Grep', kind: 'search' })
    expect(desired(facts({ turn, running: [older, newer] }), words(), NOW).name).toBe('hunt')
  })

  test('A shown dialog is Sign, over the tools and the words', () => {
    const wait = { tool: 'Bash', since: NOW - 10, isQuestion: false }
    const sign = desired(facts({ turn, running: [running()], permissionWait: wait }), words({ phase: 'chewing', source }), NOW)
    expect(sign).toMatchObject({ name: 'sign', status: a4('ask').status, meta: a4('ask').meta })
  })

  test('Claude asking you something through a dialog is Shrug', () => {
    const wait = { tool: 'AskUserQuestion', since: NOW - 10, isQuestion: true }
    const shrug = desired(facts({ turn, permissionWait: wait }), words(), NOW)
    expect(shrug).toMatchObject({ name: 'shrug', status: STATUS_LINES['shrug']!, meta: 'Claude asked you something' })
  })

  test('With jokes off, Sign still shows, in plain words and still', () => {
    const wait = { tool: 'Bash', since: NOW - 10, isQuestion: false }
    const sign = desired(facts({ jokesOff: true, permissionWait: wait }), words(), NOW)
    expect(sign).toMatchObject({ name: 'sign', isStill: true, status: 'Permission needed.' })
    expect(sign.status).not.toBe(a4('ask').status)
  })

  test('A failed test run is Panic for its 2 s, with what failed in plain words', () => {
    const panic = desired(facts({ turn, panicUntil: NOW + 1, panicWhy: 'test' }), words(), NOW)
    expect(panic).toMatchObject({ name: 'panic', status: STATUS_LINES['panic']!, meta: 'A test run failed' })
    expect(desired(facts({ panicUntil: NOW + 1, panicWhy: 'build' }), words(), NOW).meta).toBe('A build failed')
    expect(desired(facts({ panicUntil: NOW + 1, panicWhy: 'deploy' }), words(), NOW).meta).toBe('A deploy failed')
  })

  test('The turn ends on Campfire for a big win, Shrug when the last run failed', () => {
    const win: TurnResult = { ...happy, pose: 'campfire', why: 'win' }
    expect(desired(facts({ result: win }), words(), NOW)).toMatchObject({
      name: 'campfire',
      status: STATUS_LINES['campfire']!,
    })
    const failed: TurnResult = { ...happy, pose: 'shrug', why: 'failed', failedRun: 'test' }
    expect(desired(facts({ result: failed }), words(), NOW)).toMatchObject({
      name: 'shrug',
      meta: 'The last test run failed',
    })
    const broke: TurnResult = { ...failed, failedRun: 'build' }
    expect(desired(facts({ result: broke }), words(), NOW).meta).toBe('The last build failed')
  })
})

describe('breaksHold()', () => {
  const want = (name: PoseState['name']) => ({
    name,
    status: '',
    meta: '',
    isStill: false,
    beat: null,
    cutsIn: name === 'sign',
  })

  test('Panic cuts in at once', () => {
    expect(breaksHold(want('panic'), shown({ name: 'thinking' }), words())).toBe(true)
  })

  test('Claude’s question through a dialog cuts in too; a turn’s Shrug does not', () => {
    const question = desired(facts({ turn, permissionWait: { tool: 'AskUserQuestion', since: NOW, isQuestion: true } }), words(), NOW)
    expect(question).toMatchObject({ name: 'shrug', cutsIn: true })
    expect(breaksHold(question, shown({ name: 'carve' }), words())).toBe(true)
    const result = desired(facts({ result: asks }), words(), NOW)
    expect(result).toMatchObject({ name: 'shrug', cutsIn: false })
    expect(breaksHold(result, shown({ name: 'explaining' }), words())).toBe(false)
  })

  test('Sign cuts in at once: a dialog is waiting on you', () => {
    expect(breaksHold(want('sign'), shown({ name: 'carve' }), words())).toBe(true)
    expect(breaksHold(want('sign'), shown({ name: 'explaining' }), words({ phase: 'streaming' }))).toBe(true)
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

  test('A running tool wakes him as it crosses 5 and 30 s', () => {
    const past = shown({ holdUntil: NOW - 1 })
    const busy = facts({ turn, running: [running({ startedAt: NOW - 1000 })] })
    expect(nextWakeAt(busy, words(), past, NOW)).toBe(NOW - 1000 + PILATES_MS)
    const long = facts({ turn, running: [running({ startedAt: NOW - 6000 })] })
    expect(nextWakeAt(long, words(), past, NOW)).toBe(NOW - 6000 + DANCE_MS)
  })

  test('A question for you waits on you, not the clock', () => {
    const past = shown({ holdUntil: NOW - 1 })
    const waiting = facts({ result: asks, quietSince: NOW - SLEEP_MS - 1 })
    expect(nextWakeAt(waiting, words(), past, NOW)).toBeNull()
  })
})
