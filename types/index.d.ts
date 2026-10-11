// Cave Talk's state contract: every value it keeps in $.state, under the
// plugin name 'cave-talk'. Five atoms: the session facts the tracker writes,
// the pose the director writes, the cave words the translator and captions
// write, a copy of the settings, and how the terminal draws Klod. The view
// reads pose, cave, settings and display, never session.

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

/**
 * What a tool call does, decided once per call from its name and arguments.
 * Everything downstream switches on the kind, never on raw command strings.
 */
export type ToolKind = 'read' | 'search' | 'edit' | 'web' | 'test' | 'build' | 'deploy' | 'install' | 'other'

/** A test, build or deploy run: the runs whose failure means Panic, Bonk and Shrug. */
export type RunKind = 'test' | 'build' | 'deploy'

/** The turn running on the main loop. */
export type TurnFacts = {
  id: string
  startedAt: number
  /** The last test, build or deploy run in this turn failed. */
  lastRunFailed: boolean
  /** Which kind of run that was, or null before any. */
  lastRunKind: RunKind | null
  /** A deploy worked (a push, an apply, a merged PR): the turn ends on Campfire. */
  isBigWin: boolean
  /** The files this turn edited, for "Claude edited 2 files". */
  edited: string[]
}

/** A tool call running on the main loop. */
export type RunningTool = {
  toolUseId: string
  tool: string
  kind: ToolKind
  /** What it works on, in plain words: a path, a program, a host. */
  summary: string
  /** When it started, or when its permission dialog closed. */
  startedAt: number
}

/** The main loop's last finished tool call. */
export type LastTool = {
  tool: string
  kind: ToolKind
  endedAt: number
  isError: boolean
  wasDenied: boolean
}

/**
 * A dialog waiting on the person: a permission ask (Sign), or Claude asking
 * a question through AskUserQuestion or ExitPlanMode (Shrug).
 */
export type PermissionWait = {
  tool: string
  since: number
  isQuestion: boolean
}

/** What Panic is about: an API error, or a failed test, build or deploy run. */
export type PanicWhy = 'error' | RunKind

/**
 * How the last turn ended, for the result pose: Campfire for a big win,
 * Happy when it answered, Shrug when it asked you something, a test, build
 * or deploy run failed last, it refused, or died on an API error.
 */
export type TurnResult = {
  pose: 'campfire' | 'happy' | 'shrug'
  why: 'win' | 'done' | 'asks' | 'failed' | 'refusal' | 'error'
  asksUser: boolean
  /** Which run failed last, for the Shrug's plain-words line. */
  failedRun: RunKind | null
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
  /** A dialog is up, or null. */
  permissionWait: PermissionWait | null
  result: TurnResult | null
  /** Panic shows until this time, at least 2 s. */
  panicUntil: number
  /** What the last Panic was about. */
  panicWhy: PanicWhy
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

/** One tool's caption: a line when it starts, and one more when its result lands. */
export type Caption = {
  toolUseId: string
  segments: Segment[]
}

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
  /** The last translation's first paragraph, kept under the tool captions. */
  pinned: Segment[] | null
  /** The current tool caption, or null; it goes when Claude speaks again. */
  caption: Caption | null
  /** 0 to 5, set only when a translation lands. */
  mammoths: number
  /** [term, cave word] pairs on screen now. */
  glossary: [string, string][]
  /** The whole cave answer for screen readers, set once per answer. */
  announce: string
  /** Why the last translation failed, in plain words; null when it did not. */
  problem: string | null
}

/**
 * How the terminal draws Klod: a real image where it shows them (kitty,
 * Ghostty), or half-block cells everywhere else.
 */
export type TerminalArt = 'image' | 'cells'

/** What the surfaces can draw, as Cave Talk found out. */
export type DisplayFacts = {
  terminalArt: TerminalArt
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
      display: DisplayFacts
    }
  }
}
