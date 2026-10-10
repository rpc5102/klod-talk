// The pose director: turns session facts into one pose at a time. The
// louder trigger wins, every pose holds 2 s, and quiet steps down to Idle
// and Sleep. It is level-triggered: it asks what should show now, so missed
// poses are skipped, never replayed. One wake timer; nothing polls.
//
// Phase 1 has nine poses: Idle, Impatient, Thinking, Snack, Explaining,
// Happy, Shrug, Panic and Sleep. Every tool shows Thinking until Phase 2.

import type { Timer } from 'claude-code'

import type { Beat, CaveWords, PoseName, PoseState, SessionFacts, TurnResult } from '../types'
import type { Port } from './port'
import { levelInfo } from './settings'
import * as sprites from './sprites'
import * as tracker from './tracker'

/** Every pose holds at least this long. */
export const HOLD_MS = 2000
/** Explaining stays this long after the last paragraph lands. */
export const EXPLAIN_MS = 2000
/** The result holds this many quiet seconds, then Idle. */
export const RESULT_MS = 60_000
/** A keystroke this recent shows Impatient. */
export const TYPING_MS = 1500
/** Quiet this long shows Sleep. */
export const SLEEP_MS = 20 * 60_000

export type Want = {
  name: PoseName
  status: string
  meta: string
  isStill: boolean
  beat: Beat | null
}

/** His line, then what happened in plain words. */
type Lines = readonly [status: string, meta: string]

const LINES = {
  idle: ['Me wait. Me watch.', 'Nothing happening'],
  impatient: ['Hurry. Mammoth not wait.', 'You are typing…'],
  thinking: ['Smart rock thinking…', 'Claude is working'],
  snack: ['Me chew big words…', 'Turning Claude’s answer into cave talk'],
  happy: ['All green. Me happy.', 'Claude finished'],
  panic: ['AAAAH. Rock broke.', 'Claude hit an API error'],
  sleep: ['Zzz… mammoth… zzz', 'Quiet for 20 minutes'],
  failed: ['Me brain hurt.', 'Cave Talk could not reach its model'],
  jokesOff: ['No jokes for this one.', 'Claude’s answer in the chat has the steps.'],
} as const satisfies Record<string, Lines>

const EXPLAINING_META = 'Cave version of Claude’s answer'

const SHRUG: Record<TurnResult['why'], Lines> = {
  done: ['Me not know.', 'Claude finished'],
  asks: ['Me not know.', 'Claude asked you something'],
  refusal: ['Me not know.', 'Claude declined this one'],
  error: ['Me not know.', 'The turn ended on an API error'],
}

function want(name: PoseName, [status, meta]: Lines, extra: Partial<Want> = {}): Want {
  return { name, status, meta, isStill: false, beat: null, ...extra }
}

/** What should show now, by priority. Pure: facts, words and the time in. */
export function desired(facts: SessionFacts, words: CaveWords, now: number): Want {
  if (facts.jokesOff) {
    return want('idle', LINES.jokesOff, { isStill: true })
  }
  if (now < facts.panicUntil) {
    return want('panic', LINES.panic)
  }
  if (words.phase === 'chewing') {
    return want('snack', LINES.snack)
  }
  if (
    words.phase === 'streaming' ||
    (words.explainedAt > 0 && now < words.explainedAt + EXPLAIN_MS)
  ) {
    const level = levelInfo(words.source?.level ?? 'caveman')
    return want('explaining', [level.status, EXPLAINING_META])
  }
  const beat = facts.ownBeats[0]
  if (beat !== undefined) {
    return want('shrug', LINES.failed, { beat })
  }
  if (facts.turn !== null) {
    return want('thinking', LINES.thinking)
  }
  const result = facts.result
  if (result !== null && (now < result.endedAt + RESULT_MS || result.asksUser)) {
    return result.pose === 'happy' ? want('happy', LINES.happy) : want('shrug', SHRUG[result.why])
  }
  if (facts.typingAt !== null && now - facts.typingAt < TYPING_MS) {
    return want('impatient', LINES.impatient)
  }
  if (now >= facts.quietSince + SLEEP_MS) {
    return want('sleep', LINES.sleep)
  }

  return want('idle', LINES.idle)
}

/** The exceptions to the 2-second hold. */
export function breaksHold(next: Want, current: PoseState, words: CaveWords): boolean {
  // Panic cuts in at once, even mid-hold.
  if (next.name === 'panic') {
    return true
  }
  // Snack ends the moment the words arrive.
  if (current.name === 'snack' && words.phase !== 'chewing') {
    return true
  }

  return false
}

export function isOnScreen(next: Want, current: PoseState): boolean {
  return (
    next.name === current.name &&
    (next.beat?.name ?? null) === current.beat &&
    next.isStill === current.isStill
  )
}

/**
 * The next moment the answer could change on its own: a hold or a beat
 * ending, Panic ending, Explaining ending, 60 s after a turn, the end of
 * typing, 20 quiet minutes. Null when nothing is due.
 */
export function nextWakeAt(
  facts: SessionFacts,
  words: CaveWords,
  current: PoseState,
  now: number,
): number | null {
  const times = [
    current.holdUntil,
    current.beat !== null ? current.beatUntil : 0,
    facts.panicUntil,
    words.explainedAt > 0 ? words.explainedAt + EXPLAIN_MS : 0,
    facts.result !== null && !facts.result.asksUser ? facts.result.endedAt + RESULT_MS : 0,
    facts.typingAt !== null ? facts.typingAt + TYPING_MS : 0,
    facts.quietSince + SLEEP_MS,
  ].filter(time => time > now)

  return times.length === 0 ? null : Math.min(...times)
}

let wake: Timer | null = null

/** Puts an evaluation on the lane. */
export function evaluateSoon(port: Port): Promise<void> {
  return port.work(() => evaluate(port))
}

/** On every fact change and from the wake timer. Runs on the lane. */
export async function evaluate(port: Port): Promise<void> {
  const now = await port.now()
  let facts = await port.facts()
  const words = await port.words()
  const shown = await port.pose()
  let current = shown

  // A beat's time is up: it leaves its queue.
  if (current.beat !== null && now >= current.beatUntil) {
    facts = await port.changeFacts(tracker.beatFinished(current.beat))
    current = { ...current, beat: null, beatUntil: 0 }
  }

  const next = desired(facts, words, now)
  if (isOnScreen(next, current)) {
    current = { ...current, status: next.status, meta: next.meta }
  } else if (now >= current.holdUntil || breaksHold(next, current, words)) {
    current = {
      name: next.name,
      since: now,
      holdUntil: now + HOLD_MS,
      beat: next.beat?.name ?? null,
      beatUntil: next.beat !== null ? now + next.beat.lengthMs : 0,
      status: next.status,
      meta: next.meta,
      isStill: next.isStill,
    }
  }

  if (!samePoseState(current, shown)) {
    await port.setPose(current)
  }
  if (current.name !== shown.name || current.isStill !== shown.isStill) {
    sprites.show(port, current)
  }

  wake?.cancel()
  wake = null
  const at = nextWakeAt(facts, words, current, now)
  if (at !== null) {
    wake = port.after(Math.max(1, at - now), () => {
      void evaluateSoon(port)
    })
  }
}

function samePoseState(a: PoseState, b: PoseState): boolean {
  return (
    a.name === b.name &&
    a.since === b.since &&
    a.holdUntil === b.holdUntil &&
    a.beat === b.beat &&
    a.beatUntil === b.beatUntil &&
    a.status === b.status &&
    a.meta === b.meta &&
    a.isStill === b.isStill
  )
}
