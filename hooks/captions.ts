// One-line tool captions, built here from the tool's name, its arguments,
// its result and the word list: no model call, so they cost nothing, add no
// delay and cannot invent a cause. Each tool gets a line when it starts and
// one more when its result lands. A caption never says what the chat isn't
// already showing: no counts before a result exists, no guesses about why.

import type { Segment } from '../types'
import type { Args, Call } from './kinds'
import { baseName, segments, text, unwrapped } from './kinds'
import type { Port } from './port'
import { WORDS } from './words'

/** How the call came back, as the tool.call hook saw it. */
export type Ran = {
  isError: boolean
  wasDenied: boolean
  /** The tool's own record; its shape is the tool's, read loosely. */
  result: unknown
  /** The result as the model read it. */
  text: string
}

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen',
]
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const SCALES: readonly [number, string][] = [
  [1_000_000_000, 'billion'],
  [1_000_000, 'million'],
  [1000, 'thousand'],
]

/** A whole number spelled the cave way: 142 is "one hundred forty-two". */
export function numberWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= 1_000_000_000_000) {
    return String(n)
  }
  if (n < 20) {
    return ONES[n]!
  }
  if (n < 100) {
    const ones = n % 10
    return ones === 0 ? TENS[Math.floor(n / 10)]! : `${TENS[Math.floor(n / 10)]}-${ONES[ones]}`
  }
  if (n < 1000) {
    const rest = n % 100
    const hundreds = `${ONES[Math.floor(n / 100)]} hundred`
    return rest === 0 ? hundreds : `${hundreds} ${numberWords(rest)}`
  }
  for (const [size, name] of SCALES) {
    if (n >= size) {
      const rest = n % size
      const head = `${numberWords(Math.floor(n / size))} ${name}`
      return rest === 0 ? head : `${head} ${numberWords(rest)}`
    }
  }
  return String(n)
}

/** A number opening a sentence. */
export function sentenceNumber(n: number): string {
  const words = numberWords(n)
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Cut to `max` characters, with an ellipsis. */
export function cut(value: string, max: number): string {
  const line = value.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

const plain = (value: string): Segment => ({ text: value, isTerm: false })
const term = (value: string): Segment => ({ text: value, isTerm: true })

/** Runs joined, neighbours of one kind merged, empty runs dropped. */
export function joined(...parts: readonly Segment[]): Segment[] {
  const runs: Segment[] = []
  for (const part of parts) {
    if (part.text === '') {
      continue
    }
    const last = runs[runs.length - 1]
    if (last !== undefined && last.isTerm === part.isTerm) {
      runs[runs.length - 1] = { text: last.text + part.text, isTerm: last.isTerm }
    } else {
      runs.push({ ...part })
    }
  }
  return runs
}

/** The start line, then the landed line after a space. */
export function captionOf(start: readonly Segment[], landed: readonly Segment[] | null): Segment[] {
  return landed === null || landed.length === 0 ? joined(...start) : joined(...start, plain(' '), ...landed)
}

/** A word-list term's cave word, matched whole and without case. */
export function caveWord(word: string): string | null {
  const wanted = word.toLowerCase()
  return WORDS.find(([termName]) => termName.toLowerCase() === wanted)?.[1] ?? null
}

/** The first word after the program that isn't a flag: a grep's pattern. */
function firstOperand(command: string): string {
  const words = unwrapped(segments(command)[0] ?? [])
  return words.slice(1).find(word => !word.startsWith('-')) ?? ''
}

/** A tool's name as words: mcp__github__create_issue is "create issue". */
function toolWords(tool: string): string {
  const name = tool.startsWith('mcp__') ? (tool.split('__').pop() ?? tool) : tool
  return name.replace(/[_-]+/g, ' ').trim() || tool
}

function record(ran: Ran): Readonly<Record<string, unknown>> {
  return typeof ran.result === 'object' && ran.result !== null
    ? (ran.result as Readonly<Record<string, unknown>>)
    : {}
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

/** A count the model's text gives, by pattern: "214 passed". */
function counted(source: string, pattern: RegExp): number | undefined {
  const match = pattern.exec(source)
  return match === null ? undefined : Number(match[1])
}

/** The line when the tool starts. */
export function started(tool: string, args: Args, call: Call): Segment[] {
  switch (call.kind) {
    case 'read':
      return joined(plain('Me read scroll '), term(cut(baseName(call.file ?? 'scroll'), 40)), plain('.'))
    case 'edit':
      return joined(plain('Me carve '), term(cut(baseName(call.file ?? 'rock'), 40)), plain('.'))
    case 'search':
      return searchStarted(tool, args, call)
    case 'web':
      if (tool === 'WebFetch') {
        return joined(plain('Me ask Big Cave of Internet for scroll: '), term(cut(call.summary, 40)), plain('.'))
      }
      return joined(
        plain('Me yell into Big Cave of Internet: '),
        term(`${cut(text(args, 'query'), 60).toUpperCase().replace(/[?.!]+$/, '')}?`),
      )
    case 'test':
    case 'build':
    case 'deploy':
      return joined(plain(`Rock hit rock. Me start fire: ${call.program}.`))
    case 'install':
      return installStarted(args)
    case 'other':
      return otherStarted(tool, call)
  }
}

function searchStarted(tool: string, args: Args, call: Call): Segment[] {
  if (tool === 'Grep') {
    return joined(plain('Me hunt word '), term(cut(text(args, 'pattern'), 40)), plain('.'))
  }
  if (tool === 'Glob') {
    return joined(plain('Me hunt scroll '), term(cut(text(args, 'pattern'), 40)), plain('.'))
  }
  // Bash: rg and grep hunt a word; find hunts scrolls.
  const operand = call.program === 'find' ? '' : firstOperand(text(args, 'command'))
  return operand === ''
    ? joined(plain('Me hunt scroll.'))
    : joined(plain('Me hunt word '), term(cut(operand, 40)), plain('.'))
}

function installStarted(args: Args): Segment[] {
  const words = unwrapped(segments(text(args, 'command'))[0] ?? [])
  const at = words.findIndex(word => ['install', 'i', 'add', 'sync', 'fetch', 'ci'].includes(word))
  const packages = at === -1 ? 0 : words.slice(at + 1).filter(word => !word.startsWith('-')).length
  return joined(plain(`Claude ask for ${packages > 1 ? numberWords(packages) : 'one'} box.`))
}

function otherStarted(tool: string, call: Call): Segment[] {
  if (tool === 'Bash') {
    if (call.program === '') {
      return joined(plain('Claude poke cave.'))
    }
    const cave = caveWord(call.program)
    return cave === null
      ? joined(plain('Claude poke cave: '), term(cut(call.program, 30)), plain('.'))
      : joined(plain('Claude poke cave with '), term(cave), plain('.'))
  }
  if (tool === 'Agent' || tool === 'Task') {
    return joined(plain('Claude send little helper into cave.'))
  }
  if (tool === 'AskUserQuestion') {
    return joined(plain('Claude ask you thing.'))
  }
  if (tool === 'ExitPlanMode') {
    return joined(plain('Claude show plan on wall.'))
  }
  return joined(plain('Claude use strange tool: '), term(cut(toolWords(tool), 30)), plain('.'))
}

/** The line when the result lands, or null when there is nothing to add. */
export function landed(tool: string, args: Args, call: Call, ran: Ran): Segment[] | null {
  if (ran.wasDenied) {
    return joined(plain('You say no. Me put rock down.'))
  }
  switch (call.kind) {
    case 'read':
      return ran.isError ? joined(plain('Scroll not there.')) : readLanded(ran)
    case 'edit':
      return ran.isError ? joined(plain('Rock crack. Carving stop.')) : editLanded(tool, args, ran)
    case 'search':
      return searchLanded(tool, ran)
    case 'web':
      return webLanded(tool, ran)
    case 'test':
      return testLanded(ran)
    case 'build':
    case 'deploy':
      return joined(plain(ran.isError ? 'Fire go out.' : 'Fire catch.'))
    case 'install':
      return joined(
        plain(ran.isError ? 'Box not come.' : 'One box bring friend box. Friend box bring friend.'),
      )
    case 'other':
      return otherLanded(tool, ran)
  }
}

function readLanded(ran: Ran): Segment[] | null {
  const result = record(ran)
  if (result['type'] === 'image') {
    return joined(plain('Scroll is picture. Me look.'))
  }
  const file = result['file']
  const lines =
    typeof file === 'object' && file !== null
      ? count((file as Readonly<Record<string, unknown>>)['numLines'])
      : counted(ran.text, /Read (\d+) lines?/)
  if (lines === undefined) {
    return null
  }
  return joined(plain(`${sentenceNumber(lines)} line.`))
}

/** Lines in and out, from the diff when there is one, else the patch. */
function marks(result: Readonly<Record<string, unknown>>): { added: number; removed: number } | null {
  const diff = result['gitDiff']
  if (typeof diff === 'object' && diff !== null) {
    const added = count((diff as Readonly<Record<string, unknown>>)['additions'])
    const removed = count((diff as Readonly<Record<string, unknown>>)['deletions'])
    if (added !== undefined && removed !== undefined) {
      return { added, removed }
    }
  }
  const patch = result['structuredPatch']
  if (!Array.isArray(patch)) {
    return null
  }
  let added = 0
  let removed = 0
  for (const hunk of patch) {
    const lines = typeof hunk === 'object' && hunk !== null ? (hunk as { lines?: unknown }).lines : undefined
    if (Array.isArray(lines)) {
      for (const line of lines) {
        if (typeof line === 'string' && line.startsWith('+')) {
          added += 1
        } else if (typeof line === 'string' && line.startsWith('-')) {
          removed += 1
        }
      }
    }
  }
  return { added, removed }
}

function editLanded(tool: string, args: Args, ran: Ran): Segment[] | null {
  const result = record(ran)
  let change = marks(result)
  if (tool === 'Write' && result['type'] === 'create') {
    const content = text(args, 'content')
    change = { added: content === '' ? 0 : content.replace(/\n$/, '').split('\n').length, removed: 0 }
  }
  if (change === null || (change.added === 0 && change.removed === 0)) {
    return null
  }
  const parts: string[] = []
  if (change.added > 0) {
    parts.push(`${sentenceNumber(change.added)} mark in.`)
  }
  if (change.removed > 0) {
    parts.push(`${sentenceNumber(change.removed)} mark out.`)
  }
  return joined(plain(parts.join(' ')))
}

function searchLanded(tool: string, ran: Ran): Segment[] | null {
  const result = record(ran)
  if (tool === 'Grep' || tool === 'Glob') {
    if (ran.isError) {
      return joined(plain('Spear break.'))
    }
    const files = count(result['numFiles']) ?? counted(ran.text, /in (\d+) files?/) ?? counted(ran.text, /Found (\d+) files?/)
    if (files === undefined) {
      return null
    }
    if (files === 0) {
      return joined(plain('Find nothing.'))
    }
    if (tool === 'Glob') {
      return joined(plain(`Find ${numberWords(files)} scroll.`))
    }
    const times =
      count(result['numMatches']) ??
      (result['mode'] === 'content' ? count(result['numLines']) : undefined) ??
      counted(ran.text, /Found (\d+) match/)
    return times === undefined
      ? joined(plain(`Find it in ${numberWords(files)} scroll.`))
      : joined(plain(`Find it ${numberWords(times)} time, in ${numberWords(files)} scroll.`))
  }
  // Bash: grep and rg exit 1 when they find nothing.
  const lines = ran.text.split('\n').filter(line => line.trim() !== '').length
  if (ran.isError || lines === 0) {
    return joined(plain('Find nothing.'))
  }
  return joined(plain(`Find ${numberWords(lines)} thing.`))
}

function webLanded(tool: string, ran: Ran): Segment[] | null {
  if (tool === 'WebFetch') {
    return joined(plain(ran.isError ? 'Big Cave say no.' : 'Big Cave give scroll.'))
  }
  if (ran.isError) {
    return joined(plain('Big Cave not answer.'))
  }
  const results = record(ran)['results']
  let things: number | undefined
  if (Array.isArray(results)) {
    things = 0
    for (const entry of results) {
      const content = typeof entry === 'object' && entry !== null ? (entry as { content?: unknown }).content : undefined
      if (Array.isArray(content)) {
        things += content.length
      }
    }
  }
  things ??= counted(ran.text, /(\d+) results?/)
  if (things === undefined) {
    return null
  }
  return things === 0
    ? joined(plain('Big Cave say nothing.'))
    : joined(plain(`Big Cave yell back ${numberWords(things)} thing.`))
}

function testLanded(ran: Ran): Segment[] {
  const passed = counted(ran.text, /(\d+) passed/)
  const failed = counted(ran.text, /(\d+) failed/)
  if (failed !== undefined && failed > 0) {
    return passed === undefined
      ? joined(plain(`${sentenceNumber(failed)} spark die.`))
      : joined(plain(`${sentenceNumber(passed)} spark catch. ${sentenceNumber(failed)} spark die.`))
  }
  if (ran.isError) {
    return joined(plain('Fire go out.'))
  }
  if (passed !== undefined && passed > 0) {
    return joined(plain(`${sentenceNumber(passed)} spark. Every spark catch.`))
  }
  return joined(plain('Fire catch.'))
}

function otherLanded(tool: string, ran: Ran): Segment[] | null {
  if (tool === 'Bash') {
    return joined(plain(ran.isError ? 'Cave bite.' : 'Cave poke back.'))
  }
  if (tool === 'Agent' || tool === 'Task') {
    return joined(plain(ran.isError ? 'Helper lost.' : 'Helper come back.'))
  }
  if (tool === 'AskUserQuestion' || tool === 'ExitPlanMode') {
    return null
  }
  return joined(plain(ran.isError ? 'Strange tool break.' : 'Strange tool work.'))
}

/**
 * A main-loop tool started: its line becomes the caption. None once jokes
 * are off. Runs on the lane.
 */
export async function show(port: Port, toolUseId: string, line: readonly Segment[]): Promise<void> {
  if ((await port.facts()).jokesOff) {
    return
  }
  await port.changeWords(words => ({ ...words, caption: { toolUseId, segments: joined(...line) } }))
}

/**
 * Its result landed: the landed line joins the caption, while the caption is
 * still that tool's. Runs on the lane.
 */
export async function land(port: Port, toolUseId: string, line: readonly Segment[] | null): Promise<void> {
  if (line === null || line.length === 0) {
    return
  }
  await port.changeWords(words =>
    words.caption?.toolUseId === toolUseId
      ? { ...words, caption: { toolUseId, segments: captionOf(words.caption.segments, line) } }
      : words,
  )
}
