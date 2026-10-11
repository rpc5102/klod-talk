// Engine scenarios: whole turns raised event by event, with the pose and
// cave atoms read as the mocked clock moves. Text and scene order come from
// the A3 live-session prototype; timings come from the build notes.

import { expect, test } from 'claude-code/testing'

import { A2, A3, SAMPLES } from './fixtures'
import { PEEK, answerAfter, answered, apiError, notAnswered, replyFor, world } from './world'

const crashloop = SAMPLES.find(sample => sample.id === 'crashloop')!
const cavemanTake = A3.levels.find(level => level.name === 'Caveman')!.takes[0]!
const scene = (id: string) => A3.scenes.find(one => one.id === id)!

test('a full turn runs Thinking, Snack, Explaining for at least 2 s, then Happy, Idle and Sleep', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  w.answer = async () => {
    await w.clock.sleep(1000)
    return answered(replyFor(3, cavemanTake))
  }

  await w.start()
  expect((await w.peek()).pose.name).toBe('idle')

  // You type.
  await w.type('w')
  let atoms = await w.peek()
  expect(atoms.pose.name).toBe(scene('typing').sprite)
  expect(atoms.pose.status).toBe(scene('typing').status)
  expect(atoms.pose.meta).toBe(scene('typing').meta)

  // You press Enter; Impatient holds its 2 s, then Thinking.
  await w.submit(A3.prompt)
  await w.turnStart('turn-1')
  expect((await w.peek()).pose.name).toBe('impatient')
  await w.advance(2000)
  atoms = await w.peek()
  expect(atoms.pose.name).toBe('thinking')
  expect(atoms.pose.status).toBe(A2.scenes.find(one => one.id === 'thinking')!.status)
  expect(atoms.pose.meta).toBe(scene('thinking').meta)

  // A command with no pose of its own shows Thinking under 5 s.
  await w.bash('kubectl describe pod payments-api-7d9f6 -n prod', 'toolu_1')
  expect((await w.peek()).pose.name).toBe('thinking')
  await w.advance(2000)

  // Claude's answer lands: Snack while the translation chews.
  await w.turnComplete(crashloop.chat, 'turn-1')
  atoms = await w.peek()
  expect(atoms.pose.name).toBe(A3.chew.sprite)
  expect(atoms.pose.status).toBe(A3.chew.status)
  expect(atoms.pose.meta).toBe(A3.chew.meta)
  expect(atoms.cave.phase).toBe('chewing')
  expect(w.modelCalls).toHaveLength(1)

  // The words arrive after a second: Snack ends at once, mid-hold.
  await w.advance(1000)
  atoms = await w.peek()
  expect(atoms.pose.name).toBe('explaining')
  expect(atoms.pose.status).toBe(A3.levels.find(level => level.name === 'Caveman')!.status)
  expect(atoms.cave.phase).toBe('streaming')
  expect(atoms.cave.mammoths).toBe(3)
  expect(atoms.cave.paragraphs).toEqual(cavemanTake)
  expect(atoms.cave.shown).toBe(1)

  // One paragraph every 0.6 s.
  for (let shown = 2; shown <= cavemanTake.length; shown += 1) {
    await w.advance(600)
    expect((await w.peek()).cave.shown).toBe(shown)
  }
  atoms = await w.peek()
  expect(atoms.cave.phase).toBe('done')
  expect(atoms.cave.announce).toContain('Me make big words small.')
  expect(atoms.cave.announce).toContain('Little box wake up.')

  // Explaining stays 2 s after the last paragraph, then the result.
  await w.advance(1999)
  expect((await w.peek()).pose.name).toBe('explaining')
  await w.advance(1)
  expect((await w.peek()).pose.name).toBe('happy')

  // The result holds 60 quiet seconds, then Idle.
  const endedAt = (await w.peek()).session.result!.endedAt
  await w.clock.set(endedAt + 59_999)
  expect((await w.peek()).pose.name).toBe('happy')
  await w.advance(1)
  expect((await w.peek()).pose.name).toBe('idle')

  // Twenty quiet minutes after the last event: Sleep.
  const quietSince = (await w.peek()).session.quietSince
  await w.clock.set(quietSince + 20 * 60_000 - 1)
  expect((await w.peek()).pose.name).toBe('idle')
  await w.advance(1)
  atoms = await w.peek()
  expect(atoms.pose.name).toBe(scene('idle').sprite)
  expect(atoms.pose.status).toBe(scene('idle').status)
  expect(atoms.pose.meta).toBe(scene('idle').meta)

  // Later, the next keystroke wakes him up Impatient at once.
  await w.advance(5 * 60_000)
  expect((await w.peek()).pose.name).toBe('sleep')
  await w.type('x')
  expect((await w.peek()).pose.name).toBe('impatient')
  expect(w.logs).toEqual([])
})

test('three quick tools inside 1 s: only what is happening when the hold ends shows', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  await w.start()
  await w.type('w')
  await w.submit('go')
  await w.turnStart('turn-1')
  const seen: string[] = [(await w.peek()).pose.name]
  for (const id of ['toolu_1', 'toolu_2', 'toolu_3']) {
    await w.bash('ls', id)
    await w.advance(300)
    seen.push((await w.peek()).pose.name)
  }
  await w.advance(1100)
  seen.push((await w.peek()).pose.name)
  expect(seen).toEqual(['impatient', 'impatient', 'impatient', 'impatient', 'thinking'])
  expect((await w.peek()).session.running).toEqual([])
  expect((await w.peek()).session.lastTool).toMatchObject({ tool: 'Bash', isError: false, wasDenied: false })
})

test('Panic cuts in mid-hold on an API error, then Shrug', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  await w.start()
  await w.type('w')
  expect((await w.peek()).pose.name).toBe('impatient')
  await w.submit('go')
  await w.turnStart('turn-1')
  await w.turnComplete('', 'turn-1', 'error')
  let atoms = await w.peek()
  expect(atoms.pose.name).toBe('panic')
  expect(atoms.pose.status).toBe(scene('error').status)
  expect(w.modelCalls).toHaveLength(0)
  await w.advance(1999)
  expect((await w.peek()).pose.name).toBe('panic')
  await w.advance(1)
  atoms = await w.peek()
  expect(atoms.pose.name).toBe('shrug')
  expect(atoms.pose.meta).toBe('The turn ended on an API error')
})

for (const [name, answer, why] of [
  ['an API error', () => apiError(), 'API error 500, server error'],
  ['an empty reply', () => notAnswered('empty-reply'), 'the model sent back no words'],
  ['a blocked model', () => 'refuse' as const, /^the call was refused \(.*model not allowed.*\)$/],
  ['a reply with no words in it', () => answered('SIZE 2\n\n'), 'the reply had no words in it'],
] as const) {
  test(`${name} gives Shrug and "Me brain hurt.", and Claude's answer is untouched`, { plugins: [PEEK] }, async ($, on) => {
    const w = world($, on)
    w.answer = answer
    await w.start()
    await w.turnStart('turn-1')
    await w.advance(2000)
    const text = await w.turnComplete(crashloop.chat, 'turn-1')
    expect(text).toBe(crashloop.chat)
    let atoms = await w.peek()
    expect(atoms.pose).toMatchObject({ name: 'shrug', status: 'Me brain hurt.', beat: 'failed' })
    expect(atoms.cave.phase).toBe('failed')
    // The plain-words line says why, and so does the debug log.
    expect(atoms.cave.problem).toMatch(why)
    expect(atoms.pose.meta).toBe(`Translation failed: ${atoms.cave.problem}`)
    expect(w.logs).toHaveLength(1)
    expect(w.logs[0]).toMatch(/^cave-talk: translation failed after \d+ ms on model "haiku": /)
    // The beat plays 2 s, then the turn's own result.
    await w.advance(2000)
    atoms = await w.peek()
    expect(atoms.pose.name).toBe('happy')
    expect(atoms.session.ownBeats).toEqual([])
  })
}

test('the 8 s timeout is a failure; an early abort (Esc) is skipped quietly', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  w.answer = async () => {
    await w.clock.sleep(8000)
    return notAnswered('aborted')
  }
  await w.start()
  await w.turnComplete(crashloop.chat, 'turn-1')
  await w.advance(8000)
  expect((await w.peek()).pose).toMatchObject({
    status: 'Me brain hurt.',
    meta: 'Translation failed: no reply within 8 s',
  })
  expect(w.modelCalls[0]).toMatchObject({ timeoutMs: 8000, maxTokens: 500, effort: 'low' })

  w.answer = async () => {
    await w.clock.sleep(300)
    return notAnswered('aborted')
  }
  await w.advance(60_000)
  await w.turnComplete('Another answer.', 'turn-2')
  await w.advance(300)
  const atoms = await w.peek()
  expect(atoms.cave.phase).toBe('empty')
  expect(atoms.cave.problem).toBeNull()
  expect(atoms.session.ownBeats).toEqual([])
  expect(atoms.pose.name).toBe('happy')
})

test('two answers in a row: the newer replaces the older, "1 older answer skipped"', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  w.answer = answerAfter(w.clock, 1000, 'SIZE 1\nSecond take.')
  await w.start()
  await w.turnComplete('First answer.', 'turn-1')
  await w.advance(400)
  await w.turnComplete('Second answer.', 'turn-2')
  let atoms = await w.peek()
  expect(atoms.cave.skipped).toBe(1)
  expect(atoms.pose.name).toBe('snack')
  await w.advance(1000)
  atoms = await w.peek()
  expect(w.modelCalls).toHaveLength(2)
  expect(w.modelCalls[1]!.prompt).toBe('Level: caveman. Text: Second answer.')
  expect(atoms.cave.source).toMatchObject({ id: 'turn-2' })
  expect(atoms.cave.paragraphs).toEqual([[{ text: 'Second take.', isTerm: false }]])
})

test('Literal rock answers "Rock." with no model call', { plugins: [PEEK], options: { level: 'Literal rock' } }, async ($, on) => {
  const w = world($, on)
  await w.start()
  await w.turnComplete(crashloop.chat, 'turn-1')
  let atoms = await w.peek()
  expect(w.modelCalls).toHaveLength(0)
  expect(atoms.cave.paragraphs).toEqual([[{ text: 'Rock.', isTerm: false }]])
  expect(atoms.pose).toMatchObject({ name: 'explaining', status: 'Rock.' })
  await w.advance(2000)
  atoms = await w.peek()
  expect(atoms.pose.name).toBe('happy')
})

test('JOKES OFF: Idle, standing still, one sober line, and no more model calls', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  w.answer = () => answered('JOKES OFF')
  await w.start()
  await w.turnComplete('The migration dropped the users table in production.', 'turn-1')
  let atoms = await w.peek()
  expect(atoms.session.jokesOff).toBe(true)
  expect(atoms.cave.paragraphs).toEqual([[{ text: 'No jokes for this one.', isTerm: false }]])
  expect(atoms.pose).toMatchObject({
    name: 'idle',
    isStill: true,
    status: 'No jokes for this one.',
    meta: 'Claude’s answer in the chat has the steps.',
  })
  await w.advance(5000)
  await w.type('w')
  await w.turnStart('turn-2')
  await w.turnComplete('Restored from the backup.', 'turn-2')
  atoms = await w.peek()
  expect(w.modelCalls).toHaveLength(1)
  expect(atoms.pose.name).toBe('idle')
  expect(atoms.cave.source).toMatchObject({ id: 'turn-2' })
})

test('a question for you keeps Shrug up until you answer', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  await w.start()
  await w.turnComplete('I found two fixes. Which one do you want?', 'turn-1')
  await w.advance(2000)
  await w.advance(2000)
  let atoms = await w.peek()
  expect(atoms.pose).toMatchObject({ name: 'shrug', meta: 'Claude asked you something' })
  await w.advance(10 * 60_000)
  expect((await w.peek()).pose.name).toBe('shrug')
  await w.submit('the first one')
  atoms = await w.peek()
  expect(atoms.session.result).toBeNull()
  expect(atoms.pose.name).toBe('idle')
})

test('an interrupted turn goes straight to Idle; a refusal shows Shrug', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  await w.start()
  await w.turnStart('turn-1')
  await w.advance(2000)
  await w.turnComplete('Partial words', 'turn-1', 'aborted')
  await w.advance(2000)
  let atoms = await w.peek()
  expect(w.modelCalls).toHaveLength(0)
  expect(atoms.pose.name).toBe('idle')
  await w.turnStart('turn-2')
  await w.advance(2000)
  await w.turnComplete('', 'turn-2', 'refusal')
  await w.advance(2000)
  atoms = await w.peek()
  expect(atoms.pose).toMatchObject({ name: 'shrug', meta: 'Claude declined this one' })
})

test('a subagent\'s tools and turns pass straight through', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  await w.start()
  const before = await w.peek()
  // The kit's typed args leave agentId out; it reaches the hooks all the same.
  const inSubagent = { agentId: 'agent-1' }
  await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'toolu_9', ...inSubagent })
  await $.turn.complete({ answer: 'Subagent report.', durationMs: 10, isAborted: false, turnId: 'sub-1', reason: 'answer', agentId: 'agent-1' })
  await w.settle()
  const after = await w.peek()
  expect(w.modelCalls).toHaveLength(0)
  expect(after.session).toEqual(before.session)
  expect(after.cave).toEqual(before.cave)
})

test('every event reaches the engine as raised, and its result comes back as given', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  const raised = {
    'session.start': { cwd: '/work', surface: 'terminal', isInteractive: true },
    'prompt.submit': { text: 'why does my pod keep restarting', wait: false, origin: { kind: 'composer' } },
    'turn.start': { text: 'why does my pod keep restarting', turnId: 'turn-1' },
    'tool.call': { tool: 'Bash', command: 'kubectl get pods', tool_use_id: 'toolu_1' },
    'turn.complete': { answer: crashloop.chat, durationMs: 9000, isAborted: false, turnId: 'turn-1', reason: 'answer' },
    'session.end': { reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } },
  } as const
  expect(await $.session.start(raised['session.start'])).toEqual({ cwd: '/work' })
  await w.type('w')
  expect(await $.prompt.submit(raised['prompt.submit'])).toEqual({ text: raised['prompt.submit'].text })
  expect(await $.turn.start(raised['turn.start'])).toEqual({ turnId: 'turn-1' })
  expect(await $.tool.call(raised['tool.call'])).toMatchObject({ text: 'ok' })
  expect(await $.turn.complete(raised['turn.complete'])).toEqual({ text: crashloop.chat })
  expect(await $.session.end(raised['session.end'])).toEqual({ sessionId: 'session-1' })
  await w.advance(10_000)
  for (const [event, e] of Object.entries(raised)) {
    expect(w.received[event], event).toEqual([e])
  }
  expect(w.received['prompt.edit']).toEqual([
    { origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: 'w' },
  ])
})

test('a hot reload keeps the pose and the words, and makes a dropped call again', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  w.answer = answerAfter(w.clock, 1000, replyFor(3, cavemanTake))
  await w.start()
  await w.turnComplete(crashloop.chat, 'turn-1')
  expect((await w.peek()).cave.phase).toBe('chewing')
  // A reload raises session.start again, with the atoms where they were.
  await w.start()
  let atoms = await w.peek()
  expect(atoms.pose.name).toBe('snack')
  expect(atoms.cave.source).toMatchObject({ id: 'turn-1', level: 'caveman' })
  expect(w.received['command.register']).toHaveLength(2)
  await w.advance(1000)
  atoms = await w.peek()
  expect(atoms.cave.paragraphs).toEqual(cavemanTake)
  // The words stay through another reload; the facts are not started over.
  const before = await w.peek()
  await w.start()
  atoms = await w.peek()
  expect(atoms.cave).toEqual(before.cave)
  expect(atoms.session.quietSince).toBe(before.session.quietSince)
})

test('a /clear starts the facts and words over and drops the call in flight', { plugins: [PEEK] }, async ($, on) => {
  const w = world($, on)
  w.answer = answerAfter(w.clock, 1000, 'SIZE 1\nToo late.')
  await w.start()
  await w.turnComplete(crashloop.chat, 'turn-1')
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await w.settle()
  let atoms = await w.peek()
  expect(atoms.cave.phase).toBe('empty')
  expect(atoms.cave.source).toBeNull()
  expect(atoms.session.result).toBeNull()
  await w.advance(5000)
  atoms = await w.peek()
  expect(atoms.cave.phase).toBe('empty')
  expect(atoms.pose.name).toBe('idle')
})
