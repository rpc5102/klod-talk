# Prototype scene data

Each file holds the data block from one clickable prototype on the design
canvas, with the image URLs removed. Wherever a field names a pose (`sprite`),
the pose comes from `kit/caveman.json`. A path such as
`docs/reference/paintings/greedy_box.svg` points to a painting in this repo.

| File | Prototype | What it plays |
| --- | --- | --- |
| `a2-stone-tablet.json` | A2, Stone Tablet | The pane's states one at a time, plus one answer at each cave level |
| `a3-live-session.json` | A3, live session | One turn from typing to the answer: "why does my pod keep restarting" |
| `a4-tool-session.json` | A4, tool session | A turn with Grep, Read, WebSearch, a permission prompt, Edit, a test run and CI |
| `a5-poke.json` | A5, poke | The four chips, Draw it with its painting, and three pokes |
| `a6-quiet-time.json` | A6, quiet time | Twenty quiet minutes after a turn: idle, fidgets, then sleep |

## Fields that matter

- **`scenes`**: the beats, in order.
  - `sprite` is the pose.
  - `status` and `meta` are the two lines beside Klod: his line, then what
    really happened in plain words.
  - `body` is the cave text: a list of paragraphs, each a list of
    `[text, isTerm]` pairs. `isTerm` 1 marks a word-list term, drawn bold in the
    accent colour.
  - `mammoths` is the problem-size meter, from 0 to 5. `glossary` holds the
    `[term, cave word]` pairs on screen.
- **`ms`**: how long the prototype shows a scene. It is demo pacing, not a real
  timing, except for fidgets, whose `ms` is two loops of the kit's frame
  durations. Real timings are in the build notes.
- **`levels`**: the same answer at each cave level. `takes` are the different
  versions Again cycles through.
- **`chew`**: the Snack beat while the translation is being made.
- **`chat`** (A4): the main-chat transcript the scenes follow, with each tool
  call and its result. It works as a fixture for the caption templates.
- **`followups`**, **`order`**, **`pokes`** (A5): the reactions for the Fewer
  words, Tell more, Why? and Draw it chips, and the three poke lines.
- **`clock`** (A6): simulated seconds since the turn ended. `fidget` marks a
  fidget scene. `same` marks a fidget that repeats an earlier one, later in the
  twenty minutes; it never follows itself directly.

Any other field drives the prototype's own playback, such as `after`, `wait` or
`paraTicks`, and can be ignored.
