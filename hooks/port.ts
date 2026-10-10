// What the parts may do outside themselves. The engine reads a hooks
// module's source to learn what it calls, and follows `$` only into functions
// declared in the module's own file, never across an import. So register.tsx
// builds this port from `$`, with every call spelled out there, and the parts
// take the port instead of `$`.

import type { ModelCompleteRequest, ModelCompleteResult, Timer } from 'claude-code'

import type { CaveSettings, CaveWords, PoseState, SessionFacts } from '../types'

export type Port = {
  /** Milliseconds since the epoch, now. */
  now: () => Promise<number>
  /** Calls `fn` once after `ms`; a reload cancels it. */
  after: (ms: number, fn: () => void) => Timer
  /** Puts work on the lane: in order, never awaited by a hook. */
  work: (task: () => Promise<void>) => Promise<void>
  facts: () => Promise<SessionFacts>
  /** The tracker's write: the only one to the session atom. */
  changeFacts: (change: (facts: SessionFacts) => SessionFacts) => Promise<SessionFacts>
  words: () => Promise<CaveWords>
  changeWords: (change: (words: CaveWords) => CaveWords) => Promise<CaveWords>
  pose: () => Promise<PoseState>
  setPose: (next: PoseState) => Promise<void>
  settings: () => Promise<CaveSettings>
  /** Paints a frame into the terminal sprite without a redraw. */
  blit: (cells: string) => Promise<void>
  complete: (request: ModelCompleteRequest, signal: AbortSignal) => Promise<ModelCompleteResult>
  /** The model Claude itself runs on. */
  claudeModel: () => Promise<string>
  /** True behind Bedrock, Vertex, Foundry or a gateway. */
  isGateway: () => Promise<boolean>
}
