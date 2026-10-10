// Session facts: the turn, the running tools, how the last turn ended, the
// typing and quiet clocks. The tracker is the only writer of the session
// atom. Each fact change is a pure function of the facts, so it can be
// tested without an engine; the port's changeFacts writes one.

import type { Beat, SessionFacts, TurnResult } from '../types'
import { EMPTY_FACTS } from './atoms'
import { withoutFences } from './reply'

export type Change = (facts: SessionFacts) => SessionFacts

/** Panic shows at least this long. */
export const PANIC_MS = 2000
/** How long the "translation failed" beat plays. */
export const FAILED_BEAT_MS = 2000

export type TurnEndReason = 'answer' | 'aborted' | 'refusal' | 'error'

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
    turn: { id, startedAt: now },
    result: null,
    typingAt: null,
    quietSince: now,
  })
}

export function toolStarted(toolUseId: string, tool: string, now: number): Change {
  return facts => ({
    ...facts,
    running: [
      ...facts.running.filter(one => one.toolUseId !== toolUseId),
      { toolUseId, tool, startedAt: now },
    ],
    quietSince: now,
  })
}

export function toolEnded(
  toolUseId: string,
  tool: string,
  outcome: { isError: boolean; wasDenied: boolean },
  now: number,
): Change {
  return facts => ({
    ...facts,
    running: facts.running.filter(one => one.toolUseId !== toolUseId),
    lastTool: { tool, endedAt: now, ...outcome },
    quietSince: now,
  })
}

/**
 * The main loop's turn ended. An answer ends on Happy, or Shrug when it asks
 * you something; an interrupt goes straight to Idle; an API error shows
 * Panic and then Shrug; a refusal shows Shrug.
 */
export function turnEnded(reason: TurnEndReason, answer: string, now: number): Change {
  return facts => {
    const ended: SessionFacts = { ...facts, turn: null, running: [], quietSince: now }
    const shrug = (why: TurnResult['why']): TurnResult => ({
      pose: 'shrug',
      why,
      asksUser: why === 'asks',
      endedAt: now,
    })

    switch (reason) {
      case 'answer':
        return {
          ...ended,
          result: asksUser(answer)
            ? shrug('asks')
            : { pose: 'happy', why: 'done', asksUser: false, endedAt: now },
        }
      case 'aborted':
        return { ...ended, result: null }
      case 'refusal':
        return { ...ended, result: shrug('refusal') }
      case 'error':
        return { ...ended, panicUntil: now + PANIC_MS, result: shrug('error') }
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
