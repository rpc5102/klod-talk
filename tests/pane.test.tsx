// The Pane mounted on the terminal and on the desktop app: Raster on the
// terminal, Svg on the desktop, buttons found by key and pressed.

import { expect, test } from 'claude-code/testing'

import { CATALOG } from '../hooks/catalog'
import { frameCells, poseSvg } from '../hooks/sprites'
import { A3, SAMPLES } from './fixtures'
import { PEEK, answerAfter, replyFor, world } from './world'

const SURFACES = ['terminal', 'desktop'] as const
const crashloop = SAMPLES.find(sample => sample.id === 'crashloop')!
const takes = A3.levels.find(level => level.name === 'Caveman')!.takes

const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 150,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

test('the pane draws Klod, his lines and the controls on each surface', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  await w.start()
  for (const surface of SURFACES) {
    const ui = await w.mountPane(surface)
    expect(await ui.find({ type: 'Text', text: 'Me wait. Me watch.' })).toMatchObject({ props: { bold: true } })
    expect(await ui.find({ type: 'Text', text: 'Nothing happening' })).toMatchObject({ props: { dimColor: true } })
    expect(await ui.find({ type: 'Text', text: /^Me read what Claude say/ })).toBeDefined()
    expect(await ui.find({ key: 'again' })).toMatchObject({
      type: 'Button',
      props: { label: 'Again', hotkey: 'a', variant: 'primary' },
    })
    expect(await ui.find({ key: 'level' })).toMatchObject({
      type: 'Select',
      props: { label: 'Cave level', value: 'Caveman' },
    })
    if (surface === 'terminal') {
      expect(await ui.find({ type: 'Raster' })).toMatchObject({
        key: 'sprite',
        props: { columns: 32, rows: 16, cells: frameCells('idle', 0) },
      })
      expect(await ui.find({ key: 'copy' })).toMatchObject({ props: { label: 'Copy', hotkey: 'c' } })
      expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    } else {
      expect(await ui.find({ type: 'Svg' })).toMatchObject({
        props: {
          source: poseSvg('idle', false),
          alt: CATALOG.poses.idle.description,
          width: 128,
          height: 128,
          isInteractive: true,
        },
      })
      expect(await ui.find({ key: 'copy' })).toBeUndefined()
      expect(await ui.find({ type: 'Raster' })).toBeUndefined()
    }
    await ui.unmount()
  }
})

for (const surface of SURFACES) {
  test(`${surface}: the words chew, stream in with terms bold in the accent colour, and Again gives a new take`, { plugins: [PEEK] }, async ($, on) => {
    const w = world($, on)
    const answers = [replyFor(3, takes[0]!), replyFor(2, takes[1]!)]
    w.answer = (input, index, signal) => answerAfter(w.clock, 1000, answers[index] ?? '')(input, index, signal)
    await w.start()
    const ui = await w.mountPane(surface)

    await w.turnComplete(crashloop.chat, 'turn-1')
    // His line (from the A3 prototype) and the tablet's dim line (from the notes' view).
    const chewing = await ui.findAll({ type: 'Text', text: 'Me chew big words…' })
    expect(chewing.map(found => found.props)).toEqual([{ bold: true }, { dimColor: true }])
    await w.advance(1000)
    expect(await ui.find({ type: 'Text', text: /^Little box wake up/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Big Boss Rock/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^too much mammoth$/ })).toMatchObject({
      props: { bold: true, color: 'claude' },
    })
    if (surface === 'desktop') {
      expect(await ui.find({ type: 'Svg' })).toMatchObject({ props: { alt: CATALOG.poses.explaining.description } })
    }
    await w.advance(600 * 3)
    expect(await ui.find({ type: 'Text', text: /^Big Boss Rock/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /bigger belly/ })).toBeDefined()

    await ui.press({ key: 'again' })
    expect(w.modelCalls).toHaveLength(2)
    expect(w.modelCalls[1]!.prompt).toBe(w.modelCalls[0]!.prompt)
    expect((await w.peek()).cave.phase).toBe('chewing')
    await w.advance(1000)
    expect(await ui.find({ type: 'Text', text: /^Box like eat/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Little box wake up/ })).toBeUndefined()
    await ui.unmount()
  })
}

test('Copy puts the shown cave words on the terminal\'s clipboard', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  w.answer = answerAfter(w.clock, 1000, replyFor(3, takes[0]!))
  await w.start()
  const ui = await w.mountPane('terminal')
  await w.turnComplete(crashloop.chat, 'turn-1')
  await w.advance(1000 + 600 * 3)
  await ui.press({ key: 'copy' })
  const text = takes[0]!.map(paragraph => paragraph.map(segment => segment.text).join('')).join('\n\n')
  expect(w.copies).toEqual([{ text, surface: 'terminal' }])
})

test('a level picked goes to /config; picking the level already set does nothing', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  await w.start()
  for (const surface of SURFACES) {
    const ui = await w.mountPane(surface)
    await ui.select({ key: 'level', value: 'Caveman' })
    await ui.select({ key: 'level', value: 'Very caveman' })
    await ui.unmount()
  }
  expect(w.configSets).toEqual([
    { key: 'cave-talk.level', value: 'Very caveman' },
    { key: 'cave-talk.level', value: 'Very caveman' },
  ])
})

test('the level set in /config is the one the pane shows and the prompt asks for', { plugins: [PEEK], options: { level: 'Less cave' } }, async ($, on) => {
  const w = world($, on)
  w.answer = answerAfter(w.clock, 1000, 'SIZE 1\nBox fine.')
  await w.start()
  const ui = await w.mountPane('desktop')
  expect(await ui.find({ key: 'level' })).toMatchObject({ props: { value: 'Less cave' } })
  expect((await w.peek()).settings).toEqual({ level: 'less', autoOpen: true, model: 'haiku' })
  await w.turnComplete('All good.', 'turn-1')
  expect(w.modelCalls[0]).toMatchObject({ model: 'haiku', prompt: 'Level: less cave. Text: All good.' })
})

test('Same as Claude translates on the model Claude runs on', { plugins: [PEEK], options: { model: 'Same as Claude' } }, async ($, on) => {
  const w = world($, on)
  await w.start()
  await w.turnComplete('All good.', 'turn-1')
  expect(w.modelCalls[0]).toMatchObject({ model: 'claude-opus-5-5' })
})

test('the terminal sprite animates by blits, and a redraw draws the frame last shown', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  await w.start()
  const ui = await w.mountPane('terminal')
  const [first, second] = CATALOG.poses.idle.durationsMs
  await w.advance(first! - 1)
  expect(w.blits).toEqual([])
  await w.advance(1)
  expect(w.blits).toEqual([{ requestId: 'cave', key: 'sprite' }])
  await ui.redraw()
  expect(await ui.find({ type: 'Raster' })).toMatchObject({ props: { cells: frameCells('idle', 1) } })
  await w.advance(second!)
  expect(w.blits).toHaveLength(2)
  await ui.redraw()
  expect(await ui.find({ type: 'Raster' })).toMatchObject({ props: { cells: frameCells('idle', 0) } })
})

test('/cave opens the pane and answers with no text for the model to read', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  await w.start()
  expect(w.received['command.register']).toEqual([
    { name: 'cave', description: 'Open Cave Talk', immediate: true },
  ])
  const run = await $.command.run({
    command: 'cave',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(run.text).toBeUndefined()
  expect(run.context).toBeUndefined()
  expect(w.opened).toEqual([{ id: 'cave', title: 'Cave Talk', rows: 24 }])
})

function engineBand(on: Parameters<typeof world>[1]) {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>the engine's band</Text>
  })
}

test('opened unasked once, and only where it would be a sidebar', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  engineBand(on)
  await w.start()
  const narrow = await $.ui.mount({
    plugin: 'cave-talk',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: BAND,
    viewport: { columns: 160, rows: 50, isFullscreen: false },
  })
  expect(await narrow.find({ type: 'Text', text: "the engine's band" })).toBeDefined()
  expect(w.opened).toEqual([])
  await narrow.unmount()
  const full = await $.ui.mount({
    plugin: 'cave-talk',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: BAND,
    viewport: { columns: 160, rows: 50, isFullscreen: true },
  })
  await full.redraw()
  await w.settle()
  expect(w.opened).toEqual([{ id: 'cave', title: 'Cave Talk', rows: 24 }])
})

test('Open at start off: never opened unasked', { plugins: [PEEK], options: { autoOpen: false } }, async ($, on) => {
  const w = world($, on)
  engineBand(on)
  await w.start()
  const full = await $.ui.mount({
    plugin: 'cave-talk',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: BAND,
    viewport: { columns: 160, rows: 50, isFullscreen: true },
  })
  await full.redraw()
  await w.settle()
  expect(w.opened).toEqual([])
})
