# Klod Talk

**Cave Talk** is a Claude Code mod. A side pane retells Claude's answers in
caveman speak. Beside it stands Klod, a pixel caveman whose pose follows what
Claude is doing: he hunts while Claude searches, carves while it edits, and
panics when a test fails. It is a joke, not a tool, and it never changes what
Claude does.

<img src="kit/png/caveman_hero@8x.png" width="128" alt="Klod, a grumpy pixel caveman with a big beard">

**Status:** Phase 1 is built: the pane, Klod's nine core poses (Idle,
Impatient, Thinking, Snack, Explaining, Happy, Shrug, Panic, Sleep) and the cave
translation. Every tool shows Thinking until Phase 2.

## Try it

Mods show in the terminal and in the Code tab of the Claude Desktop app, with
Claude Code 2.1.287 or later. From any project on your computer:

```bash
claude --plugin-dir /path/to/klod-talk
```

Then type `/cave`. To try a branch Claude is still working on, check that branch
out in your clone first.

The pane opens by itself in a fullscreen terminal 144 columns or wider. The cave
level, the translation model and "Open at start" are in `/config`.

## What's here

| Path | What it holds |
| --- | --- |
| [docs/build-notes.md](docs/build-notes.md) | The spec: architecture, the pose director, the translator, and four phases |
| [docs/mockups/](docs/mockups/) | Pictures of the design boards, listed by phase |
| [docs/prototypes/](docs/prototypes/) | Scene data from the clickable prototypes: timings, cave text, chip and poke lines |
| [docs/reference/](docs/reference/) | The starting word list, sample translations, and the script that paints Draw it pictures |
| [kit/](kit/) | Klod's sprite kit: 28 poses, the source of every frame |
| [CLAUDE.md](CLAUDE.md) | How Claude Code sessions build this repo |
| `.claude-plugin/`, `hooks/`, `types/` | The mod: its manifest, its hooks module and parts, and its `$.state` contract |
| [scripts/](scripts/) | Generate `hooks/catalog.ts`, `hooks/words.ts` and `tests/fixtures.ts` from the data above |
| [tests/](tests/) | Unit tests and engine scenarios for `claude plugin test` |

## Checking a change

```bash
node scripts/gen-catalog.mjs --check   # and gen-words, gen-fixtures: generated files are current
claude plugin validate .
tsc -p .                               # needs the types Claude Code lays in .claude-plugin/types/
claude plugin test .
```

Claude Code writes `.claude-plugin/types/` each time an interactive session
loads the mod with `--plugin-dir`, so run the mod once before the type check.
The folder is not committed.

## Building it with Claude Code

Each phase is one Claude Code session, started from the Code tab in the Claude
app, on the web, or with `claude --cloud`. Pick this repo and send:

> Read CLAUDE.md, then build Phase 1 from docs/build-notes.md. When validate,
> the type check and the tests all pass, push the branch and tell me how to try
> it on my computer.

For later phases, change the phase number. Choose Plan mode first if you want
to approve the plan before any code is written.

## License

MIT. See [LICENSE](LICENSE).
