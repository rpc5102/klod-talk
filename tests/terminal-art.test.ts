// How the terminal draws Klod: a real image at half the cells where the
// terminal shows images (kitty, Ghostty), half-block cells everywhere else.

import { describe, expect, test } from 'claude-code/testing'

import { CATALOG } from '../hooks/catalog'
import { IMAGE_COLUMNS, IMAGE_ROWS, frameCells, framePath, showsNoImages } from '../hooks/sprites'
import { PEEK, world } from './world'

const GHOSTTY = { TERM: 'xterm-ghostty', TERM_PROGRAM: 'ghostty' }
const [IDLE_FIRST] = CATALOG.poses.idle.durationsMs

describe('which terminals get a real image', () => {
  for (const [name, env, art] of [
    ['Ghostty', GHOSTTY, 'image'],
    ['Ghostty by TERM_PROGRAM alone', { TERM_PROGRAM: 'ghostty' }, 'image'],
    ['kitty', { TERM: 'xterm-kitty' }, 'image'],
    ['kitty inside tmux', { TERM: 'tmux-256color', KITTY_WINDOW_ID: '1' }, 'image'],
    ['iTerm2', { TERM: 'xterm-256color', TERM_PROGRAM: 'iTerm.app' }, 'cells'],
    ['Terminal.app', { TERM: 'xterm-256color', TERM_PROGRAM: 'Apple_Terminal' }, 'cells'],
    ['no terminal named', {}, 'cells'],
    ['a kitty variable set but empty', { TERM: 'xterm-256color', KITTY_WINDOW_ID: '' }, 'cells'],
  ] as const) {
    test(`${name}: ${art}`, { plugins: [PEEK] }, async ($, on) => {
      const w = world($, on, { env })
      await w.start()
      expect((await w.peek()).display.terminalArt).toBe(art)
    })
  }
})

test('in Ghostty he is a real image at half the cells, every pixel kept, and animates by swapping files', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on, { env: GHOSTTY })
  await w.start()
  const ui = await w.mountPane('terminal')
  const image = await ui.find({ type: 'Image' })
  expect(image).toMatchObject({
    key: 'sprite',
    props: { columns: IMAGE_COLUMNS, rows: IMAGE_ROWS, alt: CATALOG.poses.idle.description },
  })
  expect([IMAGE_COLUMNS, IMAGE_ROWS]).toEqual([16, 8])
  const source = image!.props['source'] as { file: string; format: string }
  expect(source.format).toBe('png')
  expect(source.file.startsWith('/')).toBe(true)
  expect(source.file.endsWith('/assets/frames/idle_0.png')).toBe(true)
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()

  await w.advance(IDLE_FIRST!)
  expect(w.blits).toHaveLength(1)
  expect(w.blits[0]!.file?.endsWith('/assets/frames/idle_1.png')).toBe(true)
  await ui.redraw()
  const redrawn = (await ui.find({ type: 'Image' }))!.props['source'] as { file: string }
  expect(redrawn.file).toBe(w.blits[0]!.file)

  // The pane asks for less room inline: Klod is half as tall.
  await $.command.run({
    command: 'klod',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(w.opened).toEqual([{ id: 'cave', title: 'Cave Talk', rows: 16 }])
})

test('a terminal that draws the alt instead of the image falls back to cells', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on, { env: GHOSTTY })
  w.refuseBlit = () => 'the Image draws its alt there: no placeholder images'
  await w.start()
  const ui = await w.mountPane('terminal')
  expect(await ui.find({ type: 'Image' })).toBeDefined()
  await w.advance(IDLE_FIRST!)
  await w.settle()
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(await ui.find({ type: 'Raster' })).toMatchObject({ props: { columns: 32, rows: 16 } })
})

test('a blit refused because no pane is up changes nothing', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on, { env: GHOSTTY })
  w.refuseBlit = () => 'nothing of this plugin\'s is mounted there'
  await w.start()
  await w.advance(IDLE_FIRST!)
  await w.settle()
  const ui = await w.mountPane('terminal')
  expect(await ui.find({ type: 'Image' })).toBeDefined()
})

test('the desktop app draws the same SVG whatever the terminal', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on, { env: GHOSTTY })
  await w.start()
  const ui = await w.mountPane('desktop')
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
})

describe('frame files', () => {
  test('each frame is a PNG under the plugin folder', () => {
    expect(framePath('/home/bob/klod-talk', 'happy', 3)).toBe('/home/bob/klod-talk/assets/frames/happy_3.png')
    expect(framePath('/home/bob/klod-talk/', 'idle', 0)).toBe('/home/bob/klod-talk/assets/frames/idle_0.png')
  })

  test('only the alt refusal means the terminal shows no images', () => {
    expect(showsNoImages('the Image draws its alt there: no placeholder images')).toBe(true)
    expect(showsNoImages('nothing of this plugin\'s is mounted there')).toBe(false)
    expect(showsNoImages(undefined)).toBe(false)
  })

  test('the cells fallback is unchanged', () => {
    expect(frameCells('idle', 0).length).toBeGreaterThan(0)
  })
})
