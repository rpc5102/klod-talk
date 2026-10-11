// The tool-kind classifier: a tool's name and arguments to one kind, decided
// once per call. Bash commands are read word by word, wrappers and all.

import { describe, expect, test } from 'claude-code/testing'

import { classify, commandKind, relativePath, segments } from '../hooks/kinds'

const bash = (command: string) => commandKind(command)

describe('commandKind()', () => {
  test('each row of the notes’ table', () => {
    const table: [string, string][] = [
      ['rg date.today src', 'search'],
      ['grep -rn "date.today" src/billing', 'search'],
      ['find . -name "*.py"', 'search'],
      ['pytest tests/billing -q', 'test'],
      ['npm test', 'test'],
      ['go test ./...', 'test'],
      ['cargo test', 'test'],
      ['npx jest --watch=false', 'test'],
      ['vitest run', 'test'],
      ['make', 'build'],
      ['npm run build', 'build'],
      ['cargo build --release', 'build'],
      ['tsc -p .', 'build'],
      ['docker build -t app .', 'build'],
      ['kubectl apply -f deploy.yaml', 'deploy'],
      ['helm upgrade api ./chart', 'deploy'],
      ['terraform apply -auto-approve', 'deploy'],
      ['git push origin main', 'deploy'],
      ['gh pr merge 42 --squash', 'deploy'],
      ['npm install', 'install'],
      ['pip install freezegun', 'install'],
      ['uv sync', 'install'],
      ['cargo fetch', 'install'],
      ['bundle install', 'install'],
      ['ls -la', 'other'],
      ['kubectl describe pod payments-api-7d9f6 -n prod', 'other'],
      ['git status', 'other'],
    ]
    for (const [command, kind] of table) {
      expect(bash(command).kind, command).toBe(kind)
    }
  })

  test('the words that decided it name the program', () => {
    expect(bash('pytest tests/billing -q').program).toBe('pytest')
    expect(bash('npm run test:unit').program).toBe('npm run test:unit')
    expect(bash('git push && gh run watch').program).toBe('git push')
    expect(bash('ls -la').program).toBe('ls')
  })

  test('wrappers and env assignments come off', () => {
    expect(bash('CI=1 pytest -q')).toEqual({ kind: 'test', program: 'pytest' })
    expect(bash('uv run pytest')).toEqual({ kind: 'test', program: 'pytest' })
    expect(bash('python -m pytest -x')).toEqual({ kind: 'test', program: 'pytest' })
    expect(bash('poetry run pytest')).toEqual({ kind: 'test', program: 'pytest' })
    expect(bash('npx -y vitest run')).toEqual({ kind: 'test', program: 'vitest' })
    expect(bash('sudo make install')).toEqual({ kind: 'build', program: 'make' })
    expect(bash('./node_modules/.bin/jest')).toEqual({ kind: 'test', program: 'jest' })
  })

  test('the louder kind wins on a line that runs several things', () => {
    expect(bash('cd app && npm test').kind).toBe('test')
    expect(bash('npm install && npm test').kind).toBe('test')
    expect(bash('npm run build && git push').kind).toBe('deploy')
    expect(bash('rg TODO | head -20').kind).toBe('search')
    expect(bash('pytest -q 2>&1 | tail -5').kind).toBe('test')
  })

  test('separators inside quotes are words, not separators', () => {
    expect(segments('grep "a|b;c" file')).toEqual([['grep', 'a|b;c', 'file']])
    expect(segments('echo one && echo two')).toEqual([['echo', 'one'], ['echo', 'two']])
    expect(bash("echo 'npm test'").kind).toBe('other')
  })

  test('an empty command is other, with no program', () => {
    expect(bash('')).toEqual({ kind: 'other', program: '' })
    expect(bash('cd /tmp')).toEqual({ kind: 'other', program: '' })
  })
})

describe('classify()', () => {
  test('built-in tools by name', () => {
    expect(classify('Read', { file_path: '/work/src/a.py' }, '/work')).toEqual({
      kind: 'read',
      program: 'Read',
      summary: 'src/a.py',
      file: 'src/a.py',
    })
    expect(classify('Grep', { pattern: 'x' }).kind).toBe('search')
    expect(classify('Glob', { pattern: '*.ts' }).kind).toBe('search')
    for (const tool of ['Edit', 'Write', 'NotebookEdit', 'MultiEdit']) {
      expect(classify(tool, { file_path: '/work/a.py' }, '/work').kind).toBe('edit')
    }
    expect(classify('NotebookEdit', { notebook_path: '/work/nb.ipynb' }, '/work').file).toBe('nb.ipynb')
    expect(classify('WebSearch', { query: 'pytest freeze time' })).toMatchObject({ kind: 'web', summary: 'pytest freeze time' })
    expect(classify('WebFetch', { url: 'https://docs.python.org/3/library/zoneinfo.html' })).toMatchObject({
      kind: 'web',
      summary: 'docs.python.org',
    })
  })

  test('Bash by its command; any other tool is other', () => {
    expect(classify('Bash', { command: 'pytest -q' })).toEqual({
      kind: 'test',
      program: 'pytest',
      summary: 'pytest',
      file: null,
    })
    expect(classify('mcp__github__create_issue', { title: 'x' }).kind).toBe('other')
    expect(classify('Agent', { prompt: 'x' }).kind).toBe('other')
  })

  test('arguments a build left out read as empty', () => {
    expect(classify('Bash', {})).toMatchObject({ kind: 'other', program: '' })
    expect(classify('Read', {})).toMatchObject({ kind: 'read', file: null, summary: 'Read' })
  })

  test('paths outside the project stay whole', () => {
    expect(relativePath('/work/src/a.py', '/work/')).toBe('src/a.py')
    expect(relativePath('/etc/hosts', '/work')).toBe('/etc/hosts')
    expect(relativePath('/workshop/a.py', '/work')).toBe('/workshop/a.py')
  })
})
