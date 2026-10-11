// Engine scenarios for Phase 2: tool poses, captions, Sign, the pinned line,
// the meter and mid-turn text, raised event by event as the mocked clock
// moves. Text and scene order come from the A4 tool-session prototype; the
// timings come from the build notes.

import { expect, test } from 'claude-code/testing'
import type { ToolCallResult } from 'claude-code'

import { plainText } from '../hooks/reply'
import { A4 } from './fixtures'
import type { World } from './world'
import { PEEK, answerAfter, replyFor, toolError, toolResult, world } from './world'

const scene = (id: string) => A4.scenes.find(one => one.id === id)!
const take = A4.levels.find(level => level.name === 'Caveman')!.takes[0]!
const doneTake = [
  [{ text: 'Both cave agree what day it is. ', isTerm: false }, { text: 'Peace in valley', isTerm: true }, { text: '.', isTerm: false }],
]
const ANSWER = A4.answer.join('\n\n')
const DONE = 'Done. CI is green: invoice dates now use America/New_York and the tests freeze time at 11:30 pm.'

const ok = (text = 'ok') => toolResult({ stdout: text, stderr: '', interrupted: false }, text)

/**
 * Starts a tool that answers after `ms`, and resolves once Cave Talk has seen
 * it start; `done` is the call itself, which resolves as the clock moves.
 */
async function begin(
  w: World,
  tool: string,
  args: Record<string, unknown>,
  id: string,
  ms: number,
  answer: ToolCallResult = ok(),
): Promise<{ done: Promise<ToolCallResult> }> {
  w.toolAnswer = async () => {
    await w.clock.sleep(ms)
    return answer
  }
  const done = w.tool(tool, args, id)
  await w.settle()
  return { done }
}

async function caption(w: World): Promise<string | null> {
  const words = (await w.peek()).cave
  return words.caption === null ? null : plainText(words.caption.segments)
}

test('the A4 tool session: each tool shows its pose and caption, and the turn ends on Campfire', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  const replies = [replyFor(2, take), replyFor(0, doneTake)]
  w.answer = (input, index, signal) => answerAfter(w.clock, 1000, replies[index] ?? '')(input, index, signal)
  await w.start()
  await w.submit(A4.prompt)
  await w.turnStart('turn-1')
  expect((await w.peek()).pose.name).toBe('thinking')
  await w.advance(2000)

  // Grep: Hunt, its line as it starts, the count when it lands.
  let call = await begin(w, 'Grep', { pattern: 'date.today', path: 'src/billing' }, 'toolu_1', 500,
    toolResult({ mode: 'content', numFiles: 2, numMatches: 3, filenames: [] }, 'Found 3 matches in 2 files'))
  let atoms = await w.peek()
  expect(atoms.pose).toMatchObject({ name: 'hunt', status: scene('hunt').status, meta: scene('hunt').meta })
  expect(await caption(w)).toBe('Me hunt word date.today.')
  await w.advance(500)
  await call.done
  expect((await w.peek()).cave.caption?.segments).toEqual(scene('hunt').body[0])
  // Hunt holds its 2 s, then Thinking.
  expect((await w.peek()).pose.name).toBe('hunt')
  await w.advance(1500)
  expect((await w.peek()).pose.name).toBe('thinking')
  // Thinking holds its 2 s too.
  await w.advance(2000)

  // Read and WebSearch.
  call = await begin(w, 'Read', { file_path: '/work/src/billing/invoice.py' }, 'toolu_2', 500,
    toolResult({ type: 'text', file: { numLines: 142 } }, ''))
  expect((await w.peek()).pose).toMatchObject({ name: 'read', status: scene('read').status, meta: scene('read').meta })
  await w.advance(500)
  await call.done
  expect((await w.peek()).cave.caption?.segments).toEqual(scene('read').body[0])
  await w.advance(3500)
  call = await begin(w, 'WebSearch', { query: 'pytest freeze time timezone', mode: 'standard' }, 'toolu_3', 500,
    toolResult({ results: [{ tool_use_id: 's', content: Array.from({ length: 10 }, () => ({ title: 't', url: 'u' })) }] }, ''))
  expect((await w.peek()).pose).toMatchObject({ name: 'shout', status: scene('shout').status, meta: scene('shout').meta })
  await w.advance(500)
  await call.done
  expect(await caption(w)).toBe('Me yell into Big Cave of Internet: PYTEST FREEZE TIME TIMEZONE? Big Cave yell back ten thing.')
  await w.advance(3500)

  // Claude explains before it asks: over 40 words, so Snack, then Explaining.
  await w.say(ANSWER, 'row-1')
  atoms = await w.peek()
  expect(atoms.pose).toMatchObject({ name: 'snack', status: A4.chew.status, meta: A4.chew.meta })
  expect(atoms.cave.caption).toBeNull()
  expect(w.modelCalls).toHaveLength(1)
  await w.advance(1000)
  atoms = await w.peek()
  expect(atoms.pose.name).toBe('explaining')
  expect(atoms.cave.mammoths).toBe(2)
  expect(atoms.cave.pinned).toEqual(take[0])
  await w.advance(600 * (take.length - 1) + 2000)
  expect((await w.peek()).pose.name).toBe('thinking')
  await w.advance(2000)

  // The permission ask: Sign until the approved call's progress row is drawn.
  w.toolAnswer = async () => {
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'pip install freezegun' } })
    await w.clock.sleep(8000)
    return ok('Successfully installed freezegun-1.5.1')
  }
  call = { done: w.tool('Bash', { command: 'pip install freezegun' }, 'toolu_4') }
  await w.settle()
  atoms = await w.peek()
  expect(atoms.pose).toMatchObject({ name: 'sign', status: scene('ask').status, meta: scene('ask').meta })
  expect(plainText(atoms.cave.caption!.segments)).toBe('Claude ask for one box.')
  // The pinned line stays under the caption.
  expect(atoms.cave.pinned).toEqual(take[0])
  await w.advance(2000)
  expect((await w.peek()).pose.name).toBe('sign')
  await w.progress('toolu_4')
  atoms = await w.peek()
  expect(atoms.session.permissionWait).toBeNull()
  expect(atoms.pose.name).toBe('thinking')
  // Its age counts from when the dialog closed: Pilates 5 s later.
  await w.advance(4999)
  expect((await w.peek()).pose.name).toBe('thinking')
  await w.advance(1)
  expect((await w.peek()).pose.name).toBe('pilates')
  await w.advance(1000)
  await call.done
  expect(await caption(w)).toBe('Claude ask for one box. One box bring friend box. Friend box bring friend.')
  await w.advance(3000)

  // Two edits: Carve, counting the files.
  call = await begin(w, 'Edit', { file_path: '/work/src/billing/invoice.py', old_string: 'a', new_string: 'b' }, 'toolu_5', 300,
    toolResult({ gitDiff: { additions: 3, deletions: 1 } }, ''))
  expect((await w.peek()).pose).toMatchObject({ name: 'carve', status: scene('carve').status, meta: 'Claude edited 1 file' })
  await w.advance(300)
  await call.done
  expect((await w.peek()).cave.caption?.segments).toEqual(scene('carve').body[0])
  call = await begin(w, 'Edit', { file_path: '/work/tests/billing/test_invoice.py', old_string: 'a', new_string: 'b' }, 'toolu_6', 300,
    toolResult({ gitDiff: { additions: 6, deletions: 0 } }, ''))
  expect((await w.peek()).pose).toMatchObject({ name: 'carve', meta: scene('carve').meta })
  await w.advance(300)
  await call.done
  await w.advance(3400)

  // The test run: Flint, then its sparks.
  call = await begin(w, 'Bash', { command: 'pytest tests/billing -q' }, 'toolu_7', 6200, ok('214 passed in 6.2s'))
  expect((await w.peek()).pose).toMatchObject({ name: 'flint', status: scene('test').status, meta: scene('test').meta })
  expect(await caption(w)).toBe('Rock hit rock. Me start fire: pytest.')
  await w.advance(6200)
  await call.done
  expect(await caption(w)).toBe('Rock hit rock. Me start fire: pytest. Two hundred fourteen spark. Every spark catch.')
  await w.advance(2000)

  // Push and watch CI: Flint, then the hurry-up dance from 30 s.
  call = await begin(w, 'Bash', { command: 'git push && gh run watch' }, 'toolu_8', 41_000, ok('CI · billing · completed: success · 41s'))
  expect((await w.peek()).pose.name).toBe('flint')
  await w.advance(29_999)
  expect((await w.peek()).pose.name).toBe('flint')
  await w.advance(1)
  atoms = await w.peek()
  expect(atoms.pose).toMatchObject({ name: 'dance', status: scene('ci').status })
  // The meter held still through every tool.
  expect(atoms.cave.mammoths).toBe(2)
  await w.advance(11_000)
  await call.done
  expect((await w.peek()).session.turn?.isBigWin).toBe(true)
  await w.advance(2000)

  // The last words: under 40 words, translated when the turn completes.
  await w.turnComplete(DONE, 'turn-1')
  expect((await w.peek()).pose.name).toBe('snack')
  await w.advance(1000)
  atoms = await w.peek()
  expect(atoms.pose.name).toBe('explaining')
  expect(atoms.cave.mammoths).toBe(0)
  expect(atoms.cave.caption).toBeNull()
  await w.advance(2000)
  atoms = await w.peek()
  expect(atoms.pose).toMatchObject({ name: 'campfire', status: 'Fire good. Me warm.' })
  expect(atoms.session.result?.pose).toBe('campfire')

  // Two translations, and not one model call for the eight captions.
  expect(w.modelCalls).toHaveLength(2)
  expect(w.logs).toEqual([])
})

test('a shown dialog gives Sign until the call settles, allowed or denied; an auto-mode approval gives none', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  await w.start()
  await w.submit('go')
  await w.turnStart('turn-1')
  await w.advance(2000)

  // Denied at the dialog: Sign until the call settles, then the denial's caption.
  w.toolAnswer = async () => {
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build/' } })
    await w.clock.sleep(3000)
    return { deny: 'The user doesn’t want to proceed with this tool use.' }
  }
  let call = { done: w.tool('Bash', { command: 'rm -rf build/' }, 'toolu_1') }
  await w.settle()
  expect((await w.peek()).pose.name).toBe('sign')
  await w.advance(2999)
  expect((await w.peek()).pose.name).toBe('sign')
  await w.advance(1)
  const denied = await call.done
  expect(denied).toEqual({ deny: 'The user doesn’t want to proceed with this tool use.' })
  let atoms = await w.peek()
  expect(atoms.session.permissionWait).toBeNull()
  expect(atoms.pose.name).toBe('thinking')
  expect(plainText(atoms.cave.caption!.segments)).toBe('Claude poke cave: rm. You say no. Me put rock down.')
  expect(atoms.session.lastTool).toMatchObject({ wasDenied: true })
  await w.advance(2000)

  // Allowed, with no progress row (the desktop app draws none): Sign until it settles.
  // The call's own pose starts first and holds its 2 s: Sign is not one of
  // the notes' exceptions to the hold, so it shows when Carve's hold ends.
  w.toolAnswer = async () => {
    await $.classic.PermissionRequest({ tool_name: 'Edit', tool_input: {} })
    await w.clock.sleep(5000)
    return toolResult({ gitDiff: { additions: 1, deletions: 1 } }, '')
  }
  call = { done: w.tool('Edit', { file_path: '/work/a.py', old_string: 'a', new_string: 'b' }, 'toolu_2') }
  await w.settle()
  expect((await w.peek()).pose.name).toBe('carve')
  expect((await w.peek()).session.permissionWait).toMatchObject({ tool: 'Edit', isQuestion: false })
  await w.advance(2000)
  expect((await w.peek()).pose.name).toBe('sign')
  // A progress row for another call does not end it.
  await w.progress('toolu_other')
  expect((await w.peek()).pose.name).toBe('sign')
  await w.advance(3000)
  await call.done
  expect((await w.peek()).session.permissionWait).toBeNull()
  await w.advance(2000)

  // Approved by auto mode: no dialog, so no Sign at any moment.
  const seen: string[] = []
  call = await begin(w, 'Bash', { command: 'npm run build' }, 'toolu_3', 3000, ok())
  for (let at = 0; at < 3000; at += 500) {
    seen.push((await w.peek()).pose.name)
    await w.advance(500)
  }
  await call.done
  expect(seen).not.toContain('sign')
  expect(seen[0]).toBe('flint')
})

test('Claude asking you through a dialog is Shrug until you answer', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  await w.start()
  await w.submit('go')
  await w.turnStart('turn-1')
  await w.advance(2000)
  w.toolAnswer = async () => {
    await $.classic.PermissionRequest({ tool_name: 'AskUserQuestion', tool_input: {} })
    await w.clock.sleep(10_000)
    return toolResult({ answers: {} }, 'User answered')
  }
  const call = { done: w.tool('AskUserQuestion', { questions: [] }, 'toolu_1') }
  await w.settle()
  expect((await w.peek()).pose).toMatchObject({ name: 'shrug', meta: 'Claude asked you something' })
  await w.advance(9000)
  expect((await w.peek()).pose.name).toBe('shrug')
  await w.advance(1000)
  await call.done
  await w.advance(2000)
  expect((await w.peek()).pose.name).toBe('thinking')
})

test('a subagent’s dialog shows Sign too, and ends when its call settles', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  await w.start()
  await w.submit('go')
  await w.turnStart('turn-1')
  await w.advance(2000)
  w.toolAnswer = async () => {
    await $.classic.PermissionRequest({ tool_name: 'WebFetch', tool_input: {}, agent_id: 'agent-1' })
    await w.clock.sleep(3000)
    return ok()
  }
  const call = { done: w.tool('WebFetch', { url: 'https://e.x', prompt: 'x' }, 'toolu_9', 'agent-1') }
  await w.settle()
  let atoms = await w.peek()
  expect(atoms.pose.name).toBe('sign')
  // A subagent's call gets no pose and no caption of its own.
  expect(atoms.session.running).toEqual([])
  expect(atoms.cave.caption).toBeNull()
  await w.advance(3000)
  await call.done
  atoms = await w.peek()
  expect(atoms.session.permissionWait).toBeNull()
  expect(atoms.pose.name).toBe('thinking')
})

test('an edit right after a failed test shows Panic, then Bonk; the turn ends on Shrug', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  w.answer = (input, index, signal) => answerAfter(w.clock, 1000, 'SIZE 3\nThree rock break.')(input, index, signal)
  await w.start()
  await w.submit('go')
  await w.turnStart('turn-1')
  // Panic cuts into Thinking's hold at once.
  w.toolAnswer = () => toolError('211 passed, 3 failed in 6.0s')
  const failed = await w.tool('Bash', { command: 'pytest -q' }, 'toolu_1')
  expect(failed).toEqual(toolError('211 passed, 3 failed in 6.0s'))
  await w.settle()
  let atoms = await w.peek()
  expect(atoms.pose).toMatchObject({ name: 'panic', status: 'AAAAH. Rock broke.', meta: 'A test run failed' })
  expect(await caption(w)).toBe('Rock hit rock. Me start fire: pytest. Two hundred eleven spark catch. Three spark die.')

  // Claude starts fixing it: Panic first holds its 2 s, then Bonk.
  await w.advance(500)
  const call = await begin(w, 'Edit', { file_path: '/work/billing.py', old_string: 'a', new_string: 'b' }, 'toolu_2', 3000,
    toolResult({ gitDiff: { additions: 1, deletions: 1 } }, ''))
  expect((await w.peek()).pose.name).toBe('panic')
  await w.advance(1500)
  atoms = await w.peek()
  expect(atoms.pose).toMatchObject({ name: 'bonk', status: 'Me bonk bug.' })
  await w.advance(1500)
  await call.done

  await w.turnComplete('Three tests still fail on rounding.', 'turn-1')
  await w.advance(1000 + 2000)
  atoms = await w.peek()
  expect(atoms.pose).toMatchObject({ name: 'shrug', meta: 'The last test run failed' })
})

test('a 40-second test run dances from 30 s; a test that passes after a failure clears Bonk', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  await w.start()
  await w.submit('go')
  await w.turnStart('turn-1')
  w.toolAnswer = () => toolError('1 failed')
  await w.tool('Bash', { command: 'npm test' }, 'toolu_1')
  // Panic for 2 s, then Thinking for its 2 s.
  await w.advance(4000)
  const call = await begin(w, 'Bash', { command: 'npm test' }, 'toolu_2', 40_000, ok('Tests: 12 passed'))
  expect((await w.peek()).pose.name).toBe('flint')
  await w.advance(30_000)
  expect((await w.peek()).pose).toMatchObject({ name: 'dance', meta: 'Claude is running npm test · over 30 s' })
  await w.advance(10_000)
  await call.done
  expect((await w.peek()).session.turn?.lastRunFailed).toBe(false)
  await w.advance(2000)
  const edit = await begin(w, 'Write', { file_path: '/work/a.py', content: 'x\n' }, 'toolu_3', 100, toolResult({ type: 'update' }, ''))
  expect((await w.peek()).pose.name).toBe('carve')
  await w.advance(100)
  await edit.done
})

test('a burst of quick calls never replays: only what runs when the hold ends shows', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  await w.start()
  await w.submit('go')
  await w.turnStart('turn-1')
  await w.advance(2000)
  const seen: string[] = []
  const calls = [
    await begin(w, 'Read', { file_path: '/work/a.py' }, 'toolu_1', 100),
  ]
  seen.push((await w.peek()).pose.name)
  await w.advance(300)
  calls.push(await begin(w, 'Grep', { pattern: 'x' }, 'toolu_2', 100))
  seen.push((await w.peek()).pose.name)
  await w.advance(300)
  calls.push(await begin(w, 'Edit', { file_path: '/work/a.py' }, 'toolu_3', 2000))
  seen.push((await w.peek()).pose.name)
  for (let at = 0; at < 6; at += 1) {
    await w.advance(300)
    seen.push((await w.peek()).pose.name)
  }
  await w.advance(300)
  await Promise.all(calls.map(one => one.done))
  // Read held its 2 s; Grep came and went inside it; Edit was running when it ended.
  expect(seen).toEqual(['read', 'read', 'read', 'read', 'read', 'read', 'read', 'carve', 'carve'])
  expect(seen).not.toContain('hunt')
  // Each caption replaced the last; the newest is the edit's.
  expect(await caption(w)).toMatch(/^Me carve a\.py\./)
})

test('short mid-turn text is not translated, and an answer sent mid-turn is not sent twice', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  await w.start()
  await w.submit('go')
  await w.turnStart('turn-1')
  await w.say('Let me run the tests.', 'row-1')
  expect(w.modelCalls).toHaveLength(0)
  // A subagent's text passes straight through.
  await $.session.append({
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: ANSWER }] },
    door: 'response',
    origin: { kind: 'model', model: 'claude-opus-5-5' },
    uuid: 'row-2',
    agentId: 'agent-1',
  })
  await w.settle()
  expect(w.modelCalls).toHaveLength(0)

  await w.say(ANSWER, 'row-3')
  expect(w.modelCalls).toHaveLength(1)
  expect(String(w.modelCalls[0]!.prompt)).toContain('The failures are a timezone bug.')
  await w.advance(100)
  await w.turnComplete(ANSWER, 'turn-1')
  expect(w.modelCalls).toHaveLength(1)
  // The append reached the engine as raised.
  expect(w.received['session.append']?.length).toBe(3)
})

test('the pinned line shows during tool beats and goes when Claude speaks again', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  const replies = [replyFor(2, take), replyFor(4, doneTake)]
  w.answer = (input, index, signal) => answerAfter(w.clock, 1000, replies[index] ?? '')(input, index, signal)
  await w.start()
  await w.turnComplete(ANSWER, 'turn-1')
  await w.advance(1000 + 600 * take.length + 2000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await w.mountPane(surface)
    // The words, no pinned line yet, and the meter with its text twin.
    expect(await ui.find({ type: 'Text', text: /^Your cave and CI cave/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Last cave answer' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '2 of 5 mammoths' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Problem size' })).toMatchObject({ props: { dimColor: true, bold: true } })
    await ui.unmount()
  }

  await w.submit('next')
  await w.turnStart('turn-2')
  const call = await begin(w, 'Read', { file_path: '/work/src/billing/invoice.py' }, 'toolu_1', 1000,
    toolResult({ type: 'text', file: { numLines: 142 } }, ''))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await w.mountPane(surface)
    expect(await ui.find({ type: 'Text', text: /^Me read scroll/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Last cave answer' })).toMatchObject({ props: { dimColor: true, bold: true } })
    expect(await ui.find({ type: 'Text', text: 'Your cave and CI cave not agree what day it is.' })).toBeDefined()
    // The rest of the old answer is not shown under a caption.
    expect(await ui.find({ type: 'Text', text: /^Invoice say due in thirty sun/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '2 of 5 mammoths' })).toBeDefined()
    await ui.unmount()
  }
  await w.advance(1000)
  await call.done

  // Claude speaks again: the caption and its pinned line go; the meter changes as the words land.
  await w.turnComplete(DONE, 'turn-2')
  const ui = await w.mountPane('terminal')
  expect(await ui.find({ type: 'Text', text: 'Last cave answer' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Me chew big words…' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '2 of 5 mammoths' })).toBeDefined()
  await w.advance(1000)
  expect(await ui.find({ type: 'Text', text: '4 of 5 mammoths' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Both cave agree/ })).toBeDefined()
  await ui.unmount()
})

test('the Phase 2 hooks pass Claude’s events on unchanged, and their results back as given', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  await w.start()
  await w.submit('go')
  await w.turnStart('turn-1')

  const ask = { tool_name: 'Bash', tool_input: { command: 'make deploy' } }
  const decided = await $.classic.PermissionRequest(ask)
  expect(decided).toEqual({})
  expect(w.received['classic.PermissionRequest']?.[0]).toMatchObject(ask)

  const row = { tool_use_id: 'toolu_1', kind: 'background_hint' as const, hint: '(ctrl+b to run in background)' }
  const drawn = await $.ui.render({ surface: 'terminal', component: 'ToolProgress', requestId: 'toolu_1', props: row })
  expect(drawn).toMatchObject({ type: 'Text', props: { dimColor: true } })
  expect(w.received['ui.render.ToolProgress']?.[0]).toMatchObject({ props: row })

  const message = { type: 'assistant' as const, role: 'assistant' as const, content: [{ type: 'text', text: A4.answer.join('\n\n') }] }
  const stored = await $.session.append({ message, door: 'response', origin: { kind: 'model', model: 'claude-opus-5-5' }, uuid: 'row-1' })
  expect(stored.message?.content).toEqual(message.content)
  expect(w.received['session.append']?.[0]).toMatchObject({ message, uuid: 'row-1' })

  // A tool's result comes back whole, record and all.
  const record = { stdout: '214 passed', stderr: '', interrupted: false }
  w.toolAnswer = () => toolResult(record, '214 passed')
  expect(await w.tool('Bash', { command: 'pytest' }, 'toolu_2')).toEqual(toolResult(record, '214 passed'))
  expect(w.received['tool.call']?.at(-1)).toMatchObject({ tool: 'Bash', command: 'pytest', tool_use_id: 'toolu_2' })
  await w.settle()
})
