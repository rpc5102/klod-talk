// The userConfig options as the mod reads them. The manifest stores the
// labels a person sees in /config; the atoms keep short names.

import type { PluginOptions } from 'claude-code'

import type { CaveLevel, CaveSettings, TranslationModel } from '../types'
import { DEFAULT_SETTINGS } from './atoms'

export type LevelInfo = {
  level: CaveLevel
  /** What /config and the pane's picker show. */
  label: string
  /** How the translation prompt names it. */
  promptName: string
  /** His line while the cave words stream in. */
  status: string
}

export const LEVELS: readonly LevelInfo[] = [
  {
    level: 'less',
    label: 'Less cave',
    promptName: 'less cave',
    status: 'Me use more word. Still small word.',
  },
  { level: 'caveman', label: 'Caveman', promptName: 'caveman', status: 'Me make big words small.' },
  { level: 'very', label: 'Very caveman', promptName: 'very caveman', status: 'UGH. ME EXPLAIN.' },
  { level: 'rock', label: 'Literal rock', promptName: 'literal rock', status: 'Rock.' },
]

const MODELS: readonly { model: TranslationModel; label: string }[] = [
  { model: 'haiku', label: 'Haiku (fast)' },
  { model: 'same', label: 'Same as Claude' },
]

export function levelInfo(level: CaveLevel): LevelInfo {
  return LEVELS.find(info => info.level === level) ?? LEVELS[1]!
}

export function levelFromLabel(label: string): CaveLevel | undefined {
  return LEVELS.find(info => info.label === label)?.level
}

/** The settings atom's value for the options `register` received. */
export function settingsFrom(options: PluginOptions): CaveSettings {
  const level = levelFromLabel(String(options['level'] ?? ''))
  const model = MODELS.find(entry => entry.label === options['model'])?.model
  const autoOpen = options['autoOpen']

  return {
    level: level ?? DEFAULT_SETTINGS.level,
    autoOpen: typeof autoOpen === 'boolean' ? autoOpen : DEFAULT_SETTINGS.autoOpen,
    model: model ?? DEFAULT_SETTINGS.model,
  }
}
