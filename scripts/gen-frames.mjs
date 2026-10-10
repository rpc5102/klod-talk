// Paints every frame of kit/caveman.json as a PNG in assets/frames/, eight
// screen pixels to a sprite pixel (256 by 256), for terminals that show real
// images (kitty, Ghostty). The terminal reads these files itself. Eight times
// is crisp both where a cell is 8 by 16 pixels and on a 2x display. Run from
// the repo root:
//
//   node scripts/gen-frames.mjs          write assets/frames/
//   node scripts/gen-frames.mjs --check  fail if a frame's pixels are stale

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'

const SCALE = 8

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const kit = JSON.parse(readFileSync(join(root, 'kit', 'caveman.json'), 'utf8'))
const target = join(root, 'assets', 'frames')

function fail(message) {
  console.error(`gen-frames: ${message}`)
  process.exit(1)
}

const palette = Object.fromEntries(
  Object.entries(kit.palette).map(([char, hex]) => [
    char,
    [1, 3, 5].map(at => Number.parseInt(hex.slice(at, at + 2), 16)),
  ]),
)

/** One frame's scanlines, each led by PNG filter byte 0, transparent where '.'. */
function scanlines(grid) {
  const width = kit.frame_width * SCALE
  const height = kit.frame_height * SCALE
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y += 1) {
    const row = grid[Math.floor(y / SCALE)]
    const start = y * (width * 4 + 1)
    raw[start] = 0
    for (let x = 0; x < width; x += 1) {
      const char = row[Math.floor(x / SCALE)]
      const at = start + 1 + x * 4
      if (char !== kit.transparent) {
        const [r, g, b] = palette[char]
        raw[at] = r
        raw[at + 1] = g
        raw[at + 2] = b
        raw[at + 3] = 255
      }
    }
  }
  return raw
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes) {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function header() {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(kit.frame_width * SCALE, 0)
  ihdr.writeUInt32BE(kit.frame_height * SCALE, 4)
  ihdr[8] = 8 // bits per channel
  ihdr[9] = 6 // RGBA
  return ihdr
}

function png(raw) {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header()),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** The header and pixels of a PNG this script wrote, to compare by content. */
function decode(file) {
  const bytes = readFileSync(file)
  let at = 8
  let ihdr = null
  const idat = []
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at)
    const type = bytes.toString('ascii', at + 4, at + 8)
    const data = bytes.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') ihdr = data
    if (type === 'IDAT') idat.push(data)
    at += 12 + length
  }
  return { ihdr, raw: inflateSync(Buffer.concat(idat)) }
}

const frames = new Map()
for (const [name, pose] of Object.entries(kit.poses)) {
  pose.frames.forEach((grid, index) => frames.set(`${name}_${index}.png`, scanlines(grid)))
}

if (process.argv.includes('--check')) {
  const present = existsSync(target) ? readdirSync(target).filter(file => file.endsWith('.png')) : []
  const extra = present.filter(file => !frames.has(file))
  if (extra.length > 0) fail(`assets/frames/ has frames the kit does not: ${extra.join(', ')}`)
  for (const [file, raw] of frames) {
    const path = join(target, file)
    if (!existsSync(path)) fail(`assets/frames/${file} is missing: run node scripts/gen-frames.mjs`)
    const current = decode(path)
    if (!current.ihdr?.equals(header()) || !current.raw.equals(raw)) {
      fail(`assets/frames/${file} is stale: run node scripts/gen-frames.mjs`)
    }
  }
  console.log(`gen-frames: assets/frames/ is up to date (${frames.size} frames)`)
} else {
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  for (const [file, raw] of frames) writeFileSync(join(target, file), png(raw))
  console.log(`gen-frames: wrote ${frames.size} frames to assets/frames/`)
}
