// Text in and out of the translation call, as pure functions: what is sent
// (the answer with fenced code taken out) and what comes back (a SIZE line,
// JOKES OFF, paragraphs, *terms*).

import type { Segment } from '../types'
import type { Word } from './words'

export type Reply =
  | { kind: 'jokes-off' }
  | { kind: 'cave'; size: number | null; paragraphs: Segment[][] }

/** The answer with fenced code blocks taken out; inline code stays. */
export function withoutFences(text: string): string {
  const kept: string[] = []
  let fence: string | null = null

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (fence === null) {
      const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)
      if (open) {
        fence = open[1]!
      } else {
        kept.push(line)
      }
      continue
    }
    const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)
    if (close && close[1]![0] === fence[0] && close[1]!.length >= fence.length) {
      fence = null
    }
  }

  return kept
    .join('\n')
    .replace(/\n[ \t]*(\n[ \t]*)+\n/g, '\n\n')
    .trim()
}

const JOKES_OFF = /^[\W_]*jokes off[\W_]*$/i
const SIZE = /^[\W_]*size\s*[:=]?\s*(\d+)[\W_]*$/i
const TERM = /\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*|\*(?!\s)([^*\n]+?)(?<!\s)\*/g

/** Reads the model's reply. A reply with no paragraphs reads as none. */
export function parseReply(text: string): Reply {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  if (lines.some(line => JOKES_OFF.test(line.trim()))) {
    return { kind: 'jokes-off' }
  }

  let size: number | null = null
  const body: string[] = []
  for (const line of lines) {
    const match = SIZE.exec(line.trim())
    if (match) {
      size ??= Math.max(0, Math.min(5, Number(match[1])))
      continue
    }
    body.push(line)
  }

  const joined = body.join('\n').trim()
  const blocks = /\n[ \t]*\n/.test(joined) ? joined.split(/\n[ \t]*(?:\n[ \t]*)+/) : joined.split('\n')
  const paragraphs = blocks
    .map(block => segments(block.replace(/\s*\n\s*/g, ' ').trim()))
    .filter(paragraph => paragraph.length > 0)

  return { kind: 'cave', size, paragraphs }
}

/** One paragraph's runs: *term* and **term** are terms, the rest plain. */
export function segments(text: string): Segment[] {
  const runs: Segment[] = []
  const push = (piece: string, isTerm: boolean) => {
    if (piece === '') {
      return
    }
    const last = runs[runs.length - 1]
    if (last !== undefined && last.isTerm === isTerm) {
      last.text += piece
    } else {
      runs.push({ text: piece, isTerm })
    }
  }

  let at = 0
  for (const match of text.matchAll(TERM)) {
    push(text.slice(at, match.index), false)
    push(match[1] ?? match[2] ?? '', true)
    at = match.index + match[0].length
  }
  push(text.slice(at), false)

  return runs
}

export function plainText(paragraph: readonly Segment[]): string {
  return paragraph.map(segment => segment.text).join('')
}

function comparable(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, '')
    .replace(/[\s.]+/g, ' ')
    .trim()
}

/** The word-list pairs whose cave word is a term on screen, in list order. */
export function glossaryFor(
  paragraphs: readonly (readonly Segment[])[],
  words: readonly Word[],
): [string, string][] {
  const terms = new Set(
    paragraphs.flat().filter(segment => segment.isTerm).map(segment => comparable(segment.text)),
  )

  return words
    .filter(([, caveWord]) => terms.has(comparable(caveWord)))
    .map(([term, caveWord]): [string, string] => [term, caveWord])
}
