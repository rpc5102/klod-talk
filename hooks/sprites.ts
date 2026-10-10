// Klod drawn two ways from the same catalog: Raster cells for the terminal,
// animated by a chain of $.clock.after timers that blit the next frame, and
// one SVG per pose for the desktop app, animated by SMIL so the engine never
// redraws per frame. The frame last shown lives in a module variable, so a
// redraw never restarts him and a reload does.

import type { Timer } from 'claude-code'

import type { PoseName, PoseState } from '../types'
import { CATALOG } from './catalog'
import type { Grid } from './catalog'
import type { Port } from './port'

/** The pane's id, which is also the render instance the Raster is drawn in. */
export const PANE_ID = 'cave'
/** The Raster's key, which $.ui.blit names. */
export const SPRITE_KEY = 'sprite'

/** The terminal sprite: 32 columns by 16 rows, two pixels per cell. */
export const COLUMNS = CATALOG.width
export const ROWS = CATALOG.height / 2

/** The terminal's default colour. */
const DEFAULT_COLOR = 0x01000000
const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20

/**
 * One frame as cell triplets [codePoint, foreground, background], row-major.
 * Upper half block when the top pixel is opaque, lower half block in the
 * bottom colour when only the bottom one is, a space when neither is.
 */
export function cellWords(grid: Grid): number[] {
  const words: number[] = []
  const colorOf = (char: string | undefined): number | undefined =>
    char === undefined || char === CATALOG.transparent ? undefined : CATALOG.palette[char]

  for (let row = 0; row < ROWS; row += 1) {
    const top = grid[row * 2] ?? ''
    const bottom = grid[row * 2 + 1] ?? ''
    for (let column = 0; column < COLUMNS; column += 1) {
      const upper = colorOf(top[column])
      const lower = colorOf(bottom[column])
      if (upper !== undefined) {
        words.push(UPPER_HALF, upper, lower ?? DEFAULT_COLOR)
      } else if (lower !== undefined) {
        words.push(LOWER_HALF, lower, DEFAULT_COLOR)
      } else {
        words.push(SPACE, DEFAULT_COLOR, DEFAULT_COLOR)
      }
    }
  }

  return words
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard padded base64. */
export function toBase64(bytes: Uint8Array): string {
  let text = ''
  for (let at = 0; at < bytes.length; at += 3) {
    const a = bytes[at] ?? 0
    const b = bytes[at + 1]
    const c = bytes[at + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    text += BASE64.charAt((n >> 18) & 63) + BASE64.charAt((n >> 12) & 63)
    text += b === undefined ? '=' : BASE64.charAt((n >> 6) & 63)
    text += c === undefined ? '=' : BASE64.charAt(n & 63)
  }

  return text
}

/** Packs cell triplets as Raster `cells`: little-endian u32s, base64. */
export function packCells(words: readonly number[]): string {
  const view = new DataView(new ArrayBuffer(words.length * 4))
  words.forEach((word, index) => view.setUint32(index * 4, word, true))

  return toBase64(new Uint8Array(view.buffer))
}

const cellCache = new Map<string, string>()

/** A frame of a pose as Raster `cells`. */
export function frameCells(name: PoseName, frame: number): string {
  const id = `${name}:${frame}`
  let cells = cellCache.get(id)
  if (cells === undefined) {
    const grid = CATALOG.poses[name].frames[frame] ?? CATALOG.poses[name].frames[0]!
    cells = packCells(cellWords(grid))
    cellCache.set(id, cells)
  }

  return cells
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

/** One frame's pixels: same-colour runs of a row merged into one rect. */
function frameRects(grid: Grid): string {
  const byColor = new Map<string, string[]>()
  grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const char = row.charAt(x)
      let end = x + 1
      while (end < row.length && row.charAt(end) === char) {
        end += 1
      }
      const color = CATALOG.palette[char]
      if (char !== CATALOG.transparent && color !== undefined) {
        const rects = byColor.get(hex(color)) ?? []
        rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1"/>`)
        byColor.set(hex(color), rects)
      }
      x = end
    }
  })

  return [...byColor].map(([color, rects]) => `<g fill="${color}">${rects.join('')}</g>`).join('')
}

function fraction(ms: number, total: number): string {
  return String(Math.round((ms / total) * 10000) / 10000)
}

/**
 * A looping discrete SMIL animation on a frame group's visibility: visible
 * from `begin` to `end` of a cycle of `total` milliseconds.
 */
function visibility(begin: number, end: number, total: number): string {
  const [values, keyTimes] =
    begin === 0
      ? ['visible;hidden', `0;${fraction(end, total)}`]
      : end >= total
        ? ['hidden;visible', `0;${fraction(begin, total)}`]
        : ['hidden;visible;hidden', `0;${fraction(begin, total)};${fraction(end, total)}`]

  return (
    `<animate attributeName="visibility" values="${values}" keyTimes="${keyTimes}" ` +
    `dur="${total}ms" calcMode="discrete" repeatCount="indefinite"/>`
  )
}

const svgCache = new Map<string, string>()

/**
 * One SVG per pose holding every frame as a group, switched by SMIL; a still
 * pose holds its first frame alone.
 */
export function poseSvg(name: PoseName, isStill: boolean): string {
  const id = `${name}:${isStill ? 'still' : 'moving'}`
  const cached = svgCache.get(id)
  if (cached !== undefined) {
    return cached
  }

  const pose = CATALOG.poses[name]
  const frames = isStill ? pose.frames.slice(0, 1) : pose.frames
  const total = pose.durationsMs.slice(0, frames.length).reduce((sum, ms) => sum + ms, 0)
  let begin = 0
  const groups = frames.map((grid, index) => {
    const end = begin + (pose.durationsMs[index] ?? 0)
    const animate = frames.length > 1 ? visibility(begin, end, total) : ''
    const shown = index === 0 ? 'visible' : 'hidden'
    begin = end

    return `<g visibility="${shown}">${animate}${frameRects(grid)}</g>`
  })
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CATALOG.width} ${CATALOG.height}" ` +
    `shape-rendering="crispEdges">${groups.join('')}</svg>`
  svgCache.set(id, svg)

  return svg
}

export function describe(name: PoseName): string {
  return CATALOG.poses[name].description
}

type Animation = { pose: PoseName; frame: number; timer: Timer | null }

let animation: Animation = { pose: 'idle', frame: 0, timer: null }

/** The frame of `state` last shown, so a redraw draws him where he is. */
export function frameShown(state: PoseState): number {
  return animation.pose === state.name && !state.isStill ? animation.frame : 0
}

/** A new pose on screen: its animation starts at its first frame. */
export function show(port: Port, state: PoseState): void {
  animation.timer?.cancel()
  animation = { pose: state.name, frame: 0, timer: null }
  if (!state.isStill) {
    next(port, animation)
  }
}

/** After a reload or an open: the pose on screen, from its first frame. */
export const restart = show

function next(port: Port, current: Animation): void {
  const { durationsMs, frames } = CATALOG.poses[current.pose]
  if (frames.length < 2) {
    return
  }
  current.timer = port.after(durationsMs[current.frame] ?? 1000, () => {
    if (animation !== current) {
      return
    }
    current.frame = (current.frame + 1) % frames.length
    // A blit with no terminal pane mounted is refused; the chain goes on, so
    // a pane placed later animates at once.
    void port.blit(frameCells(current.pose, current.frame)).catch(() => undefined)
    next(port, current)
  })
}
