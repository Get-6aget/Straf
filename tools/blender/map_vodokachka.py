"""Map 'Vodokachka' (Water Tower): a stone-and-concrete courtyard around a
sunken plaza with a silo, an arcaded gallery, a scaffold by an old tower and
a warehouse with a walkable roof. Run:
    /opt/blenv/bin/python tools/blender/map_vodokachka.py [--samples N] [--size N]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from maplib import Kit, reset_scene  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'maps')
HDR = os.path.join(ROOT, 'public', 'assets', 'sky', 'kloofendal_overcast_puresky_1k.hdr')
ID = 'vodokachka'
SUN = (0.55, -0.45, 0.7)
VIEWS = [
    ('v1_plaza_from_south', (0.0, -13.0, 1.65), (1.0, 4.0, 1.5)),
    ('v2_gallery', (-8.0, 11.0, 6.05), (6.0, 0.0, 2.0)),
    ('v3_from_roof', (17.0, -10.0, 6.05), (-6.0, 4.0, 1.0)),
    ('v4_arcade_inside', (-17.5, 11.0, 1.65), (2.0, 11.0, 1.6)),
    ('v5_west', (-6.0, 2.0, 0.65), (-15.0, -5.0, 3.0)),
    ('v6_overview', (25.0, -30.0, 26.0), (0.0, 0.0, 0.0)),
]


def arg(name, default):
    if name in sys.argv:
        return int(sys.argv[sys.argv.index(name) + 1])
    return default


def build(k: Kit):
    # ---------------- ground: four strips around a sunken plaza ----------------
    k.box(-21, -18, -1.6, 21, -6, 0, 'pavers', 0.02)
    k.box(-21, 5, -1.6, 21, 18, 0, 'pavers', 0.02)
    k.box(-21, -6, -1.6, -8, 5, 0, 'pavers', 0.02)
    k.box(6, -6, -1.6, 21, 5, 0, 'pavers', 0.02)
    k.box(-8, -6, -2.0, 6, 5, -1.0, 'tiles', 0.02)           # plaza floor
    # coping stones on the retaining edges
    k.box(-8, 4.75, 0, 6.25, 5.15, 0.18, 'trim', 0.03, False)
    k.box(5.85, -6, 0, 6.25, 4.75, 0.18, 'trim', 0.03, False)
    k.col_box(-8, 4.75, 0, 6.25, 5.15, 0.18)
    k.col_box(5.85, -6, 0, 6.25, 4.75, 0.18)
    # broad steps down from the south, slide ramp from the west
    k.stairs(-6, -6, 4, -4.6, -1.0, 0.0, '-y', 'trim', steps=5)
    k.ramp(-8, -1.5, -5, 4, -1.0, 0.0, '-x', 'cast')
    k.box(-8, -1.5 - 0.35, -1.0, -5, -1.5, 0.15, 'trim', 0.03)   # ramp side wall
    # plaza cover: a dry stone basin and a lamp post
    k.basin(-3.2, -3.0, -1.0, 1.35, 0.85)
    k.rubble(-5.6, -4.0, -1.0, 5, 0.5, 3)
    k.lamppost(-6.8, 1.0, -1.0, (1, 0))
    k.crate(4.6, -3.9, -1.0, 1.0)
    k.crate(4.55, -2.75, -1.0, 0.85)
    k.barrel(-6.8, 3.6, -1.0)

    # ---------------- the water tower (silo) ----------------
    sx, sy = 1.5, 0.5
    k.cylinder(sx, sy, -1.0, 7.5, 2.1, 'cast', 40, True, 0.03, name='silo')
    for z in (-0.6, 1.6, 3.8, 6.0):
        k.cylinder(sx, sy, z, z + 0.18, 2.17, 'trim', 40, False, 0.02)
    k.cylinder(sx, sy, 7.5, 7.8, 2.3, 'trim', 40, False, 0.03)
    k.cylinder(sx, sy, 7.8, 8.6, 1.4, 'rust', 24, False, 0.03)
    k.cylinder(sx, sy, 8.6, 9.0, 0.5, 'rust', 16, False, 0.02)
    # service ladder (decor) and an overhead pipe running to the gallery building
    for z in [x * 0.35 for x in range(1, 20)]:
        k.box(sx - 0.25, sy - 2.25, z - 0.02, sx + 0.25, sy - 2.2, z + 0.02, 'rust', 0, False)
    k.box(sx - 0.3, sy - 2.3, -1.0, sx - 0.25, sy - 2.15, 7.4, 'rust', 0, False)
    k.box(sx + 0.25, sy - 2.3, -1.0, sx + 0.3, sy - 2.15, 7.4, 'rust', 0, False)
    k.pipe_y(sy + 2.0, 12.5, sx, 6.6, 0.22)
    k.box(sx - 0.15, 7.0, 0, sx + 0.15, 7.3, 6.4, 'rust', 0.01)   # pipe support
    k.box(sx - 0.5, 6.9, 6.35, sx + 0.5, 7.4, 6.45, 'rust', 0.01, False)

    # ---------------- north: arcade building ----------------
    BX0, BX1 = -20.0, 8.2
    win = []
    for x in (-17.0, -12.5, -8.0, -3.5, 1.0, 5.5):
        win += k.window(('y', 12.5, -1), x, 5.6, 1.3, 1.9, bars=x in (-12.5, 1.0))
        win += k.window(('y', 12.5, -1), x, 8.3, 1.0, 1.1)
    for x in (-15.0, -6.0, 3.0):
        win += k.window(('y', 12.5, -1), x, 0.0, 1.5, 2.6, 0.25)   # recessed doors
    k.building(BX0, 12.5, BX1, 17.0, 10.5, 'wall', cut=win, bands=(4.4,))
    # arcade front wall with six arches; parapet gap where the scaffold bridge lands
    n = 6
    pier = (BX1 - BX0 - n * 3.2) / (n + 1)
    centers = [BX0 + pier + 1.6 + i * (3.2 + pier) for i in range(n)]
    cuts = []
    for cx in centers:
        cuts += k.cutter_arch(cx, 8.8, 10.0, 3.2, 2.2)
    cuts.append(k.cutter_box(-11.8, 8.8, 4.4, -10.2, 10.0, 6.0))
    k.box(BX0, 9.0, 0, BX1, 9.8, 5.4, 'wall', 0.03, False, cut=cuts, name='arcade')
    k.box(BX0 - 0.06, 8.94, 5.4, -11.8, 9.86, 5.55, 'trim', 0.03, False)
    k.box(-10.2, 8.94, 5.4, BX1 + 0.06, 9.86, 5.55, 'trim', 0.03, False)
    k.box(BX0 - 0.06, 8.94, 3.95, BX1 + 0.06, 9.05, 4.15, 'trim', 0.02, False)   # string course
    xs = [BX0] + [c + s * 1.6 for c in centers for s in (-1, 1)] + [BX1]
    for i in range(0, len(xs), 2):
        k.col_box(xs[i], 9.0, 0, xs[i + 1], 9.8, 5.4)
    k.col_box(BX0, 9.0, 3.8, -11.8, 9.8, 5.4)
    k.col_box(-10.2, 9.0, 3.8, BX1, 9.8, 5.4)
    k.col_box(-11.8, 9.0, 3.8, -10.2, 9.8, 4.4)
    # keystones over the arches
    for cx in centers:
        k.box(cx - 0.22, 8.92, 3.55, cx + 0.22, 9.05, 4.0, 'trim', 0.02, False)
    # half-open iron gate in the second arch
    gx = centers[1]
    for i in range(6):
        k.cylinder(gx - 1.55 + i * 0.26, 9.4, 0, 3.4, 0.025, 'rust', 6, False, 0)
    k.box(gx - 1.6, 9.35, 1.2, gx - 0.25, 9.45, 1.28, 'rust', 0.01, False)
    k.box(gx - 1.6, 9.35, 2.6, gx - 0.25, 9.45, 2.68, 'rust', 0.01, False)
    k.col_box(gx - 1.6, 9.3, 0, gx - 0.25, 9.5, 3.4)
    # gallery: ceiling slab (= upper walkway) and rafters above it
    k.box(BX0, 9.8, 4.0, BX1, 12.5, 4.4, 'trim', 0.03)
    k.box(BX0, 9.8, 4.38, BX1, 12.5, 4.42, 'worn', 0, False)
    for x in [BX0 + 1.2 + i * 2.35 for i in range(12)]:
        k.beam((x, 12.5, 7.2), (x, 9.2, 6.6), 0.2)
    k.beam((BX0, 9.4, 6.6), (BX1, 9.4, 6.6), 0.22)
    for x in (-15.0, -6.0, 3.0):
        k.lamp(x, 12.45, 3.2, (0, -1))
    k.pipe_x(BX0, BX1, 12.3, 3.6, 0.09)

    # ---------------- north-east: stairs, landing, tall block ----------------
    k.stairs(9.0, -1.0, 12.0, 7.0, 0.0, 4.4, '+y', 'trim')
    k.box(8.85, -1.0, 0, 9.0, 7.0, 0.2, 'trim', 0.01, False)
    k.railing(9.0, -1.0, 9.0, 7.0, 0.0, 1.0, collide=False)
    k.box(8.2, 7.0, 4.0, 12.0, 9.8, 4.4, 'trim', 0.03)        # landing slab
    k.box(8.2, 9.8, 0, 12.0, 12.5, 4.4, 'wall', 0.03)          # block under the landing
    for x in (8.5, 11.7):
        k.box(x - 0.2, 7.1, 0, x + 0.2, 7.5, 4.0, 'trim', 0.02)
    k.railing(8.2, 7.0, 9.0, 7.0, 4.4)
    k.box(8.2, 9.8, 4.38, 12.0, 12.5, 4.42, 'worn', 0, False)
    win = []
    for y in (14.0, 16.5):
        win += k.window(('x', 8.2, -1), y, 6.0, 1.2, 1.8)
    for x in (10.0, 13.5, 17.0):
        win += k.window(('y', 12.5, -1), x, 6.0, 1.2, 1.8)
        win += k.window(('y', 12.5, -1), x, 9.0, 1.2, 1.8)
    k.building(8.2, 12.5, 21, 18, 13.0, 'wall2', cut=win, bands=(5.0, 8.4))

    # ---------------- east: warehouse with a walkable roof ----------------
    win = []
    for y in (-12.0, 2.0, 5.5):
        win += k.window(('x', 12.0, -1), y, 2.0, 1.2, 1.3, bars=True)
    door = [k.cutter_box(11.7, -9.0, 1.1, 12.3, -5.0, 3.8)]
    k.building(12.0, -14.0, 21.0, 12.5, 4.3, 'wall2', cornice=False, cut=win + door)
    k.box(12.25, -9.0, 1.1, 12.32, -5.0, 3.8, 'corr', 0, False)          # roller shutter
    k.box(11.85, -9.25, 3.8, 12.3, -4.75, 4.05, 'rust', 0.02, False)
    k.box(12.0, -14.0, 4.3, 21.0, 12.5, 4.4, 'worn', 0.02)
    k.box(11.92, -14.08, 4.15, 21.08, 12.58, 4.32, 'trim', 0.02, False)
    k.parapet(12.0, -14.0, 12.3, 7.0, 4.4, 0.55)
    k.parapet(12.0, -14.0, 21.0, -13.7, 4.4, 0.55)
    k.parapet(20.7, -13.7, 21.0, 12.5, 4.4, 0.55)
    k.box(15.0, -6.0, 4.4, 16.6, -4.4, 5.6, 'rust', 0.04)                 # vent housing
    k.box(14.0, -12.0, 4.4, 18.0, -9.0, 4.95, 'corr', 0.03)               # skylight hump
    k.cylinder(18.0, 5.0, 5.4, 7.0, 1.0, 'rust', 24, True, 0.02)          # roof tank
    for dx, dy in ((-0.6, -0.6), (0.6, -0.6), (-0.6, 0.6), (0.6, 0.6)):
        k.box(18 + dx - 0.06, 5 + dy - 0.06, 4.4, 18 + dx + 0.06, 5 + dy + 0.06, 5.4, 'rust', 0.01, False)
    k.pipe_y(-13.0, 10.0, 20.2, 4.75, 0.14)
    k.pipe_z(12.0 - 0.18, -1.6, 0.0, 4.3, 0.09)
    k.pipe_z(12.0 - 0.18, -13.2, 0.0, 4.3, 0.09)
    k.lamp(12.0, -7.0, 4.1, (-1, 0))
    # loading dock: ramp up from the south, flat platform along the facade
    k.ramp(10.0, -14.0, 12.0, -10.0, 0.0, 1.1, '+y', 'worn')
    k.box(10.0, -10.0, 0.0, 12.0, -3.0, 1.1, 'cast', 0.03)
    k.box(9.92, -10.0, 0.95, 10.08, -3.0, 1.15, 'rust', 0.01, False)
    k.crate(11.2, -4.2, 1.1, 1.0)
    k.crate(10.6, -8.6, 1.1, 0.9)
    k.barrel(10.6, -15.6)
    k.barrel(11.3, -16.0)

    # ---------------- west: old round tower + scaffold ----------------
    tx, ty, tr = -15.5, -5.0, 3.0
    slits = [k.cutter_box(tx + tr - 0.6, ty - 0.18, z, tx + tr + 0.3, ty + 0.18, z + 1.2) for z in (3.0, 7.0, 10.0)]
    slits += k.cutter_arch(ty, tx + tr - 0.6, tx + tr + 0.3, 1.6, 1.6) if False else []
    k.cylinder(tx, ty, 0.0, 13.0, tr, 'stone', 36, True, 0.03, name='tower')
    tower = k.objs[-1]
    k._cut(tower, slits)
    k.cylinder(tx, ty, 0.0, 0.7, tr + 0.18, 'trim', 36, False, 0.03)
    k.cylinder(tx, ty, 12.6, 13.2, tr + 0.3, 'trim', 36, False, 0.03)
    for i in range(12):
        a = i / 12 * math.pi * 2
        if i % 2 == 0:
            cx, cy = tx + math.cos(a) * (tr + 0.05), ty + math.sin(a) * (tr + 0.05)
            k.box(cx - 0.45, cy - 0.45, 13.2, cx + 0.45, cy + 0.45, 14.1, 'stone', 0.04, False)
    # scaffold platform with stairs and a plank bridge to the gallery
    P = (-13.0, -3.0, -9.0, 1.0)
    k.box(P[0], P[1], 4.15, P[2], P[3], 4.4, 'wood', 0.02)
    for px, py in ((P[0] + 0.2, P[1] + 0.2), (P[2] - 0.2, P[1] + 0.2), (P[0] + 0.2, P[3] - 0.2), (P[2] - 0.2, P[3] - 0.2), (-11.0, -1.0)):
        k.box(px - 0.15, py - 0.15, 0, px + 0.15, py + 0.15, 4.15, 'wood', 0.02)
    k.beam((P[0] + 0.2, P[1] + 0.2, 0.3), (P[2] - 0.2, P[1] + 0.2, 4.0), 0.14)
    k.beam((P[0] + 0.2, P[3] - 0.2, 0.3), (P[2] - 0.2, P[3] - 0.2, 4.0), 0.14)
    k.railing(P[0], P[1], P[0], P[3], 4.4)
    k.railing(P[0], P[1], -10.2, P[1], 4.4)
    k.stairs(-10.2, -10.0, -9.0, -3.0, 0.0, 4.4, '+y', 'wood')
    k.railing(-9.0, -10.0, -9.0, -3.0, 0.0, 1.0, collide=False)
    k.box(-11.6, 1.0, 4.25, -10.4, 9.0, 4.4, 'wood', 0.015)              # plank bridge
    for y in (3.5, 6.5):
        k.box(-11.5, y - 0.12, 0, -11.26, y + 0.12, 4.25, 'wood', 0.02)
        k.box(-10.74, y - 0.12, 0, -10.5, y + 0.12, 4.25, 'wood', 0.02)
    k.crate(-12.0, -6.6, 0.0, 1.0)
    k.crate(-12.1, -7.7, 0.0, 0.9)
    k.barrel(-9.5, 2.8)

    # ---------------- south: shed, broken wall, perimeter ----------------
    k.building(-21.0, -18.0, 21.0, -17.0, 6.5, 'wall2', bands=(3.2,))
    for x in range(-18, 21, 6):
        k.box(x - 0.35, -17.0, 0, x + 0.35, -16.65, 6.0, 'wall2', 0.03)
    k.building(-21.0, -17.0, -20.0, 18.0, 7.0, 'wall2')
    for y in range(-14, 9, 6):
        k.box(-20.0, y - 0.35, 0, -19.65, y + 0.35, 6.4, 'wall2', 0.03)
    k.building(21.0, -18.0, 22.0, 18.0, 6.5, 'wall2', plinth=False)
    # shed: corrugated lean-to on wooden posts
    for x in (-12.8, -8.5, -4.2):
        k.box(x - 0.13, -13.2, 0, x + 0.13, -12.94, 2.9, 'wood', 0.02)
    k.box(-13.0, -13.25, 2.75, -4.0, -12.9, 3.0, 'wood', 0.02, False)
    k.ramp(-13.2, -17.0, -3.8, -12.8, 2.95, 3.4, '-y', 'corr')
    k.box(-13.0, -17.0, 0, -12.7, -13.2, 2.9, 'wood', 0.02)                # side boards
    k.crate(-11.9, -15.8, 0.0, 1.0)
    k.crate(-11.9, -14.7, 0.0, 1.0)
    k.crate(-11.9, -15.8, 1.0, 1.0)
    k.crate(-10.6, -16.2, 0.0, 0.8)
    for bx, by in ((-6.2, -16.1), (-5.5, -16.3), (-6.0, -15.4)):
        k.barrel(bx, by)
    k.lamp(-8.5, -16.95, 2.6, (0, 1))
    # south yard: a free-standing ruined wall with an arched passage, rubble and road barriers
    arch = k.cutter_arch(2.0, -10.8, -9.8, 1.8, 1.3)
    k.box(-2.0, -10.6, 0, 6.2, -10.0, 2.6, 'wall', 0.04, False, cut=arch, name='ruinwall')
    k.col_box(-2.0, -10.6, 0, 1.1, -10.0, 2.6)
    k.col_box(2.9, -10.6, 0, 6.2, -10.0, 2.6)
    k.col_box(1.1, -10.6, 2.2, 2.9, -10.0, 2.6)
    k.box(-2.1, -10.7, 2.6, 6.3, -9.9, 2.78, 'trim', 0.03, False)
    for x in (-2.0, 6.2):
        k.box(x - 0.25, -10.75, 0, x + 0.25, -9.85, 2.9, 'trim', 0.03, False)
    k.rubble(4.5, -9.3, 0, 7, 0.9, 5)
    k.rubble(-1.2, -11.2, 0, 4, 0.6, 7)
    k.jersey(7.3, -12.5, 2.2, 'x')
    k.jersey(8.1, -8.5, 2.2, 'y')
    k.lamppost(-1.5, -6.6, 0.0, (0, 1))

    # ---------------- background skyline (no collision) ----------------
    def tower(x0, y0, x1, y1, h, mat='wall'):
        win = []
        k.building(x0, y0, x1, y1, h, mat, collide=False, bg=True, bands=(h * 0.5,))
        face_y = y0 if y0 > 0 else y1
        s = -1 if y0 > 0 else 1
        for z in [3.5 + i * 3.4 for i in range(int((h - 4) / 3.4))]:
            for u in [x0 + 1.5 + j * 2.6 for j in range(int((x1 - x0 - 2) / 2.6))]:
                yy = face_y + (0.02 * s)
                k.box(u - 0.55, min(face_y, yy), z, u + 0.55, max(face_y, yy) + 0.001, z + 1.6, 'dark', 0, False, True)
        del win
    for x0, w, d, h in ((-34, 9, 8, 22), (-22, 7, 7, 30), (-12, 10, 9, 18), (0, 8, 8, 26), (11, 9, 8, 20), (23, 8, 10, 34)):
        tower(x0, 22 + (x0 % 3), x0 + w, 22 + d, h)
    for x0, w, d, h in ((-30, 10, 8, 16), (-16, 8, 9, 24), (-4, 9, 7, 14), (8, 7, 8, 28), (20, 10, 8, 18)):
        tower(x0, -22 - d, x0 + w, -22, h, 'wall2')
    for y0, d, h in ((-20, 9, 20), (-6, 8, 28), (8, 10, 16)):
        k.building(-36, y0, -26, y0 + d, h, 'wall', collide=False, bg=True, bands=(h * 0.5,))
        k.building(27, y0, 37, y0 + d, h, 'wall2', collide=False, bg=True, bands=(h * 0.5,))
    k.cylinder(-30, 32, 0, 42, 1.6, 'cast', 24, False, 0, name='chimney', bg=True)
    k.cylinder(32, -30, 0, 24, 3.5, 'cast', 32, False, 0, name='bgsilo', bg=True)
    k.box(-60, -60, -2.0, 60, 60, -1.6, 'pavers', 0, False, True)

    # ---------------- gameplay points ----------------
    for p in ((-18.0, -15.0, 0), (18.0, -15.8, 0), (-18.0, 7.0, 0), (16.0, 10.0, 4.4), (0.0, -14.5, 0), (-2.0, 7.0, 0)):
        k.spawn(*p)
    for p in ((-2.2, 1.2, -1.0), (-6.0, 11.2, 4.4), (-11.0, -1.0, 4.4), (16.0, -2.0, 4.4), (11.1, -6.5, 1.1),
              (-8.5, -15.0, 0), (-6.0, 11.0, 0), (2.0, -13.0, 0), (10.6, 10.5, 4.4), (4.6, -1.3, -1.0)):
        k.weapon(*p)


def main():
    if '--preview' in sys.argv:
        from maplib import preview
        reset_scene()
        k = Kit(ID)
        build(k)
        k.finish_geometry()
        k.lighting(HDR, sun_dir=SUN, sun_energy=3.2, sky=1.0)
        preview(VIEWS, '/tmp/verify/map', arg('--samples', 24))
        return
    samples = arg('--samples', 128)
    size = arg('--size', 2048)
    reset_scene()
    k = Kit(ID)
    build(k)
    k.finish_geometry()
    k.lighting(HDR, sun_dir=SUN, sun_energy=3.2, sky=1.0)
    os.makedirs(OUT, exist_ok=True)
    print('faces', len(k.level.data.polygons), 'bg faces', len(k.background.data.polygons) if k.background else 0, flush=True)
    import time
    t0 = time.time()
    k.bake(k.level, size, samples, os.path.join(OUT, f'{ID}_lm.png'), scale=0.35)
    print('bake level', round(time.time() - t0, 1), 's', flush=True)
    if k.background:
        t0 = time.time()
        k.bake(k.background, size // 2, max(16, samples // 4), os.path.join(OUT, f'{ID}_bg_lm.png'), scale=0.35)
        print('bake bg', round(time.time() - t0, 1), 's', flush=True)
    k.export(os.path.join(OUT, f'{ID}.glb'), os.path.join(OUT, f'{ID}.json'),
             {'id': ID, 'killY': -25, 'lmScale': 0.35, 'sky': 'kloofendal_overcast_puresky',
              'sun': [0.55, 0.7, 0.45], 'name': {'ru': 'Водокачка', 'en': 'Water Tower'}})
    print('done', flush=True)


if __name__ == '__main__':
    main()
