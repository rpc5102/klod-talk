// The cave translation: one $.model.complete call per finished answer,
// revealed a paragraph every 0.6 s. One call is in flight and one text
// waits; a newer text replaces the waiting one or aborts the call in flight.
// Literal rock answers locally. A failure is a Shrug beat, never an error,
// and Claude's answer is untouched either way.
//
// Every function here runs on the lane. The model call itself does not: it
// is started from the lane and its result goes back onto it.

import type { ModelCompleteRequest, ModelCompleteResult, Timer } from 'claude-code'

import type { CaveLevel, CaveSource, CaveWords, Segment, TranslationModel } from '../types'
import * as director from './director'
import type { Port } from './port'
import { glossaryFor, parseReply, plainText, withoutFences } from './reply'
import { levelInfo } from './settings'
import * as tracker from './tracker'
import { WORDS } from './words'

/** One paragraph appears every this many milliseconds. */
export const REVEAL_MS = 600
/** The translation call gives up after this long. */
export const TIMEOUT_MS = 8000
export const MAX_TOKENS = 500

/** What each answer gets once jokes are off. */
export const SOBER_LINE = 'No jokes for this one.'
export const ROCK = 'Rock.'

const EXAMPLE_TEXT =
  'Heap grows about 50 MB an hour because a new `message` listener is attached on every ' +
  'request and never removed. Detach it in a `finally` block, or register it with ' +
  '`{ once: true }`.'

const EXAMPLE_REPLY = [
  'SIZE 2',
  'Every time friend visit, program pick up rock. Program never put rock down.',
  '',
  '*Pocket full of rock*. Program walk slow. Program fall in river.',
  '',
  '*Fix:* when friend leave, put rock down.',
  '',
  'Rock not friend. Rock just rock. Program must learn this.',
].join('\n')

/** The fixed part of the prompt. It goes first and carries the one cache mark. */
export const FIXED = [
  'You retell a coding assistant’s message as a grumpy, lovable caveman.',
  'Same facts, same order, same numbers. Never add a cause, a fix or a promise the text does not make.',
  'Short words. "Me", "you", no articles. One to five short paragraphs, a blank line between them.',
  'Use the word list’s cave word for each of its terms, wrapped in *asterisks*.',
  'First line: SIZE n, from 0 (nothing wrong) to 5 (everything on fire).',
  'If the text is about real harm (lost data, a security incident, an outage hurting people),',
  'answer only: JOKES OFF',
  'Levels: less cave keeps most words, with light caveman grammar; caveman is the default voice;',
  'very caveman is shorter and louder.',
  'Answer with the SIZE line and the paragraphs, nothing else.',
  '',
  `Word list: ${WORDS.map(([term, caveWord]) => `${term} = ${caveWord}`).join('; ')}.`,
  '',
  'Example',
  `Level: caveman. Text: ${EXAMPLE_TEXT}`,
  EXAMPLE_REPLY,
].join('\n')

/** The part of the prompt that changes: the level and the answer, fences removed. */
export function promptFor(text: string, level: CaveLevel): string {
  return `Level: ${levelInfo(level).promptName}. Text: ${withoutFences(text)}`
}

/**
 * The call. Behind Bedrock, Vertex, Foundry or a gateway the cached text is
 * found again only while `prompt` opens with it, so there it leads `prompt`.
 */
export function requestFor(
  job: CaveSource,
  model: string,
  leadsPrompt: boolean,
): ModelCompleteRequest {
  const fixed = { text: FIXED, cache: true } as const
  const ask = promptFor(job.text, job.level)
  // Low effort: retelling needs no deep thought, and it keeps the chew to about
  // a second instead of five, at a fraction of the tokens.
  const limits = { maxTokens: MAX_TOKENS, timeoutMs: TIMEOUT_MS, effort: 'low' } as const

  return leadsPrompt
    ? { model, prompt: [fixed, { text: ask }], ...limits }
    : { model, system: [fixed], prompt: ask, ...limits }
}

/** The whole cave answer for screen readers: his line, then every paragraph. */
export function announcement(level: CaveLevel, paragraphs: readonly (readonly Segment[])[]): string {
  return [levelInfo(level).status, ...paragraphs.map(plainText)].join(' ')
}

type Flight = {
  token: number
  abort: AbortController
  job: CaveSource
  model: string
  startedAt: number
}

/** What a call came back with: the model's result, or the engine refusing to send it. */
type Outcome = { result: ModelCompleteResult } | { refused: string }

/** Why a call that came back without words failed, in plain words for the meta line. */
export function whyNotAnswered(result: Exclude<ModelCompleteResult, { isAnswered: true }>): string {
  switch (result.reason) {
    case 'api-error':
      return `API error ${result.status ?? '(no response)'}, ${result.error.replaceAll('_', ' ')}`
    case 'empty-reply':
      return 'the model sent back no words'
    case 'aborted':
      return `no reply within ${TIMEOUT_MS / 1000} s`
  }
}

/** A refusal's own words, cut to fit one line. */
export function whyRefused(message: string): string {
  const text = message.replace(/\s+/g, ' ').trim()
  return `the call was refused (${text.length > 80 ? `${text.slice(0, 79)}\u2026` : text})`
}

let flight: Flight | null = null
let waiting: CaveSource | null = null
let tokens = 0
let reveal: Timer | null = null
let reveals = 0
let leadsPrompt: boolean | null = null

function merge(port: Port, change: Partial<CaveWords>): Promise<CaveWords> {
  return port.changeWords(words => ({ ...words, ...change }))
}

/** A main-loop answer to translate: from turn.complete. */
export async function offer(port: Port, text: string, id: string): Promise<void> {
  const facts = await port.facts()
  const { level } = await port.settings()
  const job: CaveSource = { id, text, level }
  if (facts.jokesOff) {
    await sober(port, job)
    return
  }
  // Nothing but code: nothing to retell, and code never goes to the model.
  if (withoutFences(text) === '') {
    return
  }
  await request(port, job, true)
}

/** Again: a new take on the same answer, at the level set now. */
export async function again(port: Port): Promise<void> {
  const words = await port.words()
  const facts = await port.facts()
  const { level } = await port.settings()
  if (words.source === null || facts.jokesOff) {
    return
  }
  await request(port, { ...words.source, level }, false)
}

/**
 * After a reload, from session.start: the reload dropped any call in flight
 * and the reveal timer. Translate again if it was chewing or the level
 * changed (a level change reloads the module); go on revealing if it was
 * streaming.
 */
export async function resume(port: Port): Promise<void> {
  const words = await port.words()
  const facts = await port.facts()
  const { level } = await port.settings()
  const next = afterReload(words, facts.jokesOff, level)
  if (next === 'translate' && words.source !== null) {
    await request(port, { ...words.source, level }, false)
  } else if (next === 'reveal') {
    scheduleReveal(port, (reveals += 1))
  }
}

/** What a reload leaves to do: translate again, go on revealing, or nothing. */
export function afterReload(
  words: CaveWords,
  isJokesOff: boolean,
  level: CaveLevel,
): 'translate' | 'reveal' | 'nothing' {
  if (words.source === null || isJokesOff) {
    return 'nothing'
  }
  if (words.phase === 'chewing' || words.source.level !== level) {
    return 'translate'
  }

  return words.phase === 'streaming' ? 'reveal' : 'nothing'
}

/** A /clear: nothing in flight, nothing waiting, nothing revealing. */
export function stop(): void {
  flight?.abort.abort()
  flight = null
  waiting = null
  reveal?.cancel()
  reveal = null
}

async function request(port: Port, job: CaveSource, isNewer: boolean): Promise<void> {
  if (flight !== null) {
    // The newer text waits; the call in flight stops.
    waiting = job
    flight.abort.abort()
    if (isNewer) {
      await port.changeWords(words => ({ ...words, skipped: words.skipped + 1 }))
    }
    return
  }
  if (isNewer) {
    await merge(port, { skipped: 0 })
  }
  await start(port, job)
}

async function start(port: Port, job: CaveSource): Promise<void> {
  reveal?.cancel()
  reveal = null
  if (job.level === 'rock') {
    await landRock(port, job)
    return
  }

  const model = await modelFor(port, (await port.settings()).model)
  const leads = await leadsWithFixedText(port)
  const current: Flight = {
    token: (tokens += 1),
    abort: new AbortController(),
    job,
    model,
    startedAt: await port.now(),
  }
  flight = current
  await merge(port, { source: job, phase: 'chewing', shown: 0, problem: null })
  await director.evaluate(port)
  void call(port, current, requestFor(job, model, leads))
}

async function call(port: Port, current: Flight, ask: ModelCompleteRequest): Promise<void> {
  let outcome: Outcome
  try {
    outcome = { result: await port.complete(ask, current.abort.signal) }
  } catch (error) {
    // The engine would not send it: a blocked model or a bad request.
    outcome = { refused: error instanceof Error ? error.message : String(error) }
  }
  await port.work(() => settle(port, current, outcome))
}

async function settle(port: Port, current: Flight, outcome: Outcome): Promise<void> {
  if (flight !== current) {
    // Stopped by a /clear.
    return
  }
  flight = null
  if (waiting !== null) {
    // A newer text won.
    const next = waiting
    waiting = null
    await start(port, next)
    return
  }
  const elapsed = (await port.now()) - current.startedAt
  if ('refused' in outcome) {
    await failed(port, current, elapsed, whyRefused(outcome.refused))
    return
  }
  const { result } = outcome
  if (!result.isAnswered) {
    if (result.reason === 'aborted' && elapsed < TIMEOUT_MS - 500) {
      // Cut short, not timed out: the person pressed Esc. Skipped quietly.
      await quiet(port)
      return
    }
    await failed(port, current, elapsed, whyNotAnswered(result))
    return
  }

  const reply = parseReply(result.text)
  if (reply.kind === 'jokes-off') {
    await port.changeFacts(tracker.jokesOff())
    await sober(port, current.job)
    return
  }
  if (reply.paragraphs.length === 0) {
    await failed(port, current, elapsed, 'the reply had no words in it')
    return
  }
  await land(port, current.job, reply.paragraphs, reply.size)
}

async function land(
  port: Port,
  job: CaveSource,
  paragraphs: Segment[][],
  size: number | null,
): Promise<void> {
  const now = await port.now()
  const isWhole = paragraphs.length === 1
  await port.changeWords(words => ({
    ...words,
    source: job,
    phase: isWhole ? 'done' : 'streaming',
    paragraphs,
    shown: 1,
    mammoths: size ?? words.mammoths,
    glossary: glossaryFor(paragraphs.slice(0, 1), WORDS),
    explainedAt: isWhole ? now : 0,
    announce: isWhole ? announcement(job.level, paragraphs) : words.announce,
  }))
  await director.evaluate(port)
  if (!isWhole) {
    scheduleReveal(port, (reveals += 1))
  }
}

function scheduleReveal(port: Port, id: number): void {
  reveal = port.after(REVEAL_MS, () => {
    void port.work(() => revealNext(port, id))
  })
}

async function revealNext(port: Port, id: number): Promise<void> {
  const words = await port.words()
  if (id !== reveals || words.phase !== 'streaming' || words.source === null) {
    return
  }
  reveal = null
  const shown = Math.min(words.shown + 1, words.paragraphs.length)
  const glossary = glossaryFor(words.paragraphs.slice(0, shown), WORDS)
  if (shown < words.paragraphs.length) {
    await merge(port, { shown, glossary })
    scheduleReveal(port, id)
  } else {
    // The last paragraph: the whole answer is announced once.
    await merge(port, {
      shown,
      glossary,
      phase: 'done',
      explainedAt: await port.now(),
      announce: announcement(words.source.level, words.paragraphs),
    })
  }
  await director.evaluate(port)
}

async function landRock(port: Port, job: CaveSource): Promise<void> {
  const paragraphs = [[{ text: ROCK, isTerm: false }]]
  await merge(port, {
    source: job,
    phase: 'done',
    paragraphs,
    shown: 1,
    glossary: [],
    explainedAt: await port.now(),
    announce: announcement('rock', paragraphs),
  })
  await director.evaluate(port)
}

async function sober(port: Port, job: CaveSource): Promise<void> {
  await merge(port, {
    source: job,
    phase: 'done',
    paragraphs: [[{ text: SOBER_LINE, isTerm: false }]],
    shown: 1,
    glossary: [],
    explainedAt: await port.now(),
    announce: SOBER_LINE,
  })
  await director.evaluate(port)
}

async function failed(port: Port, current: Flight, elapsed: number, problem: string): Promise<void> {
  port.log(`translation failed after ${elapsed} ms on model "${current.model}": ${problem}`)
  await merge(port, { phase: 'failed', shown: 0, problem })
  await port.changeFacts(tracker.translationFailed())
  await director.evaluate(port)
}

/** Back to the words that were there, as if nothing had been asked. */
async function quiet(port: Port): Promise<void> {
  await port.changeWords(words => ({
    ...words,
    phase: words.paragraphs.length > 0 ? 'done' : 'empty',
    shown: words.paragraphs.length,
  }))
  await director.evaluate(port)
}

function modelFor(port: Port, model: TranslationModel): Promise<string> {
  return model === 'same' ? port.claudeModel() : Promise.resolve('haiku')
}

async function leadsWithFixedText(port: Port): Promise<boolean> {
  leadsPrompt ??= await port.isGateway()

  return leadsPrompt
}
