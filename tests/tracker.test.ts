// The tracker's fact changes for Phase 2, as pure functions: runs that fail,
// deploys that work, the dialog waiting on you, and facts an older build
// wrote coming back whole after a reload.

import { describe, expect, test } from 'claude-code/testing'

import type { SessionFacts } from '../types'
import { EMPTY_FACTS } from '../hooks/atoms'
import type { Started } from '../hooks/tracker'
import {
  PANIC_MS,
  dialogSettled,
  newTurn,
  permissionAsked,
  toolEnded,
  toolRunning,
  toolStarted,
  turnEnded,
  turnStarted,
  upgraded,
} from '../hooks/tracker'

const NOW = 1_000_000
const ok = { isError: false, wasDenied: false }
const error = { isError: true, wasDenied: false }
const denied = { isError: false, wasDenied: true }

function inTurn(): SessionFacts {
  return turnStarted('turn-1', NOW - 5000)({ ...EMPTY_FACTS })
}

function call(over: Partial<Started> = {}): Started {
  return { toolUseId: 'toolu_1', tool: 'Bash', kind: 'test', summary: 'pytest', file: null, ...over }
}

describe('runs', () => {
  test('a failed test run is Panic for 2 s and is remembered for Bonk and the result', () => {
    const facts = toolEnded('toolu_1', 'Bash', 'test', error, NOW)(toolStarted(call(), NOW - 100)(inTurn()))
    expect(facts.panicUntil).toBe(NOW + PANIC_MS)
    expect(facts.panicWhy).toBe('test')
    expect(facts.turn).toMatchObject({ lastRunFailed: true, lastRunKind: 'test' })
    expect(facts.running).toEqual([])
    const ended = turnEnded('answer', 'Three tests fail.', NOW + 10)(facts)
    expect(ended.result).toMatchObject({ pose: 'shrug', why: 'failed', failedRun: 'test' })
  })

  test('a later run that passes clears it', () => {
    let facts = toolEnded('toolu_1', 'Bash', 'build', error, NOW)(inTurn())
    facts = toolEnded('toolu_2', 'Bash', 'build', ok, NOW + 10)(facts)
    expect(facts.turn).toMatchObject({ lastRunFailed: false, lastRunKind: 'build' })
    expect(turnEnded('answer', 'Built.', NOW + 20)(facts).result?.pose).toBe('happy')
  })

  test('a failed deploy is a failed run too', () => {
    const facts = toolEnded('toolu_1', 'Bash', 'deploy', error, NOW)(inTurn())
    expect(facts).toMatchObject({ panicUntil: NOW + PANIC_MS, panicWhy: 'deploy' })
    expect(facts.turn).toMatchObject({ lastRunFailed: true, lastRunKind: 'deploy', isBigWin: false })
    expect(turnEnded('answer', 'Push failed.', NOW + 10)(facts).result).toMatchObject({ pose: 'shrug', failedRun: 'deploy' })
  })

  test('other kinds failing are no Panic, and a denied run is no run', () => {
    expect(toolEnded('toolu_1', 'Bash', 'other', error, NOW)(inTurn()).panicUntil).toBe(0)
    const refused = toolEnded('toolu_1', 'Bash', 'test', denied, NOW)(inTurn())
    expect(refused.panicUntil).toBe(0)
    expect(refused.turn?.lastRunKind).toBeNull()
  })

  test('a deploy that worked ends the turn on Campfire; a question still wins', () => {
    const facts = toolEnded('toolu_1', 'Bash', 'deploy', ok, NOW)(inTurn())
    expect(facts.turn?.isBigWin).toBe(true)
    expect(turnEnded('answer', 'Shipped.', NOW + 10)(facts).result).toMatchObject({ pose: 'campfire', why: 'win' })
    expect(turnEnded('answer', 'Shipped. Tag it too?', NOW + 10)(facts).result?.why).toBe('asks')
    expect(toolEnded('toolu_1', 'Bash', 'deploy', error, NOW)(inTurn()).turn?.isBigWin).toBe(false)
  })

  test('edits count each file once', () => {
    let facts = inTurn()
    for (const file of ['a.py', 'b.py', 'a.py']) {
      facts = toolStarted(call({ tool: 'Edit', kind: 'edit', summary: file, file }), NOW)(facts)
    }
    expect(facts.turn?.edited).toEqual(['a.py', 'b.py'])
  })
})

describe('dialogs', () => {
  test('a permission ask waits until its call settles', () => {
    let facts = toolStarted(call({ kind: 'install' }), NOW)(inTurn())
    facts = permissionAsked('Bash', NOW + 1)(facts)
    expect(facts.permissionWait).toEqual({ tool: 'Bash', since: NOW + 1, isQuestion: false })
    facts = toolEnded('toolu_1', 'Bash', 'install', denied, NOW + 2)(facts)
    expect(facts.permissionWait).toBeNull()
  })

  test('AskUserQuestion and ExitPlanMode are questions', () => {
    expect(permissionAsked('AskUserQuestion', NOW)(inTurn()).permissionWait?.isQuestion).toBe(true)
    expect(permissionAsked('ExitPlanMode', NOW)(inTurn()).permissionWait?.isQuestion).toBe(true)
    expect(permissionAsked('mcp__db__query', NOW)(inTurn()).permissionWait?.isQuestion).toBe(false)
  })

  test('the asking call’s progress row ends it and restarts the call’s age', () => {
    let facts = toolStarted(call({ kind: 'other' }), NOW)(inTurn())
    facts = permissionAsked('Bash', NOW)(facts)
    const other = toolRunning('toolu_9', NOW + 3000)(facts)
    expect(other).toBe(facts)
    const running = toolRunning('toolu_1', NOW + 3000)(facts)
    expect(running.permissionWait).toBeNull()
    expect(running.running[0]?.startedAt).toBe(NOW + 3000)
    // With no dialog up, a progress row changes nothing.
    expect(toolRunning('toolu_1', NOW + 4000)(running)).toBe(running)
  })

  test('a subagent’s call settling closes the dialog it raised; the turn ending closes any', () => {
    const asked = permissionAsked('WebFetch', NOW)(inTurn())
    expect(dialogSettled('Bash', NOW)(asked)).toBe(asked)
    expect(dialogSettled('WebFetch', NOW)(asked).permissionWait).toBeNull()
    expect(turnEnded('aborted', '', NOW)(asked).permissionWait).toBeNull()
  })
})

describe('upgraded()', () => {
  test('facts an older build wrote get every field this build reads', () => {
    const old = {
      turn: { id: 'turn-1', startedAt: NOW },
      running: [{ toolUseId: 'toolu_1', tool: 'Read', startedAt: NOW }],
      lastTool: null,
      result: null,
      panicUntil: 0,
      ownBeats: [],
      typingAt: null,
      quietSince: NOW,
      jokesOff: false,
    } as unknown as SessionFacts
    const facts = upgraded()(old)
    expect(facts.permissionWait).toBeNull()
    expect(facts.panicWhy).toBe('error')
    expect(facts.turn).toEqual(newTurn('turn-1', NOW))
    expect(facts.running[0]).toEqual({ toolUseId: 'toolu_1', tool: 'Read', kind: 'other', summary: 'Read', startedAt: NOW })
  })

  test('whole facts come back as they were', () => {
    const facts = toolStarted(call(), NOW)(inTurn())
    expect(upgraded()(facts)).toEqual(facts)
  })
})
