// The mammoth meter's art and its text twin, as pure functions, and the
// meter drawn on each surface: a Raster on the terminal, an Svg elsewhere.

import { describe, expect, test } from 'claude-code/testing'

import { METER_COLUMNS, METER_ROWS, MAMMOTHS, meterCells, meterPixels, meterSvg, meterText } from '../hooks/meter'
import { A4 } from './fixtures'
import { PEEK, answered, replyFor, world } from './world'

const take = A4.levels.find(level => level.name === 'Caveman')!.takes[0]!

/** Painted pixels of one colour. */
function painted(count: number, color: number): number {
  return meterPixels(count)
    .flat()
    .filter(pixel => pixel === color).length
}

describe('the meter', () => {
  test('the text twin', () => {
    expect(meterText(3)).toBe('3 of 5 mammoths')
    expect(meterText(0)).toBe('0 of 5 mammoths')
    expect(meterText(9)).toBe('5 of 5 mammoths')
    expect(meterText(-1)).toBe('0 of 5 mammoths')
  })

  test('five mammoths, as many filled as the size says', () => {
    const empty = painted(0, 0xa29e92)
    expect(empty % MAMMOTHS).toBe(0)
    const each = empty / MAMMOTHS
    for (let size = 0; size <= MAMMOTHS; size += 1) {
      expect(painted(size, 0xa29e92)).toBe(each * (MAMMOTHS - size))
    }
    expect(painted(2, 0xf5efe1)).toBe(2)
  })

  test('cells fit the Raster, two pixels to a cell; the SVG is one rect per run', () => {
    const cells = meterCells(3)
    const bytes = (cells.length / 4) * 3 - (cells.match(/=+$/)?.[0].length ?? 0)
    expect(bytes).toBe(METER_COLUMNS * METER_ROWS * 3 * 4)
    expect(meterCells(3)).toBe(cells)
    expect(meterCells(3)).not.toBe(meterCells(4))
    const svg = meterSvg(3)
    expect(svg).toContain(`viewBox="0 0 ${METER_COLUMNS} ${METER_ROWS * 2}"`)
    expect(svg).toContain('fill="#5e3a22"')
    expect(meterSvg(0)).not.toContain('fill="#5e3a22"')
  })
})

test('the meter shows once a translation lands, on each surface', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  w.answer = () => answered(replyFor(3, take))
  await w.start()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await w.mountPane(surface)
    expect(await ui.find({ type: 'Text', text: 'Problem size' })).toBeUndefined()
    await ui.unmount()
  }
  await w.turnComplete(A4.answer.join('\n\n'), 'turn-1')
  await w.advance(5000)

  const terminal = await w.mountPane('terminal')
  expect(await terminal.find({ type: 'Raster', key: 'meter' })).toMatchObject({
    props: { columns: METER_COLUMNS, rows: METER_ROWS, cells: meterCells(3) },
  })
  expect(await terminal.find({ type: 'Text', text: '3 of 5 mammoths' })).toBeDefined()
  await terminal.unmount()

  const desktop = await w.mountPane('desktop')
  const svgs = await desktop.findAll({ type: 'Svg' })
  expect(svgs.map(svg => svg.props['alt'])).toContain('3 of 5 mammoths')
  expect(svgs.find(svg => svg.props['alt'] === '3 of 5 mammoths')?.props['source']).toBe(meterSvg(3))
  expect(await desktop.find({ type: 'Raster' })).toBeUndefined()
  expect(await desktop.find({ type: 'Text', text: '3 of 5 mammoths' })).toBeDefined()
  await desktop.unmount()
})
