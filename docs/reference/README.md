# Reference material

| File | What it is | Used for |
| --- | --- | --- |
| `words.json` | The starting word list, 27 terms in four groups, from the Words board | Generating `hooks/words.ts`; the translator's prompt and the captions |
| `samples.json` | Nine sample answers from the main chat, each with its cave version, plus a status line for each pose | Examples for the translation prompt and golden text for tests |
| `paintings.py` | The Python script that painted the Draw it mockups: ochre and charcoal on a stone wall, with wobbly strokes from a seeded random | The TypeScript painter is a port of it |
| `paintings/*.svg` | The script's four paintings | What the port should look like |

## The painter

Run `python3 paintings.py` (Python 3.12, standard library only). It writes the
four SVGs into `paintings/`. The same seed always gives the same picture, so
the output matches the committed files byte for byte.

The script draws four fixed compositions. The mod's painter draws any scene
plan instead: it places motifs on a 3 by 3 grid, as the build notes' Draw it
section describes. Here is where each motif in the build notes' list comes
from:

- The script's `Canvas` class has methods for the mammoth, person, rock,
  question mark, tally, hand print, zigzag and burst.
- The compositions draw a box, a lake, a cave, a tablet, the sun and the moon
  inline. The port turns those into motifs too.
- Fire and bug are new. Draw them in the same style.
