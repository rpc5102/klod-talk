// Cave Talk's state contract: every value it keeps in $.state, under the
// plugin name 'cave-talk'. Four atoms: the session facts the tracker writes,
// the pose the director writes, the cave words the translator writes, and a
// copy of the settings. The view reads pose, cave and settings, never session.

/** Every pose in the sprite kit, as kit/caveman.json names them. */
export type PoseName =
  | 'idle'
  | 'explaining'
  | 'thinking'
  | 'happy'
  | 'impatient'
  | 'pilates'
  | 'bonk'
  | 'flint'
  | 'campfire'
  | 'sleep'
  | 'snack'
  | 'shrug'
  | 'panic'
  | 'read'
  | 'hunt'
  | 'carve'
  | 'shout'
  | 'dance'
  | 'sign'
  | 'paint'
  | 'petrock'
  | 'polish'
  | 'roast'
  | 'juggle'
  | 'forget'
  | 'facepalm'
  | 'suspicious'
  | 'buried'

/** How much cave: Less cave, Caveman, Very caveman, Literal rock. */
export type CaveLevel = 'less' | 'caveman' | 'very' | 'rock'

/** Which model translates: Haiku, or the model Claude itself runs on. */
export type TranslationModel = 'haiku' | 'same'

/** The turn running on the main loop. */
export type TurnFacts = {
  id: string
  startedAt: number
}

/** A tool call running on the main loop. */
export type RunningTool = {
  toolUseId: string
  tool: string
  startedAt: number
}

/** The main loop's last finished tool call. */
export type LastTool = {
  tool: string
  endedAt: number
  isError: boolean
  wasDenied: boolean
}

/**
 * How the last turn ended, for the result pose: Happy when it answered,
 * Shrug when it asked you something, refused, or died on an API error.
 */
export type TurnResult = {
  pose: 'happy' | 'shrug'
  why: 'done' | 'asks' | 'refusal' | 'error'
  asksUser: boolean
  endedAt: number
}

/** One of Cave Talk's own beats. Phase 1 has one: the translation failed. */
export type Beat = {
  name: 'failed'
  lengthMs: number
}

/** What the session is doing now. The tracker is the only writer. */
export type SessionFacts = {
  turn: TurnFacts | null
  running: RunningTool[]
  lastTool: LastTool | null
  result: TurnResult | null
  /** Panic shows until this time, at least 2 s. */
  panicUntil: number
  /** Own beats wait here so a 2-second hold cannot swallow them. */
  ownBeats: Beat[]
  /** Time of the last prompt.edit, or null. */
  typingAt: number | null
  /** Time of the last real event. */
  quietSince: number
  /** An answer was about real damage: no jokes for the rest of the session. */
  jokesOff: boolean
}

/** The pose on screen. The director writes it; the view reads it. */
export type PoseState = {
  name: PoseName
  /** When it started. */
  since: number
  /** The earliest it may change, unless something breaks the hold. */
  holdUntil: number
  /** The beat on screen, when the pose is one. */
  beat: Beat['name'] | null
  /** That beat's end, counted from when it was first shown. */
  beatUntil: number
  /** His line. */
  status: string
  /** What really happened, in plain words. */
  meta: string
  /** Show the first frame only, standing still. */
  isStill: boolean
}

/** A run of cave text; terms from the word list are drawn bold in the accent colour. */
export type Segment = {
  text: string
  isTerm: boolean
}

/** The text being translated, kept for Again, level changes and reloads. */
export type CaveSource = {
  id: string
  text: string
  level: CaveLevel
}

export type CavePhase = 'empty' | 'chewing' | 'streaming' | 'done' | 'failed'

/** The cave words. The translator merges into it, never replaces it. */
export type CaveWords = {
  source: CaveSource | null
  phase: CavePhase
  paragraphs: Segment[][]
  /** Paragraphs revealed so far. */
  shown: number
  /** Older answers dropped while chewing. */
  skipped: number
  /** When the last paragraph landed; 0 before any. */
  explainedAt: number
  /** 0 to 5, set only when a translation lands. */
  mammoths: number
  /** [term, cave word] pairs on screen now. */
  glossary: [string, string][]
  /** The whole cave answer for screen readers, set once per answer. */
  announce: string
}

/** A copy of the userConfig options. */
export type CaveSettings = {
  level: CaveLevel
  autoOpen: boolean
  model: TranslationModel
}

declare module 'claude-code' {
  interface PluginState {
    'cave-talk': {
      session: SessionFacts
      pose: PoseState
      cave: CaveWords
      settings: CaveSettings
    }
  }
}
