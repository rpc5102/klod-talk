"""Cave paintings for the "Draw it" follow-up: one SVG per tech problem.

Ochre and charcoal on a stone wall, drawn with slightly wobbly strokes so they
read as hand-painted. Plain SVG only (no <style>, scripts, or animation) so
the canvas can serve them as uploaded images.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

W, H = 480, 300
OCHRE = "#a8401f"
OCHRE_LIGHT = "#c96a3a"
YELLOW = "#c98f2b"
CHAR = "#2b221c"
WALL = "#cdbf9f"
OUT = Path(__file__).resolve().parent / "paintings"


class Canvas:
    def __init__(self, seed: int) -> None:
        self.rng = random.Random(seed)
        self.parts: list[str] = []

    # -- helpers -------------------------------------------------------
    def jitter(self, pts: list[tuple[float, float]], amt: float = 1.2) -> list[tuple[float, float]]:
        return [(x + self.rng.uniform(-amt, amt), y + self.rng.uniform(-amt, amt)) for x, y in pts]

    def wobbly(self, pts: list[tuple[float, float]], steps: int = 4, amt: float = 1.1) -> str:
        """A polyline through pts, each segment split and nudged, as a smooth path."""
        dense: list[tuple[float, float]] = []
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            for i in range(steps):
                t = i / steps
                dense.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
        dense.append(pts[-1])
        dense = [dense[0]] + self.jitter(dense[1:-1], amt) + [dense[-1]]
        d = f"M{dense[0][0]:.1f} {dense[0][1]:.1f}"
        for (xa, ya), (xb, yb) in zip(dense[1:], dense[2:] + [dense[-1]]):
            d += f" Q{xa:.1f} {ya:.1f} {(xa + xb) / 2:.1f} {(ya + yb) / 2:.1f}"
        return d

    def line(self, pts, color=CHAR, width=3.2, steps=4, amt=1.0, dash: str | None = None) -> None:
        extra = f' stroke-dasharray="{dash}"' if dash else ""
        self.parts.append(
            f'<path d="{self.wobbly(pts, steps, amt)}" fill="none" stroke="{color}" stroke-width="{width}" '
            f'stroke-linecap="round" stroke-linejoin="round"{extra}/>'
        )

    def blob(self, d: str, color=OCHRE, opacity: float = 1.0) -> None:
        self.parts.append(f'<path d="{d}" fill="{color}" fill-opacity="{opacity}"/>')

    def circle(self, cx, cy, r, fill=CHAR, stroke: str | None = None, width=3.0) -> None:
        s = f' stroke="{stroke}" stroke-width="{width}"' if stroke else ""
        self.parts.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}"{s}/>')

    # -- motifs --------------------------------------------------------
    def mammoth(self, x: float, y: float, s: float = 1.0, flip: bool = False, color=OCHRE) -> None:
        """Cave-painting mammoth (domed head, sloping back, hanging trunk), about 100x70 at s=1."""
        pts = [
            (12, 50), (8, 38), (14, 24), (28, 16), (46, 8), (62, 4), (74, 6), (82, 12), (88, 22),
            (92, 34), (94, 48), (93, 62), (90, 67), (86, 64), (88, 50), (84, 42), (81, 46),
            (81, 70), (68, 70), (68, 54), (36, 54), (36, 70), (23, 70), (22, 52),
        ]
        pts = self.jitter(pts, 1.0)

        def tx(px: float, py: float) -> tuple[float, float]:
            px = 100 - px if flip else px
            return x + px * s, y + py * s

        tpts = [tx(px, py) for px, py in pts]
        d = f"M{tpts[0][0]:.1f} {tpts[0][1]:.1f} " + " ".join(
            f"Q{a[0]:.1f} {a[1]:.1f} {(a[0] + b[0]) / 2:.1f} {(a[1] + b[1]) / 2:.1f}"
            for a, b in zip(tpts[1:], tpts[2:] + [tpts[0]])
        ) + " Z"
        self.blob(d, color)
        # tusk and eye
        t0, t1, t2 = tx(84, 42), tx(100, 54), tx(104, 38)
        self.parts.append(
            f'<path d="M{t0[0]:.1f} {t0[1]:.1f} Q{t1[0]:.1f} {t1[1]:.1f} {t2[0]:.1f} {t2[1]:.1f}" fill="none" '
            f'stroke="#efe4d0" stroke-width="{3 * s:.1f}" stroke-linecap="round"/>'
        )
        e = tx(76, 18)
        self.circle(e[0], e[1], 2.2 * s, fill=CHAR)

    def person(self, x: float, y: float, s: float = 1.0, arms: str = "down", color=CHAR, face: str = "") -> None:
        """Stick caveman, feet at y. arms: down, up, out, left, right, pull_left, pull_right."""
        hx, hy = x, y - 62 * s
        self.circle(hx, hy, 8 * s, fill=color)
        neck, hip = (x, y - 53 * s), (x, y - 26 * s)
        self.line([neck, hip], color, 3.6 * s, 3, 0.7)
        self.line([hip, (x - 11 * s, y)], color, 3.4 * s, 3, 0.7)
        self.line([hip, (x + 11 * s, y)], color, 3.4 * s, 3, 0.7)
        sh = (x, y - 47 * s)
        arm_ends = {
            "down": [(x - 13 * s, y - 28 * s), (x + 13 * s, y - 28 * s)],
            "up": [(x - 15 * s, y - 72 * s), (x + 15 * s, y - 72 * s)],
            "out": [(x - 22 * s, y - 46 * s), (x + 22 * s, y - 46 * s)],
            "left": [(x - 24 * s, y - 52 * s), (x + 12 * s, y - 30 * s)],
            "right": [(x - 12 * s, y - 30 * s), (x + 24 * s, y - 52 * s)],
            "pull_left": [(x - 26 * s, y - 40 * s), (x - 24 * s, y - 36 * s)],
            "pull_right": [(x + 26 * s, y - 40 * s), (x + 24 * s, y - 36 * s)],
        }[arms]
        for end in arm_ends:
            self.line([sh, end], color, 3.2 * s, 3, 0.8)
        if face == "angry":
            self.line([(hx - 5 * s, hy - 11 * s), (hx - 1 * s, hy - 9 * s)], OCHRE, 2.2 * s, 1, 0.2)
            self.line([(hx + 5 * s, hy - 11 * s), (hx + 1 * s, hy - 9 * s)], OCHRE, 2.2 * s, 1, 0.2)
        if face == "tears":
            for dx in (-5, 5):
                self.line([(hx + dx * s, hy + 3 * s), (hx + dx * 1.3 * s, hy + 11 * s)], "#5f8fb0", 2.2 * s, 2, 0.3)

    def rock(self, cx: float, cy: float, rx: float, ry: float, mood: str = "calm", color=CHAR) -> None:
        pts = []
        for i in range(14):
            a = 2 * math.pi * i / 14
            r = 1 + self.rng.uniform(-0.07, 0.07)
            pts.append((cx + math.cos(a) * rx * r, cy + math.sin(a) * ry * r * (0.9 if math.sin(a) > 0 else 1.0)))
        d = f"M{pts[0][0]:.1f} {pts[0][1]:.1f} " + " ".join(
            f"Q{a[0]:.1f} {a[1]:.1f} {(a[0] + b[0]) / 2:.1f} {(a[1] + b[1]) / 2:.1f}"
            for a, b in zip(pts[1:] + [pts[0]], pts[2:] + pts[:2])
        ) + " Z"
        self.parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="3.4" stroke-linejoin="round"/>')
        ex, ey = rx * 0.3, ry * 0.15
        if mood == "sleep":
            for sx in (-1, 1):
                self.line([(cx + sx * ex - 5, cy - ey), (cx + sx * ex + 5, cy - ey)], color, 2.6, 2, 0.3)
        else:
            self.circle(cx - ex, cy - ey, 3.2, fill=color)
            self.circle(cx + ex, cy - ey, 3.2, fill=color)
        if mood == "frown":
            self.line([(cx - 9, cy + ry * 0.35), (cx, cy + ry * 0.25), (cx + 9, cy + ry * 0.35)], color, 2.6, 2, 0.3)
        if mood == "confused":
            self.line([(cx - 8, cy + ry * 0.3), (cx - 3, cy + ry * 0.36), (cx + 2, cy + ry * 0.28), (cx + 8, cy + ry * 0.34)], color, 2.4, 2, 0.4)

    def question(self, x: float, y: float, s: float = 1.0, color=OCHRE) -> None:
        self.line([(x - 6 * s, y - 8 * s), (x - 4 * s, y - 14 * s), (x + 3 * s, y - 15 * s), (x + 7 * s, y - 10 * s),
                   (x + 4 * s, y - 4 * s), (x, y - 1 * s), (x, y + 4 * s)], color, 3.2 * s, 2, 0.4)
        self.circle(x, y + 11 * s, 2.4 * s, fill=color)

    def tally(self, x: float, y: float, n: int, color=CHAR) -> None:
        for i in range(n):
            if i % 5 == 4:
                self.line([(x + (i - 4) * 9 - 4, y + 22), (x + (i - 1) * 9 + 4, y + 2)], color, 3.0, 2, 0.5)
            else:
                gx = x + i * 9 + (i // 5) * 14
                self.line([(gx, y), (gx + 1, y + 24)], color, 3.0, 2, 0.6)

    def hand(self, x: float, y: float, s: float = 1.0, color=OCHRE, opacity: float = 0.85) -> None:
        palm = f"M{x - 9 * s:.1f} {y:.1f} Q{x - 11 * s:.1f} {y + 14 * s:.1f} {x:.1f} {y + 16 * s:.1f} Q{x + 11 * s:.1f} {y + 14 * s:.1f} {x + 9 * s:.1f} {y:.1f} Z"
        self.blob(palm, color, opacity)
        for i, (fx, h) in enumerate(((-8, 12), (-3, 16), (2, 17), (7, 14))):
            self.parts.append(
                f'<rect x="{x + fx * s - 2.2 * s:.1f}" y="{y - h * s:.1f}" width="{4.4 * s:.1f}" height="{h * s + 2:.1f}" '
                f'rx="{2.2 * s:.1f}" fill="{color}" fill-opacity="{opacity}"/>'
            )
        self.parts.append(
            f'<rect x="{x + 9 * s:.1f}" y="{y + 1 * s:.1f}" width="{10 * s:.1f}" height="{4.4 * s:.1f}" rx="{2.2 * s:.1f}" '
            f'transform="rotate(-30 {x + 9 * s:.1f} {y + 3 * s:.1f})" fill="{color}" fill-opacity="{opacity}"/>'
        )

    def zigzag(self, x0: float, y: float, x1: float, amp: float, n: int, color=CHAR, width=3.0) -> None:
        pts = [(x0 + (x1 - x0) * i / n, y + (amp if i % 2 else -amp)) for i in range(n + 1)]
        pts = self.jitter(pts, 0.8)
        d = "M" + " L".join(f"{px:.1f} {py:.1f}" for px, py in pts)
        self.parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>')

    def burst(self, cx: float, cy: float, r: float, color=YELLOW) -> None:
        pts = []
        for i in range(16):
            a = 2 * math.pi * i / 16
            rr = r if i % 2 == 0 else r * 0.45
            pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
        pts = self.jitter(pts, r * 0.08)
        d = "M" + " L".join(f"{px:.1f} {py:.1f}" for px, py in pts) + " Z"
        self.blob(d, color, 0.95)

    def svg(self, title: str) -> str:
        rng = random.Random(7)
        blotches = []
        for _ in range(9):
            cx, cy = rng.uniform(0, W), rng.uniform(0, H)
            rx, ry = rng.uniform(40, 120), rng.uniform(25, 70)
            shade = rng.choice(["#bfae8a", "#d8cbb0", "#c4b592"])
            blotches.append(f'<ellipse cx="{cx:.0f}" cy="{cy:.0f}" rx="{rx:.0f}" ry="{ry:.0f}" fill="{shade}" fill-opacity="0.55"/>')
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img">'
            f"<title>{title}</title>"
            '<defs><radialGradient id="v" cx="50%" cy="50%" r="70%">'
            '<stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#3b2a1a" stop-opacity="0.35"/>'
            "</radialGradient></defs>"
            f'<rect width="{W}" height="{H}" fill="{WALL}"/>' + "".join(blotches) + "".join(self.parts)
            + f'<rect width="{W}" height="{H}" fill="url(#v)"/></svg>'
        )


# ------------------------------------------------------------- paintings
def greedy_box() -> str:
    c = Canvas(11)
    c.tally(30, 28, 7)
    # Boss Rock watching from the right
    c.rock(400, 82, 52, 38, "frown")
    c.line([(352, 110), (320, 128), (290, 138)], CHAR, 2.6, 4, 1.0, dash="2 9")
    # the box: square body, open mouth, little legs
    bx, by = 70, 150
    c.line([(bx, by), (bx + 74, by - 2), (bx + 76, by + 66), (bx + 2, by + 68), (bx, by)], CHAR, 3.6, 5, 1.0)
    c.blob(f"M{bx + 40} {by + 26} L{bx + 76} {by + 12} L{bx + 76} {by + 44} Z", CHAR)
    c.circle(bx + 22, by + 20, 4)
    c.circle(bx + 40, by + 18, 4)
    c.line([(bx + 18, by + 68), (bx + 16, by + 86)], CHAR, 3.4, 2, 0.5)
    c.line([(bx + 56, by + 68), (bx + 58, by + 86)], CHAR, 3.4, 2, 0.5)
    c.burst(bx + 96, by + 4, 26)
    # restart loop arrow over the box
    loop = [(bx + 10, by - 22)]
    for i in range(1, 12):
        a = math.pi * (1 - i / 11)
        loop.append((bx + 38 + math.cos(a) * 46, by - 22 - math.sin(a) * 38))
    c.line(loop, OCHRE, 3.4, 2, 0.6)
    c.blob(f"M{bx + 92} {by - 34} L{bx + 76} {by - 22} L{bx + 94} {by - 14} Z", OCHRE)
    # two mammoths marching into the mouth
    c.mammoth(178, 150, 0.82, flip=True)
    c.mammoth(300, 186, 0.62, flip=True, color=OCHRE_LIGHT)
    c.hand(448, 262, 0.9)
    return c.svg("The greedy box: a box eats two mammoths, falls over, and Boss Rock picks it up again")


def name_rock() -> str:
    c = Canvas(23)
    for i, x in enumerate((40, 82, 124)):
        c.person(x, 250, 0.85, "out" if i == 1 else "down")
        c.question(x + 4, 150 - (i % 2) * 8, 0.8)
    c.rock(236, 210, 46, 34, "confused")
    c.question(236, 140, 1.1, CHAR)
    c.line([(286, 206), (330, 214)], CHAR, 2.6, 3, 0.8, dash="2 9")
    # the retired wise rock asleep by the lake
    c.rock(388, 196, 50, 30, "sleep")
    for k, y in enumerate((150, 136, 120)):
        s = 0.8 + 0.25 * k
        x = 430 + 14 * k
        c.line([(x, y), (x + 10 * s, y), (x, y + 10 * s), (x + 10 * s, y + 10 * s)], CHAR, 2.4, 2, 0.3)
    for y in (258, 272):
        pts = [(330 + i * 12, y + (4 if i % 2 else -2)) for i in range(13)]
        c.line(pts, "#5f8fb0", 3.0, 2, 0.6)
    c.hand(36, 40, 0.8, OCHRE, 0.7)
    return c.svg("Name Rock does not know where Api Cave is; Old Wise Rock retired to the lake")


def two_painters() -> str:
    c = Canvas(37)
    # the wall they both paint on
    c.line([(140, 60), (342, 58), (344, 230), (138, 232), (140, 60)], CHAR, 3.4, 6, 1.0)
    for i in range(3):
        c.mammoth(152 + (i % 2) * 40, 72 + i * 46, 0.36)
    for i in range(5):
        c.mammoth(262 + (i % 2) * 38, 70 + i * 30, 0.32, flip=True, color=OCHRE_LIGHT)
    for k in range(3):
        c.zigzag(216, 106 + k * 30, 266, 7, 6, CHAR, 3.2)
    c.person(80, 260, 1.0, "right", face="angry")
    c.person(404, 260, 1.0, "left", face="angry")
    c.hand(460, 40, 0.8, OCHRE, 0.7)
    return c.svg("Two cavemen paint the same wall: one paints three mammoths, the other five, and angry lines grow between them")


def two_tuesdays() -> str:
    c = Canvas(41)
    for cx, sky in ((120, "sun"), (360, "moon")):
        c.line([(cx - 70, 250), (cx - 66, 150), (cx - 40, 112), (cx, 100), (cx + 40, 112), (cx + 66, 150), (cx + 70, 250)],
               CHAR, 3.6, 3, 1.0)
        if sky == "sun":
            c.circle(cx - 6, 50, 20, fill=YELLOW)
            for i in range(10):
                a = 2 * math.pi * i / 10
                c.line([(cx - 6 + math.cos(a) * 28, 50 + math.sin(a) * 28), (cx - 6 + math.cos(a) * 38, 50 + math.sin(a) * 38)], YELLOW, 3.0, 1, 0.3)
        else:
            c.parts.append(f'<path d="M{cx + 8} 28 A24 24 0 1 0 {cx + 8} 76 A18 18 0 1 1 {cx + 8} 28 Z" fill="#f3ead6" stroke="{CHAR}" stroke-width="2.6" stroke-linejoin="round"/>')
            for sx, sy in ((cx - 50, 40), (cx + 44, 28), (cx + 56, 70)):
                c.circle(sx, sy, 2.6, fill="#efe4d0")
        # tally of days on a tablet inside each cave
        c.line([(cx - 30, 170), (cx + 30, 170), (cx + 30, 220), (cx - 30, 220), (cx - 30, 170)], OCHRE, 3.0, 3, 0.6)
        c.tally(cx - 18, 184, 2 if sky == "sun" else 3, OCHRE)
    c.person(240, 266, 0.9, "out", face="tears")
    c.hand(452, 262, 0.8, OCHRE, 0.7)
    return c.svg("Two caves: one under the sun still counts two days, one under the moon counts three; the test between them cries")


PAINTINGS = {
    "greedy_box": greedy_box,
    "name_rock": name_rock,
    "two_painters": two_painters,
    "two_tuesdays": two_tuesdays,
}

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in PAINTINGS.items():
        (OUT / f"{name}.svg").write_text(fn(), encoding="utf-8")
    print(sorted(p.name for p in OUT.iterdir()))
