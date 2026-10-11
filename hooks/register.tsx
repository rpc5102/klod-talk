// Cave Talk's hooks module: wires Claude Code's events to the parts, and
// nothing else. Every hook on Claude's own events passes `e` on unchanged
// with next(e), and the command answers with no text, so Cave Talk only
// watches. Hooks put their work on the lane and never wait on it.
//
// The engine follows `$` only into functions declared in this file, so every
// call on `$` is spelled out here, in `portFor`, and the parts get the port.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TerminalArt } from '../types'
import { DEFAULT_SETTINGS, EMPTY_CAVE, EMPTY_FACTS, FIRST_DISPLAY, FIRST_POSE } from './atoms'
import * as captions from './captions'
import * as director from './director'
import type { Args } from './kinds'
import { classify } from './kinds'
import { lane } from './lane'
import type { Port } from './port'
import { settingsFrom } from './settings'
import * as sprites from './sprites'
import * as tracker from './tracker'
import * as translator from './translator'
import { draw } from './view'

// The five atoms: the pane draws from all but the session facts.
const session = atom({ plugin: 'cave-talk', key: 'session' } as const, EMPTY_FACTS)
const pose = atom({ plugin: 'cave-talk', key: 'pose' } as const, FIRST_POSE)
const cave = atom({ plugin: 'cave-talk', key: 'cave' } as const, EMPTY_CAVE)
const settings = atom({ plugin: 'cave-talk', key: 'settings' } as const, DEFAULT_SETTINGS)
const display = atom({ plugin: 'cave-talk', key: 'display' } as const, FIRST_DISPLAY)

const TITLE = 'Cave Talk'

/** Inline above the prompt, the pane asks for room for Klod and a few paragraphs. */
function paneRows(art: TerminalArt): number {
  return art === 'image' ? 16 : 24
}
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
    root: $.plugin.root,
    terminalArt: async () => (await read($, display)).terminalArt,
    setTerminalArt: async art => {
      await update($, display, facts => ({ ...facts, terminalArt: art }))
    },
    blitCells: async cells => (await $.ui.blit({ requestId: 'cave', key: sprites.SPRITE_KEY, cells })).deny,
    blitImage: async file =>
      (await $.ui.blit({ requestId: 'cave', key: sprites.SPRITE_KEY, source: { file, format: 'png' } }))
        .deny,
    isImageTerminal: async () => {
      const [term, program, kitty] = await Promise.all([
        $.env.get('TERM'),
        $.env.get('TERM_PROGRAM'),
        $.env.get('KITTY_WINDOW_ID'),
      ])
      return /kitty|ghostty/i.test(`${term ?? ''} ${program ?? ''}`) || (kitty ?? '') !== ''
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
  // The project folder, for paths in his lines; session.start sets it again after a reload.
  let cwd = ''
  // The tool whose dialog is up, so a progress row costs nothing when none is.
  let asking: string | null = null
  // The last mid-turn text sent to the translator, so the answer is not sent twice.
  let lastSpoken: string | null = null

  // Also after every reload, with every timer cancelled: fill what is empty,
  // then restart the wake timer, his frames and any translation in progress.
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'klod', description: 'Open Cave Talk', immediate: true })
    cwd = e.cwd
    const port = portFor($)
    await port.work(async () => {
      const { version } = await $.state.get({ plugin: 'cave-talk', key: 'session' })
      if (version > 0) {
        // A reload: the person already had their chance to see it opened unasked.
        hasAutoOpened = true
        // Atoms an older build wrote get the fields this one reads.
        await port.changeFacts(tracker.upgraded())
        await port.changeWords(words => ({ ...EMPTY_CAVE, ...words }))
      } else {
        // A first start: fill the atoms that are still empty.
        const now = await port.now()
        await port.changeFacts(tracker.opened(now))
        await port.changeWords(words => words)
        await port.setPose({ ...FIRST_POSE, since: now })
      }
      await update($, settings, () => configured)
      // Once per session: kitty and Ghostty show him as a real image, the rest in cells.
      if ((await $.state.get({ plugin: 'cave-talk', key: 'display' })).version === 0) {
        await port.setTerminalArt((await port.isImageTerminal()) ? 'image' : 'cells')
      }
      await director.evaluate(port)
      sprites.restart(port, await port.pose())
      await translator.resume(port)
    })

    return next(e)
  })

  // A pass-through that opens the pane once, unasked, where it would be a sidebar.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (configured.autoOpen && e.viewport?.isFullscreen === true && !hasAutoOpened) {
      hasAutoOpened = true
      const rows = paneRows((await read($, display)).terminalArt)
      void $.ui.open({ id: 'cave', title: TITLE, rows })
    }

    return next(e)
  })

  // Asked: placed at any width. No text, because the model reads command output.
  on('command.run', { command: 'klod' }, async $ => {
    const rows = paneRows((await read($, display)).terminalArt)
    await $.ui.open({ id: 'cave', title: TITLE, rows })

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

  // The main loop's tools: a pose and a caption each. A subagent's pass
  // straight through, and only close a dialog they raised.
  on('tool.call', async ($, e, next) => {
    const port = portFor($)
    const tool = String(e.tool)
    if (e.agentId !== undefined) {
      const ran = await next(e)
      if (asking === tool) {
        asking = null
        track(port, now => tracker.dialogSettled(tool, now))
      }
      return ran
    }
    calls += 1
    const id = e.tool_use_id ?? `call-${calls}`
    const args = e as unknown as Args
    const call = classify(tool, args, cwd)
    void port.work(async () => {
      const now = await port.now()
      await port.changeFacts(tracker.toolStarted({ toolUseId: id, tool, ...call }, now))
      await captions.show(port, id, captions.started(tool, args, call))
      await director.evaluate(port)
    })
    const ran = await next(e)
    if (asking === tool) {
      asking = null
    }
    const outcome = { isError: ran.isError === true, wasDenied: ran.deny !== undefined }
    void port.work(async () => {
      const now = await port.now()
      await port.changeFacts(tracker.toolEnded(id, tool, call.kind, outcome, now))
      const text = ran.text ?? ran.deny ?? ''
      await captions.land(port, id, captions.landed(tool, args, call, { ...outcome, result: ran.result, text }))
      await director.evaluate(port)
    })

    return ran
  })

  // A permission dialog is about to show: Sign, or Shrug when it is Claude
  // asking you something. Auto-mode decisions raise none.
  on('classic.PermissionRequest', ($, e, next) => {
    const tool = e.tool_name
    asking = tool
    track(portFor($), now => tracker.permissionAsked(tool, now))

    return next(e)
  })

  // An approved call's progress row is drawn: it is running, so Sign ends.
  on('ui.render', { component: 'ToolProgress' }, ($, e, next) => {
    if (asking !== null) {
      // The tracker ends Sign only when the row is the asking call's.
      const id = e.props.tool_use_id
      track(portFor($), now => tracker.toolRunning(id, now))
    }

    return next(e)
  })

  // Mid-turn text over 40 words is a real explanation: it gets translated.
  on('session.append', { door: 'response' }, async ($, e, next) => {
    const stored = await next(e)
    if (e.agentId === undefined && e.message.type === 'assistant') {
      const text = e.message.content
        .filter(block => block.type === 'text' && typeof block['text'] === 'string')
        .map(block => String(block['text']))
        .join('\n\n')
      if (translator.isWorthTranslating(text)) {
        lastSpoken = text.trim()
        const port = portFor($)
        void port.work(() => translator.offer(port, text, e.uuid))
      }
    }

    return stored
  })

  // The main loop's answer goes to the translator, which is never awaited.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      const port = portFor($)
      const answer = e.reason === 'answer' ? e.answer : ''
      // Sent already as mid-turn text: once is enough.
      const isSent = answer.trim() === lastSpoken
      lastSpoken = null
      asking = null
      void port.work(async () => {
        // The chew starts before the turn ends, so the result never shows first.
        if (answer.trim() !== '' && !isSent) {
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
      display: await read($, display),
      root: $.plugin.root,
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
