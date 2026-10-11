// Klod's two drawings: Raster cells for the terminal and the SMIL SVG for
// the desktop app, both from the generated catalog.

import { describe, expect, test } from 'claude-code/testing'

import type { PoseName } from '../types'
import { CATALOG } from '../hooks/catalog'
import {
  COLUMNS,
  ROWS,
  cellWords,
  frameCells,
  packCells,
  poseSvg,
  toBase64,
} from '../hooks/sprites'

const POSES = Object.keys(CATALOG.poses) as PoseName[]
const DEFAULT = 0x01000000

function fromBase64(text: string): number[] {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const bytes: number[] = []
  for (let at = 0; at < text.length; at += 4) {
    const chunk = text.slice(at, at + 4)
    const n = [...chunk].reduce((sum, char) => sum * 64 + Math.max(0, alphabet.indexOf(char)), 0)
    bytes.push((n >> 16) & 255)
    if (chunk[2] !== '=') bytes.push((n >> 8) & 255)
    if (chunk[3] !== '=') bytes.push(n & 255)
  }
  const words: number[] = []
  for (let at = 0; at < bytes.length; at += 4) {
    words.push(((bytes[at + 3]! << 24) >>> 0) + (bytes[at + 2]! << 16) + (bytes[at + 1]! << 8) + bytes[at]!)
  }
  return words
}

describe('Raster cells', () => {
  test('base64 as the standard pads it', () => {
    const bytes = (text: string) => new Uint8Array([...text].map(char => char.charCodeAt(0)))
    expect(toBase64(bytes(''))).toBe('')
    expect(toBase64(bytes('f'))).toBe('Zg==')
    expect(toBase64(bytes('fo'))).toBe('Zm8=')
    expect(toBase64(bytes('foobar'))).toBe('Zm9vYmFy')
  })

  test('cells pack as little-endian u32 triplets', () => {
    expect(packCells([0x2588, 0xff8800, 0x01000000])).toBe('iCUAAACI/wAAAAAB')
  })

  test('the sprite is 32 columns by 16 rows', () => {
    expect([COLUMNS, ROWS]).toEqual([32, 16])
  })

  test('every frame of every pose packs two pixels a cell, by the half-block rule', () => {
    for (const name of POSES) {
      CATALOG.poses[name].frames.forEach((grid, frame) => {
        const words = fromBase64(frameCells(name, frame))
        expect(words).toHaveLength(COLUMNS * ROWS * 3)
        expect(words).toEqual(cellWords(grid))
        for (let row = 0; row < ROWS; row += 1) {
          for (let column = 0; column < COLUMNS; column += 1) {
            const top = grid[row * 2]!.charAt(column)
            const bottom = grid[row * 2 + 1]!.charAt(column)
            const at = (row * COLUMNS + column) * 3
            const cell = words.slice(at, at + 3)
            const color = (char: string) => CATALOG.palette[char]!
            if (top !== '.') {
              expect(cell).toEqual([0x2580, color(top), bottom === '.' ? DEFAULT : color(bottom)])
            } else if (bottom !== '.') {
              expect(cell).toEqual([0x2584, color(bottom), DEFAULT])
            } else {
              expect(cell).toEqual([0x20, DEFAULT, DEFAULT])
            }
          }
        }
      })
    }
  })
})

describe('SVG', () => {
  test('one group per frame, switched by a looping discrete animation', () => {
    for (const name of POSES) {
      const pose = CATALOG.poses[name]
      const svg = poseSvg(name, false)
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"')).toBe(true)
      expect(svg.match(/<g visibility=/g)).toHaveLength(pose.frames.length)
      expect(svg.match(/<animate /g)).toHaveLength(pose.frames.length)
      const total = pose.durationsMs.reduce((sum, ms) => sum + ms, 0)
      expect(svg).toContain(`dur="${total}ms" calcMode="discrete" repeatCount="indefinite"`)
    }
  })

  test('the frames take turns at the kit\'s timings', () => {
    // Carve: 480, 120, 480, 120, 1200 of a 2400 ms loop.
    const svg = poseSvg('carve', false)
    expect(svg).toContain('values="visible;hidden" keyTimes="0;0.2"')
    expect(svg).toContain('values="hidden;visible;hidden" keyTimes="0;0.2;0.25"')
    expect(svg).toContain('values="hidden;visible" keyTimes="0;0.5"')
  })

  test('a still pose is its first frame alone', () => {
    for (const name of POSES) {
      const svg = poseSvg(name, true)
      expect(svg.match(/<g visibility=/g)).toHaveLength(1)
      expect(svg).not.toContain('<animate')
    }
  })

  test('every pose stays well under the 131,072-character limit', () => {
    for (const name of POSES) {
      expect(poseSvg(name, false).length).toBeLessThan(131_072 / 2)
    }
  })

  test('same-colour runs are one rect each', () => {
    // Idle frame 0, row 0: "............o.oo..oo.o.........." holds four runs of o.
    const svg = poseSvg('idle', true)
    expect(svg).toContain('<rect x="12" y="0" width="1" height="1"/>')
    expect(svg).toContain('<rect x="14" y="0" width="2" height="1"/>')
  })
})
