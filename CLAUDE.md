# Cave Talk: instructions for build sessions

This repo is **Cave Talk**, a Claude Code mod: a side pane that retells Claude's
answers in caveman speak, beside Klod, a pixel caveman whose pose follows the
session. It is a joke, not a tool. Bob designed it with Claude in a separate
conversation you can't see. Everything you need from that conversation is in
this repo.

## Where things are

- `docs/build-notes.md` is the spec. Read the whole of it once, then the section
  for your phase again before you write code. It is pseudo-code that has already
  been reviewed. Your job is TypeScript that does what it says.
- `docs/mockups/` has pictures of the design boards. Its README lists them by
  phase and names the places where the notes changed a board.
- `docs/prototypes/` has the clickable prototypes' scene data: the cave text at
  each level, status lines, chip and poke reactions, and scene order. Use it for
  copy and test fixtures.
- `docs/reference/` has the starting word list (`words.json`), sample answers
  with their cave versions and status lines (`samples.json`), and
  `paintings.py`, the Python script that painted the mockups. Draw it ports
  that script to TypeScript; the four SVGs in `paintings/` are its output.
- `kit/` is Klod's sprite kit. `kit/caveman.json` is the source of truth for
  every pose, frame and timing. `kit/README.md` explains the poses and the
  timing rules.

## Rules

1. **Never change what Claude does.** Every hook on Claude's events passes `e`
   on unchanged with `next(e)`. No command answers with text the model reads.
2. **The notes win over the mockups.** Where they differ, the notes account for
   what the mod API allows. For example, Poke is a button, not a click on Klod,
   and paintings show only their caption in the terminal.
3. **Ask before changing a decision the notes make.** That covers timings,
   priorities, Klod's lines, settings and the look. If the API makes something
   impossible, stop, explain why, and propose the smallest change.
4. **One phase per session, in order.** Don't start the next phase's work.
5. **Build for the terminal and the Desktop app only.** Those are the only places
   a mod draws today. Nothing more for VS Code or mobile.

## How to build

- **Load the `plugin-authoring` skill before writing mod code.** It writes the API
  types for the Claude Code build you're running and has complete examples. Grep
  those types for every event, method and element you use; don't work from
  memory. If the skill isn't available, say so and use the mods reference at
  https://code.claude.com/docs/en/plugins/mods/reference.
- **Write the mod here, at the repo root, not in the skill's dev-mods folder.**
  Follow the layout in the notes' Architecture section:
  `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`, the
  parts in `hooks/`, `types/index.d.ts`, and tests in `tests/`. The plugin's
  name is `cave-talk`, because the notes' state and config keys use it.
- **Generate code from data with small scripts in `scripts/`, and commit their
  output.**
  - `hooks/catalog.ts` comes from `kit/caveman.json`.
  - `hooks/words.ts` comes from `docs/reference/words.json`.
  - A hooks module imports only script files. The notes put `caveman.json` in
    `assets/`; here it stays in `kit/`.
- **Code style.** Strict TypeScript. Keep the parts as small as the notes split
  them. Write plain comments, with no emojis or check marks in code or comments.
- **Tests.**
  - The director's `desired()` and `breaksHold()`, the tool-kind classifier, the
    captions, the reply parser, and the scene validator with `paint()` are pure
    functions. Give them plain unit tests.
  - Engine scenarios run under `claude plugin test` with `mock.clock`. Take
    their text and scene order from `docs/prototypes/`; the prototypes' `ms`
    values are demo pacing, so take the real timings from the notes.
- **Checking drawings.** You can't see the pane in a cloud session. Mount the
  pane for `terminal` and `desktop` with the test kit's `$.ui.mount` and check
  the tree. Leave the by-hand checks to Bob.

## Before you push

1. `claude plugin validate .` reports nothing the engine would refuse.
2. The type check passes: `tsc` with the tsconfig the skill describes.
3. `claude plugin test` passes.
4. Push to a branch named for the phase, such as `phase-1`, and tell Bob:
   - what you built;
   - which of the phase's "Done when" checks the tests cover, and which he must
     try by hand;
   - which open questions from the notes you answered, and which still need a
     real session;
   - how to try it: `claude --plugin-dir <his clone>` from any project, then
     `/klod`. Mods need Claude Code 2.1.287 or later.

## Still open with Bob

Ask him before you build any of these:

- **Poke (Phase 3).** Should it be a button beside Klod, or should Klod be drawn
  as coloured text cells so a click on him works? Text cells only work in the
  terminal and the Desktop app.
- **Paintings in the terminal (Phase 3).** Caption only, or a second painter that
  draws the same scene plan in half-block characters?
- **Sounds.** There are no grunt files yet. Ask before adding any.
