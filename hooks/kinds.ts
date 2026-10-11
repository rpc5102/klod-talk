// What a tool call does, decided once per call from its name and arguments:
// read, search, edit, web, test, build, deploy, install or other. Bash
// commands are read word by word, so `cd app && npm test` is a test and
// `rg foo | head` a search, since native builds have no Grep or Glob tool.
// Everything downstream switches on the kind, never on the command string.

import type { ToolKind } from '../types'

/** A tool call's arguments, read loosely: builds add and rename tools. */
export type Args = Readonly<Record<string, unknown>>

export type Call = {
  kind: ToolKind
  /** What ran, for the lines: `pytest`, `npm test`, `git push`, `Grep`. */
  program: string
  /** What it works on, in plain words: a path under the project, a host, the program. */
  summary: string
  /** The file an edit or read touches, relative to the project; null for others. */
  file: string | null
}

const READS = new Set(['Read'])
const SEARCHES = new Set(['Grep', 'Glob'])
const EDITS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const WEB = new Set(['WebSearch', 'WebFetch'])

/** A string argument, or '' when the build sent none. */
export function text(args: Args, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value : ''
}

/** A path as the person thinks of it: under the project, relative to it. */
export function relativePath(path: string, cwd: string): string {
  const root = cwd.replace(/\/+$/, '')
  if (root !== '' && path.startsWith(`${root}/`)) {
    return path.slice(root.length + 1)
  }
  return path
}

export function baseName(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path
}

export function classify(tool: string, args: Args, cwd = ''): Call {
  if (tool === 'Bash') {
    const { kind, program } = commandKind(text(args, 'command'))
    return { kind, program, summary: program, file: null }
  }
  if (READS.has(tool) || EDITS.has(tool)) {
    const path = text(args, 'file_path') || text(args, 'notebook_path')
    const file = path === '' ? null : relativePath(path, cwd)
    return { kind: READS.has(tool) ? 'read' : 'edit', program: tool, summary: file ?? tool, file }
  }
  if (SEARCHES.has(tool)) {
    return { kind: 'search', program: tool, summary: tool, file: null }
  }
  if (WEB.has(tool)) {
    const summary = tool === 'WebFetch' ? hostOf(text(args, 'url')) : text(args, 'query')
    return { kind: 'web', program: tool, summary: summary || tool, file: null }
  }

  return { kind: 'other', program: tool, summary: tool, file: null }
}

export function hostOf(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url.trim())
  return match?.[1] ?? url.trim()
}

/** Louder kinds win when one command line runs several things. */
const RANK: readonly ToolKind[] = ['deploy', 'test', 'build', 'install', 'search', 'other']

/** A Bash command's kind, and the words that decided it. */
export function commandKind(command: string): { kind: ToolKind; program: string } {
  let best: { kind: ToolKind; program: string } | null = null
  for (const words of segments(command)) {
    const found = segmentKind(unwrapped(words))
    if (found === null) {
      continue
    }
    if (best === null || RANK.indexOf(found.kind) < RANK.indexOf(best.kind)) {
      best = found
    }
  }

  return best ?? { kind: 'other', program: '' }
}

/**
 * The command line's simple commands, each as its words: split on unquoted
 * `&&`, `||`, `;`, `|`, `&` and newlines, quotes taken off.
 */
export function segments(command: string): string[][] {
  const all: string[][] = []
  let words: string[] = []
  let word = ''
  let hasWord = false
  let quote: string | null = null
  const endWord = () => {
    if (hasWord) {
      words.push(word)
    }
    word = ''
    hasWord = false
  }
  const endSegment = () => {
    endWord()
    if (words.length > 0) {
      all.push(words)
    }
    words = []
  }

  for (let at = 0; at < command.length; at += 1) {
    const char = command.charAt(at)
    if (quote !== null) {
      if (char === quote) {
        quote = null
      } else if (char === '\\' && quote === '"' && at + 1 < command.length) {
        at += 1
        word += command.charAt(at)
      } else {
        word += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      hasWord = true
    } else if (char === '\\' && at + 1 < command.length) {
      at += 1
      word += command.charAt(at)
      hasWord = true
    } else if (char === '&' && (command.charAt(at - 1) === '>' || command.charAt(at + 1) === '>')) {
      // A redirect such as 2>&1 or &>, not a separator.
      word += char
      hasWord = true
    } else if (char === '&' || char === '|' || char === ';' || char === '\n') {
      endSegment()
    } else if (char === '(' || char === ')' || char === '{' || char === '}') {
      endWord()
    } else if (/\s/.test(char)) {
      endWord()
    } else {
      word += char
      hasWord = true
    }
  }
  endSegment()

  return all
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/
const PREFIXES = new Set(['sudo', 'time', 'env', 'nice', 'nohup', 'command', 'exec'])

/** The words with env assignments and wrappers taken off: `uv run pytest` is `pytest`. */
export function unwrapped(words: readonly string[]): string[] {
  let rest = [...words]
  for (;;) {
    const first = rest[0]
    const second = rest[1]
    if (first === undefined) {
      return rest
    }
    const program = baseName(first)
    if (ASSIGNMENT.test(first) || PREFIXES.has(program)) {
      rest = rest.slice(1)
    } else if (program === 'npx' || program === 'bunx') {
      rest = rest.slice(1)
      while (rest[0]?.startsWith('-') === true) {
        rest = rest.slice(1)
      }
    } else if (
      (program === 'uv' || program === 'poetry' || program === 'pipenv') && second === 'run'
    ) {
      rest = rest.slice(2)
    } else if (program === 'pnpm' && (second === 'dlx' || second === 'exec')) {
      rest = rest.slice(2)
    } else if (/^python[0-9.]*$/.test(program) && second === '-m') {
      rest = rest.slice(2)
    } else {
      return rest
    }
  }
}

const PACKAGE_MANAGERS = new Set(['npm', 'yarn', 'pnpm', 'bun'])

/** One simple command's kind, or null for none worth naming (an empty one). */
export function segmentKind(words: readonly string[]): { kind: ToolKind; program: string } | null {
  const first = words[0]
  if (first === undefined) {
    return null
  }
  const program = baseName(first)
  const second = words[1] ?? ''
  const third = words[2] ?? ''
  const two = `${program} ${second}`
  const named = (kind: ToolKind, label: string) => ({ kind, program: label })

  // Deploys: a push, an apply, a merged PR.
  if (
    two === 'kubectl apply' ||
    two === 'helm upgrade' ||
    two === 'terraform apply' ||
    two === 'git push'
  ) {
    return named('deploy', two)
  }
  if (two === 'gh pr' && third === 'merge') {
    return named('deploy', 'gh pr merge')
  }

  // Tests.
  if (['pytest', 'py.test', 'jest', 'vitest'].includes(program)) {
    return named('test', program)
  }
  if (two === 'go test' || two === 'cargo test') {
    return named('test', two)
  }
  if (PACKAGE_MANAGERS.has(program)) {
    if (second === 'test' || (program === 'npm' && second === 't')) {
      return named('test', `${program} test`)
    }
    if (second === 'run' && /^test(:|$)/.test(third)) {
      return named('test', `${program} run ${third}`)
    }
    if (second === 'run' && /^build(:|$)/.test(third)) {
      return named('build', `${program} run ${third}`)
    }
    if ((program === 'yarn' || program === 'pnpm' || program === 'bun') && second === 'build') {
      return named('build', two)
    }
    if (['install', 'i', 'ci', 'add'].includes(second) || (program === 'yarn' && second === '')) {
      return named('install', second === '' ? program : two)
    }
  }

  // Builds.
  if (program === 'make' || program === 'tsc') {
    return named('build', program)
  }
  if (two === 'cargo build' || two === 'docker build' || two === 'go build') {
    return named('build', two)
  }

  // Installs.
  if (/^pip[0-9.]*$/.test(program) && second === 'install') {
    return named('install', two)
  }
  if (two === 'uv sync' || two === 'uv add' || (two === 'uv pip' && third === 'install')) {
    return named('install', third === 'install' ? 'uv pip install' : two)
  }
  if (two === 'cargo fetch' || two === 'bundle install' || two === 'poetry install') {
    return named('install', two)
  }

  // Searches.
  if (['rg', 'grep', 'egrep', 'fgrep', 'find'].includes(program)) {
    return named('search', program)
  }

  if (program === 'cd') {
    return null
  }
  return named('other', program)
}
