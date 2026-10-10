# Mockups

These are pictures of the design canvas boards, rendered on Oct 10, 2026. The
canvas itself needs a claude.ai sign-in. The prototypes are clickable on the
canvas, so here each one shows a single moment; its scene data is in
[../prototypes/](../prototypes/).

## By phase

| Picture | What it shows |
| --- | --- |
| **Phase 1: the pane, Klod, the translation** | |
| [R2-A2-Prototype](R2-A2-Prototype.png) | The chosen pane design, A2 Stone Tablet, mid-answer |
| [R11-Pane-Anatomy](R11-Pane-Anatomy.png) | Every part of the pane, numbered, with what each does |
| [R4-First-Run](R4-First-Run.png) | What `/cave` shows the first time |
| [R3-Terminal-Dock](R3-Terminal-Dock.png) | Fullscreen terminal, with the pane docked beside the transcript |
| [R3-Terminal-Inline](R3-Terminal-Inline.png) | Narrow terminal, with the pane inline |
| [R2-A2-Cave-Levels](R2-A2-Cave-Levels.png) | One answer at each of the four cave levels |
| [R4-Dark](R4-Dark.png) | Dark mode |
| [R6-Cast-List](R6-Cast-List.png) | Klod's 20 core poses, what wakes each one, and the priority and timing rules |
| [R5-Motion-Cue-Sheet](R5-Motion-Cue-Sheet.png) | A whole turn, beat by beat |
| [R5-A3-Live-Session](R5-A3-Live-Session.png) | Prototype A3, a live session |
| **Phase 2: tool poses and captions** | |
| [R6-Tool-Poses](R6-Tool-Poses.png) | He copies what Claude is doing |
| [R6-Live-Tools](R6-Live-Tools.png) | Prototype A4: tools, captions, and Sign for a permission prompt |
| **Phase 3: personality** | |
| [R12-Quiet-Time](R12-Quiet-Time.png) | The four idle fidgets and when they play |
| [R12-Quiet-Prototype](R12-Quiet-Prototype.png) | Prototype A6, quiet time |
| [R13-Claude-Moments](R13-Claude-Moments.png) | Forget, Facepalm, Suspicious and Buried |
| [R7-Poke](R7-Poke.png) | Prototype A5: the chips, Draw it, and poking him |
| [R7-Cave-Paintings](R7-Cave-Paintings.png) | Draw it paintings in the house style the painter has to keep |
| [R7-History-Wall](R7-History-Wall.png) | The Wall, with every painting you asked for |
| **Phase 4: edge cases and settings** | |
| [R8-Edge-Cases](R8-Edge-Cases.png) | Six awkward moments |
| [R8-Mini-Band](R8-Mini-Band.png) | The folded band above the prompt when the pane isn't placed |
| [R10-Settings](R10-Settings.png) | The settings view, full length |
| [R10-Dictionary](R10-Dictionary.png) | The Words tab: the cave dictionary and Teach a word |
| [R10-Cave-Explain](R10-Cave-Explain.png) | `/cave explain`, which asks on purpose and answers in the pane |
| **Every phase** | |
| [R9-Accessibility](R9-Accessibility.png) | Contrast, announcements, motion and keys |

## Where the notes changed a board

The build notes win wherever they differ from a board. These are the changes
the mod API forced:

- **Poke.** Clicking Klod isn't possible, so Poke is a button beside him
  (hotkey `p`). Whether to draw him as clickable text cells is still open.
- **Paintings in the terminal.** The terminal has no SVG, so Draw it shows only
  the caption there.
- **Motion.** The settings board offers "Follow system". No surface tells a mod
  about reduced motion, so the setting is Animate or Still.
- **Copy.** It works in the terminal only, for now.

## Boards left out

These boards are on the canvas but not here:

- the four Round 1 directions, explored before A2 was chosen;
- the Round 4 state gallery, which the cast list replaces;
- the share cards, which aren't part of the build;
- the VS Code and mobile boards. Claude Code doesn't draw a mod's panes on
  those surfaces today.
