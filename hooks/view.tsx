// The Pane's drawing. register.tsx's render hook reads the pose, cave,
// settings and display atoms and hands them here with the surface's
// elements; this never writes, and its buttons only call the actions it is
// given. It never sees the session atom, which changes on every keystroke.

import type { EngineInterface, RenderInput } from 'claude-code'

import type { CaveSettings, CaveWords, DisplayFacts, PoseState, Segment } from '../types'
import { METER_COLUMNS, METER_ROWS, meterCells, meterSvg, meterText } from './meter'
import { plainText } from './reply'
import { LEVELS, levelInfo } from './settings'
import {
  COLUMNS,
  IMAGE_COLUMNS,
  IMAGE_ROWS,
  ROWS,
  SPRITE_KEY,
  describe,
  frameCells,
  framePath,
  frameShown,
  poseSvg,
} from './sprites'

export type PaneInput = RenderInput<'Pane'>

/** `$.ui.resolve`, passed in, since `$` itself never leaves register.tsx. */
export type Resolve = EngineInterface['ui']['resolve']

export type PaneState = {
  pose: PoseState
  cave: CaveWords
  settings: CaveSettings
  display: DisplayFacts
  /** The plugin's folder, where the image frames are. */
  root: string
}

export type PaneActions = {
  /** A level picked: its /config label. */
  level: (label: string) => void
  again: () => void
  copy: (text: string, surface: PaneInput['surface']) => void
}

/** Word-list terms: bold as well as coloured, so colour is never alone. */
const ACCENT = 'claude'

/** The desktop sprite's size in CSS pixels; the kit scales by whole numbers. */
const SVG_SIZE = 128

/** What the pane says before any answer: from the first-run board. */
const INTRO: Segment[][] = [
  [
    { text: 'Me read what Claude say. Me say it again with ', isTerm: false },
    { text: 'small words', isTerm: true },
    { text: '. Funny words. Not useful words.', isTerm: false },
  ],
  [{ text: 'Claude explain hard thing? Look here. Me explain like you caveman.', isTerm: false }],
]

export const CHEWING = 'Me chew big words…'
export const BRAIN_HURT = 'Me brain hurt.'
export const PINNED_LABEL = 'Last cave answer'
export const METER_LABEL = 'Problem size'

/** The desktop meter's size in CSS pixels: three to a mammoth pixel. */
const METER_SCALE = 3

/** What the tablet shows: the intro, the chew, a tool caption, the cave words, or the failure. */
export type Tablet = 'intro' | 'chewing' | 'caption' | 'words' | 'failed'

export function tabletOf(words: CaveWords): Tablet {
  if (words.phase === 'chewing') {
    return 'chewing'
  }
  if (words.phase === 'streaming') {
    return 'words'
  }
  if (words.caption !== null) {
    return 'caption'
  }
  if (words.phase === 'failed') {
    return 'failed'
  }
  return words.phase === 'empty' ? 'intro' : 'words'
}

/** The paragraphs on screen now. */
export function shownParagraphs(words: CaveWords): Segment[][] {
  return words.paragraphs.slice(0, words.shown)
}

/** What Copy puts on the clipboard: the shown cave words as plain text. */
export function copyText(words: CaveWords): string {
  return shownParagraphs(words).map(plainText).join('\n\n')
}

function sprite(e: PaneInput, resolve: Resolve, pane: PaneState) {
  const state = pane.pose
  if (e.surface === 'terminal' && pane.display.terminalArt === 'image') {
    const { Image } = resolve(e)
    const file = framePath(pane.root, state.name, frameShown(state))
    return (
      <Image
        key={SPRITE_KEY}
        source={{ file, format: 'png' }}
        columns={IMAGE_COLUMNS}
        rows={IMAGE_ROWS}
        alt={describe(state.name)}
      />
    )
  }
  if (e.surface === 'terminal') {
    const { Raster } = resolve(e)
    return (
      <Raster
        key={SPRITE_KEY}
        columns={COLUMNS}
        rows={ROWS}
        cells={frameCells(state.name, frameShown(state))}
      />
    )
  }
  const { Svg } = resolve(e)

  // Drawn as an image, not in an interactive frame: a frame painted a white
  // box in the desktop app's dark mode and reloaded, flickering, on a click.
  return (
    <Svg
      source={poseSvg(state.name, state.isStill)}
      alt={describe(state.name)}
      width={SVG_SIZE}
      height={SVG_SIZE}
    />
  )
}

/** How many columns the sprite takes on this surface. */
function spriteColumns(e: PaneInput, pane: PaneState): number {
  if (e.surface !== 'terminal') {
    return 18
  }
  return pane.display.terminalArt === 'image' ? IMAGE_COLUMNS : COLUMNS
}

export function draw(e: PaneInput, resolve: Resolve, state: PaneState, actions: PaneActions) {
  const { Box, Text, Button } = resolve(e)
  const { pose, cave: words } = state
  const columns = e.props.bodyColumns
  const isTerminal = e.surface === 'terminal'
  const isWide = columns >= spriteColumns(e, state) + 18

  const paragraph = (segments: readonly Segment[]) => (
    <Text>
      {segments.map(segment =>
        segment.isTerm ? (
          <Text bold color={ACCENT}>
            {segment.text}
          </Text>
        ) : (
          segment.text
        ),
      )}
    </Text>
  )

  const tablet = tabletOf(words)
  const body =
    tablet === 'intro'
      ? INTRO.map(paragraph)
      : tablet === 'chewing'
        ? [<Text dimColor>{CHEWING}</Text>]
        : tablet === 'failed'
          ? [<Text dimColor>{BRAIN_HURT}</Text>]
          : tablet === 'caption'
            ? [paragraph(words.caption?.segments ?? [])]
            : shownParagraphs(words).map(paragraph)

  // While captions run, the last translation's first paragraph stays pinned under them.
  const pinned =
    tablet === 'caption' && words.pinned !== null ? (
      <Box key="pinned" flexDirection="column">
        <Text dimColor bold>
          {PINNED_LABEL}
        </Text>
        {paragraph(words.pinned)}
      </Box>
    ) : null

  return (
    <Box flexDirection="column" width={columns} gap={1}>
      <Box
        flexDirection={isWide ? 'row' : 'column'}
        alignItems={isWide ? 'center' : 'flex-start'}
        gap={isWide ? 2 : 0}
      >
        {sprite(e, resolve, state)}
        <Box flexDirection="column" flexShrink={1}>
          <Text bold>{pose.status}</Text>
          <Text dimColor>{pose.meta}</Text>
        </Box>
      </Box>
      <Box flexDirection="column" gap={1}>
        {body}
      </Box>
      {pinned}
      {meter(e, resolve, words)}
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {levelPicker(e, resolve, state.settings, actions)}
        <Button key="again" label="Again" hotkey="a" variant="primary" onPress={actions.again} />
        {isTerminal ? (
          <Button
            key="copy"
            label="Copy"
            hotkey="c"
            onPress={press => {
              const text = copyText(words)
              if (text !== '') {
                actions.copy(text, press.surface)
              }
            }}
          />
        ) : null}
      </Box>
    </Box>
  )
}

/**
 * The mammoth meter and its text twin, once a translation has landed. It
 * holds still until the next one lands.
 */
function meter(e: PaneInput, resolve: Resolve, words: CaveWords) {
  if (words.paragraphs.length === 0) {
    return null
  }
  const { Box, Text } = resolve(e)
  const label = meterText(words.mammoths)
  let art = null
  if (e.surface === 'terminal') {
    const { Raster } = resolve(e)
    art = <Raster key="meter" columns={METER_COLUMNS} rows={METER_ROWS} cells={meterCells(words.mammoths)} />
  } else {
    const { Svg } = resolve(e)
    art = (
      <Svg
        source={meterSvg(words.mammoths)}
        alt={label}
        width={METER_COLUMNS * METER_SCALE}
        height={METER_ROWS * 2 * METER_SCALE}
      />
    )
  }

  return (
    <Box key="meter-row" flexDirection="column">
      <Text dimColor bold>
        {METER_LABEL}
      </Text>
      <Box flexDirection="row" alignItems="center" columnGap={2} flexWrap="wrap">
        {art}
        <Text>{label}</Text>
      </Box>
    </Box>
  )
}

/** The level picker. Mobile has no Select and draws no mod panes today, so it gets none. */
function levelPicker(e: PaneInput, resolve: Resolve, chosen: CaveSettings, actions: PaneActions) {
  if (e.surface === 'mobile') {
    return null
  }
  const { Select } = resolve(e)
  const current = levelInfo(chosen.level).label

  return (
    <Select
      key="level"
      label="Cave level"
      options={LEVELS.map(info => ({ value: info.label, label: info.label }))}
      value={current}
      onSelect={label => {
        if (label !== current) {
          actions.level(label)
        }
      }}
    />
  )
}
