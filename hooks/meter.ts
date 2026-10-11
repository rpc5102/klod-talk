// The mammoth meter: five small mammoths, filled up to the translation's
// SIZE line, with a text twin ("3 of 5 mammoths") so colour is never alone.
// One small Raster on the terminal, an Svg elsewhere. It changes only when
// a translation lands, since only then is cave.mammoths written.

import { packCells } from './sprites'

export const MAMMOTHS = 5

/** One mammoth, facing left: dome head, trunk hanging, a tusk, two legs. */
const MAMMOTH: readonly string[] = [
  '..###.',
  '.#####',
  '######',
  '#t####',
  '#.#..#',
  '..#..#',
]
const WIDTH = 6
const HEIGHT = MAMMOTH.length
const GAP = 1

/** The meter in terminal cells: two pixels to a cell, as Klod is drawn. */
export const METER_COLUMNS = MAMMOTHS * WIDTH + (MAMMOTHS - 1) * GAP
export const METER_ROWS = HEIGHT / 2

/** Colours from the kit's palette: hide brown and tusk for a counted mammoth, stone for the rest. */
const FULL = 0x5e3a22
const TUSK = 0xf5efe1
const EMPTY = 0xa29e92
const DEFAULT_COLOR = 0x01000000
const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20

export function meterText(count: number): string {
  return `${clamp(count)} of ${MAMMOTHS} mammoths`
}

function clamp(count: number): number {
  return Math.max(0, Math.min(MAMMOTHS, Math.round(count)))
}

/** The meter's pixels, row by row: null where nothing is painted. */
export function meterPixels(count: number): (number | null)[][] {
  const filled = clamp(count)
  return MAMMOTH.map(row => {
    const pixels: (number | null)[] = []
    for (let index = 0; index < MAMMOTHS; index += 1) {
      if (index > 0) {
        pixels.push(null)
      }
      for (const char of row) {
        if (char === '.') {
          pixels.push(null)
        } else if (index >= filled) {
          pixels.push(EMPTY)
        } else {
          pixels.push(char === 't' ? TUSK : FULL)
        }
      }
    }
    return pixels
  })
}

const cellCache = new Map<number, string>()

/** The meter as Raster `cells`. */
export function meterCells(count: number): string {
  const filled = clamp(count)
  const cached = cellCache.get(filled)
  if (cached !== undefined) {
    return cached
  }
  const pixels = meterPixels(filled)
  const words: number[] = []
  for (let row = 0; row < METER_ROWS; row += 1) {
    const top = pixels[row * 2] ?? []
    const bottom = pixels[row * 2 + 1] ?? []
    for (let column = 0; column < METER_COLUMNS; column += 1) {
      const upper = top[column] ?? null
      const lower = bottom[column] ?? null
      if (upper !== null) {
        words.push(UPPER_HALF, upper, lower ?? DEFAULT_COLOR)
      } else if (lower !== null) {
        words.push(LOWER_HALF, lower, DEFAULT_COLOR)
      } else {
        words.push(SPACE, DEFAULT_COLOR, DEFAULT_COLOR)
      }
    }
  }
  const cells = packCells(words)
  cellCache.set(filled, cells)
  return cells
}

const svgCache = new Map<number, string>()

/** The meter as an SVG, one rect per same-colour run. */
export function meterSvg(count: number): string {
  const filled = clamp(count)
  const cached = svgCache.get(filled)
  if (cached !== undefined) {
    return cached
  }
  const byColor = new Map<number, string[]>()
  meterPixels(filled).forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const color = row[x] ?? null
      let end = x + 1
      while (end < row.length && (row[end] ?? null) === color) {
        end += 1
      }
      if (color !== null) {
        const rects = byColor.get(color) ?? []
        rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1"/>`)
        byColor.set(color, rects)
      }
      x = end
    }
  })
  const groups = [...byColor]
    .map(([color, rects]) => `<g fill="#${color.toString(16).padStart(6, '0')}">${rects.join('')}</g>`)
    .join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${METER_COLUMNS} ${HEIGHT}" ` +
    `shape-rendering="crispEdges">${groups}</svg>`
  svgCache.set(filled, svg)
  return svg
}
