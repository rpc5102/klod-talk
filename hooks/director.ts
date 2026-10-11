// The pose director: turns session facts into one pose at a time. The
// louder trigger wins, every pose holds 2 s, and quiet steps down to Idle
// and Sleep. It is level-triggered: it asks what should show now, so missed
// poses are skipped, never replayed. One wake timer; nothing polls.
//
// Phase 1 brought nine poses: Idle, Impatient, Thinking, Snack, Explaining,
// Happy, Shrug, Panic and Sleep. Phase 2 adds the ten that copy what Claude
// is doing: Read, Hunt, Carve, Shout, Pilates, Flint, Dance, Sign, Bonk and
// Campfire.

import type { Timer } from 'claude-code'

import type { Beat, CaveWords, PanicWhy, PoseName, PoseState, RunKind, RunningTool, SessionFacts, TurnFacts, TurnResult } from '../types'
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
/** A tool running this long, with no pose of its own, shows Pilates. */
export const PILATES_MS = 5000
/** A Bash command running this long shows Dance. */
export const DANCE_MS = 30_000
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
  sleep: ['Zzz… mammoth… zzz', 'Quiet for 20 minutes'],
  failed: ['Me brain hurt.', 'Cave Talk could not reach its model'],
  jokesOff: ['No jokes for this one.', 'Claude’s answer in the chat has the steps.'],
  sign: ['Me need yes.', 'Claude is waiting for your permission'],
  signPlain: ['Permission needed.', 'Claude is waiting for your permission'],
  campfire: ['Fire good. Me warm.', 'Claude finished, and the deploy worked'],
} as const satisfies Record<string, Lines>

const PANIC_STATUS = 'AAAAH. Rock broke.'
const PANIC_META: Record<PanicWhy, string> = {
  error: 'Claude hit an API error',
  test: 'A test run failed',
  build: 'A build failed',
}

const FAILED_RUN: Record<RunKind, string> = {
  test: 'The last test run failed',
  build: 'The last build failed',
}

const EXPLAINING_META = 'Cave version of Claude’s answer'

const SHRUG: Record<TurnResult['why'], Lines> = {
  win: ['Me not know.', 'Claude finished'],
  done: ['Me not know.', 'Claude finished'],
  asks: ['Me not know.', 'Claude asked you something'],
  failed: ['Me not know.', 'The last test or build run failed'],
  refusal: ['Me not know.', 'Claude declined this one'],
  error: ['Me not know.', 'The turn ended on an API error'],
}

function want(name: PoseName, [status, meta]: Lines, extra: Partial<Want> = {}): Want {
  return { name, status, meta, isStill: false, beat: null, ...extra }
}

/** The turn's result pose. */
function resultWant(result: TurnResult): Want {
  if (result.pose === 'happy') {
    return want('happy', LINES.happy)
  }
  if (result.pose === 'campfire') {
    return want('campfire', LINES.campfire)
  }
  const [status, meta] = SHRUG[result.why]
  return want('shrug', [status, result.failedRun ? FAILED_RUN[result.failedRun] : meta])
}

function files(count: number): string {
  return count === 1 ? '1 file' : `${count} files`
}

/**
 * The newest running tool's pose, by kind and age. The age counts from when
 * its permission dialog closed, if it asked.
 */
export function toolPose(tool: RunningTool, turn: TurnFacts | null, now: number): Want {
  const age = now - tool.startedAt
  const what = tool.summary === '' ? tool.tool : tool.summary
  if (tool.tool === 'Bash' && age >= DANCE_MS) {
    return want('dance', ['Me do hurry-up dance.', `Claude is running ${what} · over 30 s`])
  }
  switch (tool.kind) {
    case 'test':
    case 'build':
    case 'deploy':
      return want('flint', ['Me make fire…', `Claude ran ${what}`])
    case 'edit':
      if (turn?.lastRunFailed === true) {
        return want('bonk', ['Me bonk bug.', 'Claude is fixing what failed'])
      }
      return want('carve', ['Me carve.', `Claude edited ${files(Math.max(1, turn?.edited.length ?? 1))}`])
    case 'read':
      return want('read', ['Me read. Scroll long.', `Claude read ${what}`])
    case 'search':
      return want('hunt', ['Me hunt word.', `Claude ran ${what}`])
    case 'web':
      return want('shout', [
        'Me shout into Big Cave.',
        tool.tool === 'WebFetch' ? `Claude fetched ${what}` : 'Claude searched the web',
      ])
    default:
      if (age >= PILATES_MS) {
        return want('pilates', ['Me do core. You wait.', `Claude is running ${what} · over 5 s`])
      }
      return want('thinking', LINES.thinking)
  }
}

/** What should show now, by priority. Pure: facts, words and the time in. */
export function desired(facts: SessionFacts, words: CaveWords, now: number): Want {
  const wait = facts.permissionWait
  if (facts.jokesOff) {
    // Sign still shows, in plain words.
    if (wait !== null && !wait.isQuestion) {
      return want('sign', LINES.signPlain, { isStill: true })
    }
    return want('idle', LINES.jokesOff, { isStill: true })
  }
  if (now < facts.panicUntil) {
    return want('panic', [PANIC_STATUS, PANIC_META[facts.panicWhy]])
  }
  if (wait !== null) {
    return wait.isQuestion ? want('shrug', SHRUG.asks) : want('sign', LINES.sign)
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
    const [status, meta] = LINES.failed
    const why = words.problem === null ? meta : `Translation failed: ${words.problem}`
    return want('shrug', [status, why], { beat })
  }
  const newest = facts.running[facts.running.length - 1]
  if (newest !== undefined) {
    return toolPose(newest, facts.turn, now)
  }
  if (facts.turn !== null) {
    return want('thinking', LINES.thinking)
  }
  const result = facts.result
  if (result !== null && (now < result.endedAt + RESULT_MS || result.asksUser)) {
    return resultWant(result)
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
 * ending, Panic ending, Explaining ending, the newest tool crossing 5 or
 * 30 s, 60 s after a turn, the end of typing, 20 quiet minutes. Null when
 * nothing is due.
 */
export function nextWakeAt(
  facts: SessionFacts,
  words: CaveWords,
  current: PoseState,
  now: number,
): number | null {
  const newest = facts.running[facts.running.length - 1]
  const times = [
    newest !== undefined ? newest.startedAt + PILATES_MS : 0,
    newest !== undefined ? newest.startedAt + DANCE_MS : 0,
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
