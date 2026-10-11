// What the five atoms read as before anything is written. The atoms
// themselves are consts in register.tsx, where the engine's scan can list
// them; their types are declared once in types/index.d.ts.

import type { CaveSettings, CaveWords, DisplayFacts, PoseState, SessionFacts } from '../types'

export const EMPTY_FACTS: SessionFacts = {
  turn: null,
  running: [],
  lastTool: null,
  permissionWait: null,
  result: null,
  panicUntil: 0,
  panicWhy: 'error',
  ownBeats: [],
  typingAt: null,
  quietSince: 0,
  jokesOff: false,
}

export const FIRST_POSE: PoseState = {
  name: 'idle',
  since: 0,
  holdUntil: 0,
  beat: null,
  beatUntil: 0,
  status: 'Me wait. Me watch.',
  meta: 'Nothing happening',
  isStill: false,
}

export const EMPTY_CAVE: CaveWords = {
  source: null,
  phase: 'empty',
  paragraphs: [],
  shown: 0,
  skipped: 0,
  explainedAt: 0,
  pinned: null,
  caption: null,
  mammoths: 0,
  glossary: [],
  announce: '',
  problem: null,
}

export const FIRST_DISPLAY: DisplayFacts = {
  terminalArt: 'cells',
}

export const DEFAULT_SETTINGS: CaveSettings = {
  level: 'caveman',
  autoOpen: true,
  model: 'haiku',
}
