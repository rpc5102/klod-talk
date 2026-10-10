// The Pane's drawing. register.tsx's render hook reads the pose, cave and
// settings atoms and hands them here with the surface's elements; this never
// writes, and its buttons only call the actions it is given. It never sees
// the session atom, which changes on every keystroke.

import type { EngineInterface, RenderInput } from 'claude-code'

import type { CaveSettings, CaveWords, PoseState, Segment } from '../types'
import { plainText } from './reply'
import { LEVELS, levelInfo } from './settings'
import {
  COLUMNS,
  ROWS,
  SPRITE_KEY,
  describe,
  frameCells,
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

/** The paragraphs on screen now. */
export function shownParagraphs(words: CaveWords): Segment[][] {
  return words.paragraphs.slice(0, words.shown)
}

/** What Copy puts on the clipboard: the shown cave words as plain text. */
export function copyText(words: CaveWords): string {
  return shownParagraphs(words).map(plainText).join('\n\n')
}

function sprite(e: PaneInput, resolve: Resolve, state: PoseState) {
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

  return (
    <Svg
      source={poseSvg(state.name, state.isStill)}
      alt={describe(state.name)}
      width={SVG_SIZE}
      height={SVG_SIZE}
      isInteractive
    />
  )
}

export function draw(e: PaneInput, resolve: Resolve, state: PaneState, actions: PaneActions) {
  const { Box, Text, Button } = resolve(e)
  const { pose, cave: words } = state
  const columns = e.props.bodyColumns
  const isTerminal = e.surface === 'terminal'
  const isWide = columns >= (isTerminal ? COLUMNS + 18 : 36)

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

  const body =
    words.phase === 'empty'
      ? INTRO.map(paragraph)
      : words.phase === 'chewing'
        ? [<Text dimColor>{CHEWING}</Text>]
        : words.phase === 'failed'
          ? [<Text dimColor>{BRAIN_HURT}</Text>]
          : shownParagraphs(words).map(paragraph)

  return (
    <Box flexDirection="column" width={columns} gap={1}>
      <Box
        flexDirection={isWide ? 'row' : 'column'}
        alignItems={isWide ? 'center' : 'flex-start'}
        gap={isWide ? 2 : 0}
      >
        {sprite(e, resolve, pose)}
        <Box flexDirection="column" flexShrink={1}>
          <Text bold>{pose.status}</Text>
          <Text dimColor>{pose.meta}</Text>
        </Box>
      </Box>
      <Box flexDirection="column" gap={1}>
        {body}
      </Box>
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
