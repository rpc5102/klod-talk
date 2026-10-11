// Session facts: the turn, the running tools, the dialog waiting on you, how
// the last turn ended, the typing and quiet clocks. The tracker is the only
// writer of the session atom. Each fact change is a pure function of the
// facts, so it can be tested without an engine; the port's changeFacts
// writes one.

import type { Beat, RunKind, SessionFacts, ToolKind, TurnFacts, TurnResult } from '../types'
import { EMPTY_FACTS } from './atoms'
import { withoutFences } from './reply'

export type Change = (facts: SessionFacts) => SessionFacts

/** Panic shows at least this long. */
export const PANIC_MS = 2000
/** How long the "translation failed" beat plays. */
export const FAILED_BEAT_MS = 2000

export type TurnEndReason = 'answer' | 'aborted' | 'refusal' | 'error'

/** The tools whose dialog is Claude asking you something: Shrug, not Sign. */
export const QUESTION_TOOLS: readonly string[] = ['AskUserQuestion', 'ExitPlanMode']

/** A new turn's facts. */
export function newTurn(id: string, now: number): TurnFacts {
  return { id, startedAt: now, lastRunFailed: false, lastRunKind: null, isBigWin: false, edited: [] }
}

/**
 * After a reload into facts an older build wrote: every field this build
 * reads is there. Facts already whole come back as they are.
 */
export function upgraded(): Change {
  return facts => {
    const turn = facts.turn === null ? null : { ...newTurn(facts.turn.id, facts.turn.startedAt), ...facts.turn }
    const running = facts.running.map(one => ({ ...one, kind: one.kind ?? 'other', summary: one.summary ?? one.tool }))
    return { ...EMPTY_FACTS, ...facts, turn, running }
  }
}

/** The session opened: the quiet clock starts. Not applied on a reload. */
export function opened(now: number): Change {
  return facts => ({ ...facts, quietSince: now })
}

export function typed(now: number): Change {
  return facts => ({ ...facts, typingAt: now, quietSince: now })
}

/** A press in the pane: a real event for the quiet clock. */
export function pressed(now: number): Change {
  return facts => ({ ...facts, quietSince: now })
}

/** A prompt went in: a question waiting for you is answered. */
export function prompted(now: number): Change {
  return facts => ({ ...facts, typingAt: null, result: null, quietSince: now })
}

export function turnStarted(id: string, now: number): Change {
  return facts => ({
    ...facts,
    turn: newTurn(id, now),
    result: null,
    typingAt: null,
    quietSince: now,
  })
}

/** What the tool.call hook knows of a call as it starts. */
export type Started = {
  toolUseId: string
  tool: string
  kind: ToolKind
  summary: string
  /** The file an edit touches, for "Claude edited 2 files"; null otherwise. */
  file: string | null
}

export function toolStarted(call: Started, now: number): Change {
  return facts => {
    const { toolUseId, tool, kind, summary, file } = call
    const turn =
      facts.turn !== null && kind === 'edit' && file !== null && !facts.turn.edited.includes(file)
        ? { ...facts.turn, edited: [...facts.turn.edited, file] }
        : facts.turn
    return {
      ...facts,
      turn,
      running: [
        ...facts.running.filter(one => one.toolUseId !== toolUseId),
        { toolUseId, tool, kind, summary, startedAt: now },
      ],
      quietSince: now,
    }
  }
}

function isRun(kind: ToolKind): kind is RunKind {
  return kind === 'test' || kind === 'build' || kind === 'deploy'
}

/**
 * A main-loop call settled. A failed test, build or deploy run shows Panic for 2 s
 * and is remembered for Bonk and the turn's Shrug; a deploy that worked makes
 * the turn a big win. Its dialog, if one was up, is closed.
 */
export function toolEnded(
  toolUseId: string,
  tool: string,
  kind: ToolKind,
  outcome: { isError: boolean; wasDenied: boolean },
  now: number,
): Change {
  return facts => {
    const ran = !outcome.wasDenied
    const failed = ran && outcome.isError
    let { turn, panicUntil, panicWhy } = facts
    if (turn !== null && ran && isRun(kind)) {
      turn = { ...turn, lastRunFailed: failed, lastRunKind: kind }
    }
    if (turn !== null && ran && !failed && kind === 'deploy') {
      turn = { ...turn, isBigWin: true }
    }
    if (failed && isRun(kind)) {
      panicUntil = now + PANIC_MS
      panicWhy = kind
    }
    return {
      ...facts,
      turn,
      panicUntil,
      panicWhy,
      running: facts.running.filter(one => one.toolUseId !== toolUseId),
      lastTool: { tool, kind, endedAt: now, ...outcome },
      permissionWait: facts.permissionWait?.tool === tool ? null : facts.permissionWait,
      quietSince: now,
    }
  }
}

/**
 * A dialog is about to show: a permission ask gives Sign; AskUserQuestion
 * and ExitPlanMode are Claude asking you something, which gives Shrug.
 */
export function permissionAsked(tool: string, now: number): Change {
  return facts => ({
    ...facts,
    permissionWait: { tool, since: now, isQuestion: QUESTION_TOOLS.includes(tool) },
    quietSince: now,
  })
}

/**
 * A call's progress row is drawn: it was approved and is running, so its
 * dialog is closed and its age counts from now. Facts with no dialog for it
 * come back unchanged.
 */
export function toolRunning(toolUseId: string, now: number): Change {
  return facts => {
    const wait = facts.permissionWait
    const call = facts.running.find(one => one.toolUseId === toolUseId)
    if (wait === null || call === undefined || call.tool !== wait.tool) {
      return facts
    }
    return {
      ...facts,
      permissionWait: null,
      running: facts.running.map(one => (one === call ? { ...one, startedAt: now } : one)),
      quietSince: now,
    }
  }
}

/** A subagent's call settled: a dialog it raised is closed. */
export function dialogSettled(tool: string, now: number): Change {
  return facts =>
    facts.permissionWait?.tool === tool ? { ...facts, permissionWait: null, quietSince: now } : facts
}

/**
 * The main loop's turn ended. An answer ends on Campfire for a big win,
 * Happy if everything passed, or Shrug when it asks you something or the
 * last test or build run failed; an interrupt goes straight to Idle; an API
 * error shows Panic and then Shrug; a refusal shows Shrug.
 */
export function turnEnded(reason: TurnEndReason, answer: string, now: number): Change {
  return facts => {
    const ended: SessionFacts = { ...facts, turn: null, running: [], permissionWait: null, quietSince: now }
    const result = (pose: TurnResult['pose'], why: TurnResult['why'], failedRun: RunKind | null = null): TurnResult => ({
      pose,
      why,
      asksUser: why === 'asks',
      failedRun,
      endedAt: now,
    })
    const turn = facts.turn

    switch (reason) {
      case 'answer':
        if (asksUser(answer)) {
          return { ...ended, result: result('shrug', 'asks') }
        }
        if (turn !== null && turn.lastRunFailed) {
          return { ...ended, result: result('shrug', 'failed', turn.lastRunKind) }
        }
        return { ...ended, result: turn !== null && turn.isBigWin ? result('campfire', 'win') : result('happy', 'done') }
      case 'aborted':
        return { ...ended, result: null }
      case 'refusal':
        return { ...ended, result: result('shrug', 'refusal') }
      case 'error':
        return { ...ended, panicUntil: now + PANIC_MS, panicWhy: 'error', result: result('shrug', 'error') }
    }
  }
}

/** The translation failed: Shrug and "Me brain hurt." as an own beat. */
export function translationFailed(): Change {
  return facts => ({
    ...facts,
    ownBeats: [...facts.ownBeats, { name: 'failed', lengthMs: FAILED_BEAT_MS }],
  })
}

/** A beat's time is up: it leaves its queue. */
export function beatFinished(name: Beat['name']): Change {
  return facts => {
    const index = facts.ownBeats.findIndex(beat => beat.name === name)
    if (index === -1) {
      return facts
    }

    return { ...facts, ownBeats: facts.ownBeats.filter((_, at) => at !== index) }
  }
}

/** An answer was about real damage: no jokes for the rest of the session. */
export function jokesOff(): Change {
  return facts => ({ ...facts, jokesOff: true, ownBeats: [] })
}

/** A /clear: the facts start over. */
export function reset(now: number): Change {
  return () => ({ ...EMPTY_FACTS, quietSince: now })
}

/**
 * Whether Claude's answer ends by asking you something: its last line of
 * prose, fenced code left out, ends in a question mark.
 */
export function asksUser(answer: string): boolean {
  const lines = withoutFences(answer).split('\n')
  const last = lines.filter(line => line.trim() !== '').pop() ?? ''

  return /\?[\s*_)"'”]*$/.test(last)
}
