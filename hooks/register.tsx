// Cave Talk's hooks module: wires Claude Code's events to the parts, and
// nothing else. Every hook on Claude's own events passes `e` on unchanged
// with next(e), and the command answers with no text, so Cave Talk only
// watches. Hooks put their work on the lane and never wait on it.
//
// The engine follows `$` only into functions declared in this file, so every
// call on `$` is spelled out here, in `portFor`, and the parts get the port.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { DEFAULT_SETTINGS, EMPTY_CAVE, EMPTY_FACTS, FIRST_POSE } from './atoms'
import * as director from './director'
import { lane } from './lane'
import type { Port } from './port'
import { settingsFrom } from './settings'
import * as sprites from './sprites'
import * as tracker from './tracker'
import * as translator from './translator'
import { draw } from './view'

// The four atoms the pane draws from.
const session = atom({ plugin: 'cave-talk', key: 'session' } as const, EMPTY_FACTS)
const pose = atom({ plugin: 'cave-talk', key: 'pose' } as const, FIRST_POSE)
const cave = atom({ plugin: 'cave-talk', key: 'cave' } as const, EMPTY_CAVE)
const settings = atom({ plugin: 'cave-talk', key: 'settings' } as const, DEFAULT_SETTINGS)

const TITLE = 'Cave Talk'
/** Inline above the prompt, the pane asks for room for Klod and a few paragraphs. */
const PANE_ROWS = 24
/** Keystrokes closer together than this are one fact change. */
const TYPING_STEP_MS = 200

function debugLog($: EngineInterface, text: string): void {
  try {
    $.ui.log(`cave-talk: ${text}`, { to: 'debug' })
  } catch {
    // The log is best effort.
  }
}

function portFor($: EngineInterface): Port {
  return {
    now: () => $.clock.now(),
    after: (ms, fn) => $.clock.after(ms, fn),
    work: task =>
      lane(task, error => debugLog($, `error: ${error instanceof Error ? error.message : String(error)}`)),
    facts: () => read($, session),
    changeFacts: change => update($, session, change),
    words: () => read($, cave),
    changeWords: change => update($, cave, change),
    pose: () => read($, pose),
    setPose: async next => {
      await update($, pose, () => next)
    },
    settings: () => read($, settings),
    blit: async cells => {
      await $.ui.blit({ requestId: 'cave', key: sprites.SPRITE_KEY, cells })
    },
    complete: (request, signal) => $.model.complete(request, { signal }),
    claudeModel: () => $.session.model(),
    isGateway: async () => {
      const flags = await Promise.all([
        $.env.get('CLAUDE_CODE_USE_BEDROCK'),
        $.env.get('CLAUDE_CODE_USE_VERTEX'),
        $.env.get('CLAUDE_CODE_USE_FOUNDRY'),
        $.env.get('ANTHROPIC_BASE_URL'),
      ])
      return flags.some(flag => flag !== undefined && flag !== '' && flag !== '0')
    },
    log: text => debugLog($, text),
  }
}

/** A fact change on the lane, then the director. */
function track(port: Port, change: (now: number) => tracker.Change): void {
  void port.work(async () => {
    await port.changeFacts(change(await port.now()))
    await director.evaluate(port)
  })
}

export const register: Register = (on, options) => {
  const configured = settingsFrom(options)
  // Module variables start over on every reload; drawn state is in $.state.
  let hasAutoOpened = false
  let lastTypedAt = Number.NEGATIVE_INFINITY
  let calls = 0

  // Also after every reload, with every timer cancelled: fill what is empty,
  // then restart the wake timer, his frames and any translation in progress.
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cave', description: 'Open Cave Talk', immediate: true })
    const port = portFor($)
    await port.work(async () => {
      const { version } = await $.state.get({ plugin: 'cave-talk', key: 'session' })
      if (version > 0) {
        // A reload: the person already had their chance to see it opened unasked.
        hasAutoOpened = true
      } else {
        // A first start: fill the atoms that are still empty.
        const now = await port.now()
        await port.changeFacts(tracker.opened(now))
        await port.changeWords(words => words)
        await port.setPose({ ...FIRST_POSE, since: now })
      }
      await update($, settings, () => configured)
      await director.evaluate(port)
      sprites.restart(port, await port.pose())
      await translator.resume(port)
    })

    return next(e)
  })

  // A pass-through that opens the pane once, unasked, where it would be a sidebar.
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    if (configured.autoOpen && e.viewport?.isFullscreen === true && !hasAutoOpened) {
      hasAutoOpened = true
      void $.ui.open({ id: 'cave', title: TITLE, rows: PANE_ROWS })
    }

    return next(e)
  })

  // Asked: placed at any width. No text, because the model reads command output.
  on('command.run', { command: 'cave' }, async $ => {
    await $.ui.open({ id: 'cave', title: TITLE, rows: PANE_ROWS })

    return {}
  })

  on('prompt.edit', ($, e, next) => {
    const port = portFor($)
    void port.work(async () => {
      const now = await port.now()
      if (now - lastTypedAt < TYPING_STEP_MS) {
        return
      }
      lastTypedAt = now
      await port.changeFacts(tracker.typed(now))
      await director.evaluate(port)
    })

    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    track(portFor($), now => tracker.prompted(now))

    return next(e)
  })

  on('turn.start', ($, e, next) => {
    track(portFor($), now => tracker.turnStarted(e.turnId, now))

    return next(e)
  })

  // The main loop's tools only; a subagent's pass straight through.
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) {
      return next(e)
    }
    const port = portFor($)
    calls += 1
    const id = e.tool_use_id ?? `call-${calls}`
    const tool = String(e.tool)
    track(port, now => tracker.toolStarted(id, tool, now))
    const ran = await next(e)
    const outcome = { isError: ran.isError === true, wasDenied: ran.deny !== undefined }
    track(port, now => tracker.toolEnded(id, tool, outcome, now))

    return ran
  })

  // The main loop's answer goes to the translator, which is never awaited.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      const port = portFor($)
      const answer = e.reason === 'answer' ? e.answer : ''
      void port.work(async () => {
        // The chew starts before the turn ends, so the result never shows first.
        if (answer.trim() !== '') {
          await translator.offer(port, answer, e.turnId)
        }
        await port.changeFacts(tracker.turnEnded(e.reason, answer, await port.now()))
        await director.evaluate(port)
      })
    }

    return result
  })

  // A /clear ends the session with no new start: the facts and words reset.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      const port = portFor($)
      translator.stop()
      await port.work(async () => {
        await port.changeWords(() => EMPTY_CAVE)
        await port.changeFacts(tracker.reset(await port.now()))
        await director.evaluate(port)
      })
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: 'cave' }, async ($, e) => {
    const state = {
      pose: await read($, pose),
      cave: await read($, cave),
      settings: await read($, settings),
    }

    return draw(e, input => $.ui.resolve(input), state, {
      level: value => {
        // A setting: the change reloads the module, and session.start
        // translates the same answer again at the new level.
        void $.config.set({ key: 'cave-talk.level', value })
      },
      again: () => {
        const port = portFor($)
        void port.work(async () => {
          await port.changeFacts(tracker.pressed(await port.now()))
          await translator.again(port)
          await director.evaluate(port)
        })
      },
      copy: (text, surface) => {
        void $.ui.copy({ text, surface })
      },
    })
  })
}
