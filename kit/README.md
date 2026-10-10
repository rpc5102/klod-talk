# Klod sprite kit

Klod is the Cave Talk mod's caveman: original 32x32 pixel art, twenty poses,
four idle fidgets and four reactions to very Claude moments, two to five
frames each. Grumpy but lovable.

## Poses

The trigger column is the state map from the Round 6 mockups ("Cast list").
It is a design proposal, not a decision.

| Pose       | Frames                                   | Shows when                                  | Timing (ms) |
|------------|------------------------------------------|---------------------------------------------|-------------|
| idle       | standing / blink                         | session open, nothing happening             | 2280, 120   |
| impatient  | rest / finger drum + foot tap            | you are typing                              | 480, 480    |
| thinking   | head scratch, `?` bobs                   | Claude is thinking, or any other tool under 5 s | 480, 480 |
| read       | scroll unrolls, longer, piles on feet    | Read: Claude opens a file                   | 600, 600, 1200 |
| hunt       | spear up, hand over eyes; bush rustles   | Grep, Glob: searching the code              | 720, 480    |
| carve      | hammer up / strike / up / strike / admire | Edit, Write: changing files                | 480, 120, 480, 120, 1200 |
| shout      | yell through cupped hands / ear cupped   | WebSearch, WebFetch                         | 840, 1080   |
| pilates    | bent-knee Teaser hold / wobble           | any other tool past 5 s                     | 600, 600    |
| flint      | ready / strike / sparks / smoke          | a build, test, or deploy starts             | 360, 120, 240, 480 |
| dance      | hurry-up dance, little torch up, left knee / right knee | any command past 30 s        | 480, 480    |
| sign       | holds up "OK?" / sign bobs               | a permission prompt is waiting              | 480, 480    |
| paint      | ochre hand up / slap print on screen / admire | you press "Draw it"                    | 720, 360, 1320 |
| shrug      | shoulders up / down                      | Claude is unsure or asks you something      | 720, 480    |
| panic      | flail left / flail right                 | error, failing test, crash                  | 240, 240    |
| bonk       | club up / BONK / bug flat, grin          | Claude edits right after a failure          | 720, 240, 960 |
| happy      | ^^ grin; head up 0-1, down 2-3           | turn ends, everything passing               | 240 x 4     |
| campfire   | flames flicker                           | big win: deploy succeeds, PR merges         | 240, 240    |
| snack      | bite / chew                              | Cave Talk is translating Claude's words (ends when they arrive) | 480, 480 |
| explaining | talking / pause, finger taps             | the cave answer streams in                  | 240, 240    |
| sleep      | small bubble / big bubble, Zs rise       | nothing for 20 minutes                      | 960, 960    |
| petrock    | hand over his pet rock / pat, heart      | idle fidget (see Quiet time)                | 720, 1200   |
| polish     | rubs his club / club shines              | idle fidget                                 | 480, 480    |
| roast      | sits beside a small fire, drumstick out on a long stick / turned, sizzle | idle fidget | 480, 480 |
| juggle     | knees bent, hands take turns; three pebbles go over his head | idle fidget             | 240 x 4     |
| forget     | cross-eyed, stars circle his head        | the conversation gets compacted             | 480, 480    |
| facepalm   | palm over eyes / dragged down the face   | Claude's answer opens with an apology       | 960, 960    |
| suspicious | squint, strokes beard / eyes slide       | the turn's first test run passes and nothing failed before it (at most once an hour) | 720, 480 |
| buried     | under a heap of boxes / one more lands   | a package install runs past 10 s            | 480, 480    |

### Timing and priority (Round 11)

- Every pose holds for at least 2 seconds, then jumps to whatever is
  happening now. Poses that were missed are skipped, never replayed, so a
  burst of quick tool calls doesn't strobe or lag behind.
- Three exceptions: snack ends the moment the translated words arrive,
  anything real cuts an idle fidget off, and panic cuts in at once, even
  mid-hold.
- After a turn, the last pose holds for 60 quiet seconds, then idle. A
  question for you keeps shrug up until you answer. After 20 minutes, sleep.
- When two triggers fire at once the louder one wins:
  1. panic
  2. sign
  3. snack, explaining, paint (Cave Talk's own beats; facepalm opens explaining)
  4. forget, suspicious, bonk, then the tool poses (buried for installs)
  5. thinking
  6. shrug, campfire, happy (the turn's result)
  7. impatient, idle (and its fidgets), sleep
- When a turn ends: snack while the translation cooks, explaining while the
  cave words stream in (at least 2 seconds), then the result: campfire for a
  big win, happy if everything passes, shrug if Claude asks you something or
  something still fails. Suspicious is never the result.
- Jokes off overrides forget, facepalm, suspicious, buried and the fidgets:
  idle, standing still.

### Quiet time (Round 12)

- Fidgets play only in idle: from 60 quiet seconds after a turn, or after
  the session opens, until sleep at 20 minutes. Not while a question for you
  is waiting: shrug holds instead.
- One every 2 to 4 minutes, picked at random, never the same one twice in a
  row, so about six before sleep. Each plays two loops (2 to 4 seconds), then
  back to idle.
- A keystroke, a click in the pane, a tool call or a new turn cuts a fidget
  off at once, without waiting out the 2-second hold.
- A fidget changes only the pose and the status line, never the cave words.
- Fidgets never touch the live region: screen readers hear only the one
  announcement per answer.
- With grunts on: one small sound per fidget instead of the pose-change
  grunt (a pat, a squeak of hide, a sizzle, a clack of pebbles), always at
  quiet volume. Going back to idle is silent.
- With reduced motion on, no fidgets. With jokes off, no fidgets.
- Each fidget's status lines take turns:
  - petrock: "Me pet rock. Rock good boy." / "Rock not fetch. Still good
    boy." / "Rock stay. Rock always stay."
  - polish: "Me polish club. For later." / "Shiny club. Bug see self. Bug
    scared." / "Club clean. Later not come yet."
  - roast: "Me roast lunch. Lunch never ready." / "Lunch almost ready. Lunch
    lie." / "Smell ready. Not ready."
  - juggle: "Me juggle three rock. Me count to three." / "One rock. Two rock.
    Three rock. Me do math." / "Rock go up. Rock come down. Science."

### Claude moments (Round 13)

- forget: the conversation gets compacted. A one-off beat: plays once for
  2 s, then back to whatever is happening.
- facepalm: Claude's answer opens with an apology. Takes the first 2 s of
  explaining; if the answer isn't translated, it plays once for 2 s on its
  own. The status line adds "Again." from the second apology in a session.
- suspicious: the turn's first test run passes and nothing failed earlier in
  the turn, at most once an hour. A one-off beat like forget; the test's
  caption stays under it, and the turn still ends on happy or campfire.
- buried: a package install (npm, pip, cargo...) runs past 10 s. A tool
  pose; beats pilates and dance.
- All four change the pose and the status line silently.

### Same faces, other jobs

- Follow-up chips get a snack first, then a reaction: Fewer words → impatient,
  Tell more → thinking, Why? → shrug, Draw it → paint.
- Poke him: shrug, then impatient, then bonk on the third poke. After 3.5 s he
  goes back to whatever the session is doing.
- Cave Talk can't reach its translation model: shrug.
- Jokes off (an answer about a real incident): idle, standing still. No
  fidgets, no Claude moments.

Happy's flame flips every frame while the head bounce changes every second
frame, so the bounce runs at half the flicker speed (about once a second).

Bonk and carve loop on purpose: the flattened bug is back at the start of the
next loop, and the carved slab is wiped clean. Bugs always come back.

Every pose cycle divides 9.6 s, so all twenty-eight animate together without
a seam (see `caveman_preview.gif`).

## Files

- `caveman.json` - source of truth. Palette, one 32-string grid per frame
  (`.` is transparent), and frame timings. Edit pixels here; every other file
  is rendered from it.
- `png/caveman_sheet.png` - 160x896 sheet. One row per pose in the order listed
  under `sheet.order` in the JSON, frames left to right; rows with fewer than
  five frames leave the remaining cells empty. `@4x` copy for docs.
- `png/frames/`, `png/frames@4x/` - individual frames, transparent background.
- `png/caveman_hero@8x.png` - idle frame sized for a README or plugin listing.
- `terminal/truecolor/*.ans` - 32 columns x 16 rows, half-block characters,
  24-bit color.
- `terminal/256color/*.ans` - same art mapped to the xterm 256-color palette,
  for terminals without 24-bit color.
- `caveman_preview.gif` - all twenty-eight animating together.

## Preview in a terminal

    cat terminal/truecolor/idle_0.ans

If the colors come out wrong, use the `256color` folder instead.

## Notes for whoever builds the mod

- No dependencies. The JSON parses with the standard library.
- Scale by whole numbers with nearest-neighbor only. In CSS that is
  `image-rendering: pixelated`. Non-integer sizes (124 px, 112 px) make the
  pixels uneven; use 64, 96, 128 or 256.
- Props stick out of the frame on purpose (the `?`, the club, the spear, the
  Zs). If you put him in a rounded frame, let him overflow it rather than
  clipping him.
- The dark outline is baked into every frame. On a very dark terminal
  background it blends in, which is expected; the silhouette still reads.
- Each half-block row ends with a full SGR reset, so frames can be redrawn in
  place (cursor up 16 lines) for animation without color bleed.
