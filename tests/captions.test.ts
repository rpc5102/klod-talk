// Tool captions against the golden set: the build notes' caption table,
// with tool inputs and results from the A4 tool session's chat. Captions are
// pure functions of the call, so they can never call the model.

import { describe, expect, test } from 'claude-code/testing'

import type { Segment } from '../types'
import type { Ran } from '../hooks/captions'
import { captionOf, caveWord, cut, landed, numberWords, started } from '../hooks/captions'
import type { Args } from '../hooks/kinds'
import { classify } from '../hooks/kinds'
import { plainText } from '../hooks/reply'
import { A4 } from './fixtures'

const CWD = '/work'
const ok = (result: unknown = undefined, text = ''): Ran => ({ isError: false, wasDenied: false, result, text })
const failed = (text: string): Ran => ({ isError: true, wasDenied: false, result: text, text })

/** The start line, the landed line, and the whole caption as the pane shows it. */
function lines(tool: string, args: Args, ran: Ran) {
  const call = classify(tool, args, CWD)
  const start = started(tool, args, call)
  const land = landed(tool, args, call, ran)
  return { start, land, caption: captionOf(start, land) }
}

const words = (segments: readonly Segment[] | null) => (segments === null ? null : plainText(segments))
const body = (id: string) => A4.scenes.find(scene => scene.id === id)!.body

const TEN_RESULTS = {
  query: 'pytest freeze time timezone',
  results: [{ tool_use_id: 'srv_1', content: Array.from({ length: 10 }, (_, i) => ({ title: `t${i}`, url: `https://e.x/${i}` })) }],
  durationSeconds: 1.2,
}

describe('the golden set', () => {
  test('Read invoice.py', () => {
    const read = lines('Read', { file_path: '/work/src/billing/invoice.py' }, ok({ type: 'text', file: { filePath: '/work/src/billing/invoice.py', content: '', numLines: 142, startLine: 1, totalLines: 142 } }))
    expect(words(read.start)).toBe('Me read scroll invoice.py.')
    expect(words(read.land)).toBe('One hundred forty-two line.')
    expect(read.caption).toEqual(body('read')[0])
  })

  test('Grep date.today', () => {
    const grep = lines('Grep', { pattern: 'date.today', path: 'src/billing' }, ok({ mode: 'content', numFiles: 2, numMatches: 3, filenames: ['a', 'b'] }))
    expect(words(grep.start)).toBe('Me hunt word date.today.')
    expect(words(grep.land)).toBe('Find it three time, in two scroll.')
    expect(grep.caption).toEqual(body('hunt')[0])
  })

  test('WebSearch', () => {
    const search = lines('WebSearch', { query: 'pytest freeze time timezone', mode: 'standard' }, ok(TEN_RESULTS))
    expect(words(search.start)).toBe('Me yell into Big Cave of Internet: PYTEST FREEZE TIME TIMEZONE?')
    expect(words(search.land)).toBe('Big Cave yell back ten thing.')
    // The prototype shows the shout alone, the echo as its own joke line.
    expect(search.start).toEqual(body('shout')[0])
  })

  test('Edit', () => {
    const edit = lines(
      'Edit',
      { file_path: '/work/src/billing/invoice.py', old_string: 'a', new_string: 'b' },
      ok({ filePath: '/work/src/billing/invoice.py', gitDiff: { filename: 'src/billing/invoice.py', status: 'modified', additions: 3, deletions: 1, changes: 4, patch: '' } }),
    )
    expect(words(edit.start)).toBe('Me carve invoice.py.')
    expect(words(edit.land)).toBe('Three mark in. One mark out.')
    expect(edit.caption).toEqual(body('carve')[0])
  })

  test('Bash pytest', () => {
    const pytest = lines('Bash', { command: 'pytest tests/billing -q' }, ok({ stdout: '214 passed in 6.2s', stderr: '' }, '214 passed in 6.2s'))
    expect(pytest.start).toEqual(body('test')[0])
    expect(pytest.land).toEqual(body('test')[1])
    expect(words(pytest.start)).toBe('Rock hit rock. Me start fire: pytest.')
    expect(words(pytest.land)).toBe('Two hundred fourteen spark. Every spark catch.')
  })

  test('Bash npm install', () => {
    const install = lines('Bash', { command: 'npm install' }, ok({ stdout: 'added 1 package', stderr: '' }, 'added 1 package'))
    expect(words(install.start)).toBe('Claude ask for one box.')
    expect(words(install.land)).toBe('One box bring friend box. Friend box bring friend.')
  })
})

describe('from the text alone, when the record is missing', () => {
  test('the A4 chat’s results', () => {
    const [grep, read, search] = A4.chat
    expect(words(lines('Grep', { pattern: 'date.today' }, ok(undefined, grep!.result)).land)).toBe('Find it three time, in two scroll.')
    expect(words(lines('Read', { file_path: '/work/a.py' }, ok(undefined, read!.result)).land)).toBe('One hundred forty-two line.')
    expect(words(lines('WebSearch', { query: 'q' }, ok(undefined, search!.result)).land)).toBe('Big Cave yell back ten thing.')
  })

  test('no counts before a result exists, and none made up after', () => {
    expect(lines('Read', { file_path: '/work/a.py' }, ok()).land).toBeNull()
    expect(lines('Edit', { file_path: '/work/a.py' }, ok()).land).toBeNull()
    for (const tool of ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'WebSearch', 'WebFetch', 'Bash']) {
      const start = words(started(tool, { file_path: '/work/a.py', pattern: 'x', query: 'q', url: 'https://e.x', command: 'pytest' }, classify(tool, {}, CWD)))
      expect(start, tool).not.toMatch(/\d|one hundred|two |three |ten /i)
    }
  })
})

describe('other calls', () => {
  test('an edit counts the patch when there is no diff, and a new file its lines', () => {
    const patch = { structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 6, lines: [' a', '+b', '+c', '+d', '+e', '+f', '+g'] }] }
    expect(words(lines('Edit', { file_path: '/work/t.py' }, ok(patch)).land)).toBe('Six mark in.')
    const created = lines('Write', { file_path: '/work/new.py', content: 'a\nb\nc\n' }, ok({ type: 'create', structuredPatch: [] }))
    expect(words(created.caption)).toBe('Me carve new.py. Three mark in.')
  })

  test('a failing test run counts what caught and what died', () => {
    const run = lines('Bash', { command: 'pytest' }, failed('211 passed, 3 failed in 6.0s'))
    expect(words(run.land)).toBe('Two hundred eleven spark catch. Three spark die.')
    expect(words(lines('Bash', { command: 'go test ./...' }, failed('FAIL')).land)).toBe('Fire go out.')
    expect(words(lines('Bash', { command: 'make' }, ok(undefined, 'done')).land)).toBe('Fire catch.')
  })

  test('a search with Bash hunts the pattern and counts what it found', () => {
    const rg = lines('Bash', { command: 'rg -n "retry_count" src' }, ok(undefined, 'a.py:1:x\nb.py:2:y\n'))
    expect(words(rg.caption)).toBe('Me hunt word retry_count. Find two thing.')
    expect(rg.start).toEqual([{ text: 'Me hunt word ', isTerm: false }, { text: 'retry_count', isTerm: true }, { text: '.', isTerm: false }])
    expect(words(lines('Bash', { command: 'grep nope a.txt' }, failed('Exit code 1')).land)).toBe('Find nothing.')
    expect(words(lines('Bash', { command: 'find . -name "*.py"' }, ok(undefined, './a.py')).start)).toBe('Me hunt scroll.')
  })

  test('a Glob pattern stays whole, stars and all', () => {
    const glob = lines('Glob', { pattern: 'src/**/*.ts' }, ok({ numFiles: 4, filenames: [], durationMs: 1, truncated: false }))
    expect(glob.caption).toEqual([
      { text: 'Me hunt scroll ', isTerm: false },
      { text: 'src/**/*.ts', isTerm: true },
      { text: '. Find four scroll.', isTerm: false },
    ])
  })

  test('installs count their boxes', () => {
    expect(words(lines('Bash', { command: 'pip install freezegun' }, ok()).start)).toBe('Claude ask for one box.')
    expect(words(lines('Bash', { command: 'npm install react react-dom zod' }, ok()).start)).toBe('Claude ask for three box.')
    expect(words(lines('Bash', { command: 'npm install' }, failed('ERR!')).land)).toBe('Box not come.')
  })

  test('other commands use the word list where it has the program', () => {
    expect(words(lines('Bash', { command: 'kubectl describe pod x' }, ok()).caption)).toBe('Claude poke cave with poking stick. Cave poke back.')
    expect(words(lines('Bash', { command: 'ls -la' }, failed('nope')).caption)).toBe('Claude poke cave: ls. Cave bite.')
    expect(caveWord('Kubectl')).toBe('poking stick')
    expect(caveWord('ls')).toBeNull()
  })

  test('web fetches, helpers and strange tools', () => {
    const fetch = lines('WebFetch', { url: 'https://docs.python.org/3/', prompt: 'x' }, ok())
    expect(words(fetch.caption)).toBe('Me ask Big Cave of Internet for scroll: docs.python.org. Big Cave give scroll.')
    expect(words(lines('Agent', { prompt: 'x' }, ok()).caption)).toBe('Claude send little helper into cave. Helper come back.')
    expect(words(lines('mcp__github__create_issue', {}, ok()).caption)).toBe('Claude use strange tool: create issue. Strange tool work.')
    expect(words(lines('AskUserQuestion', {}, ok()).caption)).toBe('Claude ask you thing.')
  })

  test('a denied call puts the rock down, whatever the tool', () => {
    const denied: Ran = { isError: false, wasDenied: true, result: undefined, text: 'denied' }
    expect(words(lines('Bash', { command: 'rm -rf build' }, denied).land)).toBe('You say no. Me put rock down.')
  })

  test('long arguments are cut to one line', () => {
    const long = 'x'.repeat(200)
    const start = words(lines('Grep', { pattern: long }, ok()).start)!
    expect(start.length).toBeLessThan(60)
    expect(start).toContain('…')
    expect(cut('a\n  b', 10)).toBe('a b')
  })
})

describe('numberWords()', () => {
  test('the cave way, no "and"', () => {
    const table: [number, string][] = [
      [0, 'zero'],
      [1, 'one'],
      [10, 'ten'],
      [14, 'fourteen'],
      [40, 'forty'],
      [42, 'forty-two'],
      [100, 'one hundred'],
      [142, 'one hundred forty-two'],
      [214, 'two hundred fourteen'],
      [4000, 'four thousand'],
      [2_000_105, 'two million one hundred five'],
    ]
    for (const [n, spelled] of table) {
      expect(numberWords(n)).toBe(spelled)
    }
    expect(numberWords(1.5)).toBe('1.5')
  })
})
