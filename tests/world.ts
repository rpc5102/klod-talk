// The world beneath Cave Talk in an engine test: a mocked clock and
// environment, an answer for every call the mod makes on `$`, tools that
// answer as told (after a while, with a dialog first, or failing), a record
// of what reached the bottom of each event, and a peek at the mod's atoms.

import { expect, mock } from 'claude-code/testing'
import type { Engine, MockClock, Plugin } from 'claude-code/testing'
import type {
  ConfigSetArgs,
  ModelCompleteInput,
  ModelCompleteResult,
  On,
  PaneOpenArgs,
  PromptBox,
  PromptEditInput,
  RenderPropsOf,
  RenderSurface,
  RenderElement,
  RenderViewport,
  ToolCallInput,
  ToolCallResult,
  UiCopyArgs,
} from 'claude-code'

import type { CaveSettings, CaveWords, DisplayFacts, PoseState, SessionFacts } from '../types'
import type { Seg } from './fixtures'

/** A fixed moment to start the clock at: Oct 9, 2026. */
export const START = Date.UTC(2026, 9, 9, 9, 0, 0)

/** Reads every Cave Talk atom; written inline, as a test plugin must be. */
export const PEEK: Plugin = {
  name: 'peek',
  register(on) {
    on('command.run', { command: 'peek' }, async $ => {
      const atoms = {
        session: (await $.state.get({ plugin: 'cave-talk', key: 'session' })).value ?? null,
        pose: (await $.state.get({ plugin: 'cave-talk', key: 'pose' })).value ?? null,
        cave: (await $.state.get({ plugin: 'cave-talk', key: 'cave' })).value ?? null,
        settings: (await $.state.get({ plugin: 'cave-talk', key: 'settings' })).value ?? null,
        display: (await $.state.get({ plugin: 'cave-talk', key: 'display' })).value ?? null,
      }
      return { text: JSON.stringify(atoms) }
    })
  },
}

export type Atoms = {
  session: SessionFacts
  pose: PoseState
  cave: CaveWords
  settings: CaveSettings
  display: DisplayFacts
}

/** How the model answers one call; 'refuse' is the engine refusing to send it. */
export type ModelAnswer = (
  input: ModelCompleteInput,
  index: number,
  signal: AbortSignal,
) => Promise<ModelCompleteResult | 'refuse'> | ModelCompleteResult | 'refuse'

const USAGE = {
  input_tokens: 10,
  output_tokens: 10,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}

export function answered(text: string): ModelCompleteResult {
  return { isAnswered: true, text, usage: USAGE }
}

export function notAnswered(reason: 'empty-reply' | 'aborted'): ModelCompleteResult {
  return { isAnswered: false, reason, usage: USAGE }
}

export function apiError(): ModelCompleteResult {
  return { isAnswered: false, reason: 'api-error', status: 500, error: 'server_error', usage: USAGE }
}

/**
 * The model answering `text` after `ms`, as the engine does: an abort of the
 * call's signal cuts it at once and it resolves aborted.
 */
export function answerAfter(clock: MockClock, ms: number, text: string): ModelAnswer {
  return async (input, index, signal) => {
    if (signal.aborted) {
      return notAnswered('aborted')
    }
    const cut = new Promise<'cut'>(resolve => signal.addEventListener('abort', () => resolve('cut')))
    const done = await Promise.race([clock.sleep(ms).then(() => 'done' as const), cut])
    return done === 'cut' ? notAnswered('aborted') : answered(text)
  }
}

/** A model reply for a take: the SIZE line, then *terms* in blank-line paragraphs. */
export function replyFor(size: number, take: Seg[][]): string {
  const paragraphs = take.map(paragraph =>
    paragraph.map(segment => (segment.isTerm ? `*${segment.text}*` : segment.text)).join(''),
  )
  return [`SIZE ${size}`, ...paragraphs].join('\n\n')
}

export const PANE_PROPS: RenderPropsOf['Pane'] = {
  title: 'Cave Talk',
  isFocused: false,
  bodyColumns: 76,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 24 },
  view: {},
}

/** How a tool call answers at the bottom; the default answers at once. */
export type ToolAnswer = (e: ToolCallInput) => Promise<ToolCallResult> | ToolCallResult

/** A tool's answer: its record, and the text the model reads. */
export function toolResult(result: unknown, text: string): ToolCallResult {
  return { result, text } as ToolCallResult
}

/** A tool that reported an error, as a failing Bash command does. */
export function toolError(text: string): ToolCallResult {
  return { isError: true, result: text, text }
}

export type World = {
  clock: MockClock
  /** Every model call the mod made, in order. */
  modelCalls: ModelCompleteInput[]
  /** How the model answers the next calls; the default answers at once. */
  answer: ModelAnswer
  opened: PaneOpenArgs[]
  /** Every blit the sprite chain made: cells, or an image file by its path. */
  blits: { requestId: string; key: string; file?: string }[]
  /** How the terminal answers the next blits: nothing taken, or why not. */
  refuseBlit: () => string | undefined
  copies: UiCopyArgs[]
  configSets: ConfigSetArgs[]
  logs: string[]
  /** What reached the bottom of each event the test raised. */
  received: Record<string, unknown[]>
  peek: () => Promise<Atoms>
  start: (surface?: RenderSurface) => Promise<void>
  type: (text: string) => Promise<void>
  submit: (text: string) => Promise<void>
  turnStart: (turnId: string) => Promise<void>
  turnComplete: (answer: string, turnId: string, reason?: 'answer' | 'aborted' | 'refusal' | 'error') => Promise<string>
  bash: (command: string, toolUseId: string) => Promise<unknown>
  /** How the next tool calls answer at the bottom. */
  toolAnswer: ToolAnswer
  /** Raises a tool call on the main loop, or a subagent's, without waiting for it. */
  tool: (tool: string, args: Record<string, unknown>, toolUseId: string, agentId?: string) => Promise<ToolCallResult>
  /** The engine about to show a permission dialog for `tool`. */
  permission: (tool: string, agentId?: string) => Promise<void>
  /** The terminal drawing an approved call's progress row. */
  progress: (toolUseId: string) => Promise<void>
  /** Claude's text landing as a response row, mid-turn. */
  say: (text: string, uuid: string) => Promise<void>
  /** Lets the work under way run without the clock moving. */
  settle: () => Promise<void>
  advance: (ms: number) => Promise<void>
  mountPane: (surface: 'terminal' | 'desktop', viewport?: RenderViewport) => ReturnType<typeof mountPane>
}

/** The test's engine raises prompt.edit, though its typed nouns leave it out. */
function raiseEdit($: Engine, e: PromptEditInput): Promise<PromptBox> {
  const prompt = $.prompt as unknown as { edit: (input: PromptEditInput) => Promise<PromptBox> }
  return prompt.edit(e)
}

function mountPane($: Engine, surface: 'terminal' | 'desktop', viewport?: RenderViewport) {
  return $.ui.mount({
    plugin: 'cave-talk',
    surface,
    component: 'Pane',
    requestId: 'cave',
    props: PANE_PROPS,
    ...(viewport === undefined ? {} : { viewport }),
  })
}

/** The terminal's environment for a test: TERM, TERM_PROGRAM and the rest. */
export type WorldOptions = { env?: Readonly<Record<string, string>> }

export function world($: Engine, on: On, options: WorldOptions = {}): World {
  const clock = mock.clock(on, { now: START })
  mock.env(on, options.env ?? {})
  const received: Record<string, unknown[]> = {}
  const keep = (event: string, e: unknown) => {
    ;(received[event] ??= []).push(e)
  }

  const w: World = {
    toolAnswer: () => toolResult({ stdout: 'ok', stderr: '', interrupted: false }, 'ok'),
    tool: (tool, args, toolUseId, agentId) => {
      const input = { tool, ...args, tool_use_id: toolUseId, ...(agentId === undefined ? {} : { agentId }) }
      return $.tool.call(input as unknown as Parameters<typeof $.tool.call>[0]) as Promise<ToolCallResult>
    },
    permission: async (tool, agentId) => {
      await $.classic.PermissionRequest({
        tool_name: tool,
        tool_input: {},
        ...(agentId === undefined ? {} : { agent_id: agentId }),
      })
      await clock.settle()
    },
    progress: async toolUseId => {
      await $.ui.render({
        surface: 'terminal',
        component: 'ToolProgress',
        requestId: toolUseId,
        props: { tool_use_id: toolUseId, kind: 'background_hint', hint: '(ctrl+b to run in background)' },
      })
      await clock.settle()
    },
    say: async (text, uuid) => {
      await $.session.append({
        message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text }] },
        door: 'response',
        origin: { kind: 'model', model: 'claude-opus-5-5' },
        uuid,
      })
      await clock.settle()
    },
    clock,
    modelCalls: [],
    answer: () => answered('SIZE 1\nMe fine.'),
    opened: [],
    blits: [],
    refuseBlit: () => undefined,
    copies: [],
    configSets: [],
    logs: [],
    received,
    peek: async () => {
      const run = await $.command.run({
        command: 'peek',
        args: '',
        origin: { kind: 'composer' },
        presentation: { isFullscreen: false, columns: 80 },
      })
      return JSON.parse(run.text ?? 'null') as Atoms
    },
    start: async (surface = 'terminal') => {
      await $.session.start({ cwd: '/work', surface, isInteractive: true })
      await clock.settle()
    },
    type: async text => {
      await raiseEdit($, { origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: text })
      await clock.settle()
    },
    submit: async text => {
      await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
      await clock.settle()
    },
    turnStart: async turnId => {
      await $.turn.start({ text: 'go', turnId })
      await clock.settle()
    },
    turnComplete: async (answer, turnId, reason = 'answer') => {
      const done = await $.turn.complete(
        reason === 'refusal'
          ? { answer, durationMs: 1000, isAborted: false, turnId, reason, refusal: { category: null, explanation: null } }
          : { answer, durationMs: 1000, isAborted: reason === 'aborted', turnId, reason },
      )
      await clock.settle()
      return done.text
    },
    bash: async (command, toolUseId) => {
      const ran = await $.tool.call({ tool: 'Bash', command, tool_use_id: toolUseId })
      await clock.settle()
      return ran
    },
    settle: () => clock.settle(),
    advance: ms => clock.advance(ms),
    mountPane: (surface, viewport) => mountPane($, surface, viewport),
  }

  // The calls the mod makes on `$`.
  on('command.register', ($, e) => {
    keep('command.register', e)
    return { value: { command: e.name } }
  })
  on('ui.open', ($, e) => {
    w.opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('ui.blit', ($, e) => {
    const file = 'source' in e && 'file' in e.source ? e.source.file : undefined
    w.blits.push({ requestId: e.requestId, key: e.key, ...(file === undefined ? {} : { file }) })
    const refusal = w.refuseBlit()
    return { value: refusal === undefined ? {} : { deny: refusal } }
  })
  on('ui.copy', ($, e) => {
    w.copies.push(e)
    return { value: { isCopied: true } }
  })
  on('config.set', ($, e) => {
    w.configSets.push({ key: e.key, value: e.value })
    return { value: e.value }
  })
  // Cave Talk logs why a translation failed; an error on its lane fails the test.
  on('ui.log', ($, e) => {
    w.logs.push(e.text)
    expect(e.to, 'Cave Talk logs to the debug log only').toBe('debug')
    expect(e.text.startsWith('cave-talk: error:'), `Cave Talk logged ${e.text}`).toBe(false)
    return { value: undefined }
  })
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('model.complete', async ($, e, next) => {
    w.modelCalls.push(e)
    const answer = await w.answer(e, w.modelCalls.length - 1, next.signal)
    return answer === 'refuse' ? { deny: 'model not allowed' } : { value: answer }
  })

  // The events the test raises, answered as the engine would.
  on('session.start', ($, e) => {
    keep('session.start', e)
    return { cwd: e.cwd }
  })
  on('session.end', ($, e) => {
    keep('session.end', e)
    return { sessionId: e.sessionId }
  })
  on('prompt.edit', ($, e) => {
    keep('prompt.edit', e)
    return { text: e.text + e.inputText, cursor: e.text.length + e.inputText.length }
  })
  on('prompt.submit', ($, e) => {
    keep('prompt.submit', e)
    return { text: e.text }
  })
  on('turn.start', ($, e) => {
    keep('turn.start', e)
    return { turnId: e.turnId }
  })
  on('turn.complete', ($, e) => {
    keep('turn.complete', e)
    return { text: e.answer }
  })
  on('tool.call', ($, e) => {
    keep('tool.call', e)
    return w.toolAnswer(e)
  })
  on('classic.PermissionRequest', ($, e) => {
    keep('classic.PermissionRequest', e)
    return {}
  })
  on('ui.render', { component: 'ToolProgress' }, ($, e) => {
    keep('ui.render.ToolProgress', e)
    const { Text } = $.ui.resolve(e)
    return h(Text, { dimColor: true }, e.props.hint) as RenderElement
  })
  on('session.append', ($, e, next) => {
    keep('session.append', e)
    return next(e)
  })

  return w
}
