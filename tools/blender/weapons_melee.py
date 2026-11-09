"""Blades, grenade and projectiles: tesak, klinok, limonka, rocket, shell.

Blades are modelled in the *gun* convention: the tip points +Y (three.js -Z), edge down (-Z), the right hand grips the
handle at the origin. Grenade is upright (axis Z) so that it sits in the vertical-fist right hand.
"""
import math

from mathutils import Vector

from weapons_rifles import add_shell
from wpn_geo import catmull, circle_profile, line_pts, rect_profile


def edge_bevel_cutters(cb, y0, y1, half_t, z_start, z_edge, tip_t=0.0005, zone='steel'):
    """Two wedge cutters that grind a double-facet edge between z_start and z_edge."""
    dx, dz = tip_t - half_t, z_edge - z_start
    ln = math.hypot(dx, dz)
    beta = math.degrees(math.atan2(-dx, -dz))
    nx, nz = -dz / ln, dx / ln
    mx, mz = (half_t + tip_t) / 2, (z_start + z_edge) / 2
    ym, yl = (y0 + y1) / 2, (y1 - y0)
    for s in (1, -1):
        cb.box((0.05, yl, 0.30), (s * (mx + nx * 0.025), ym, mz + nz * 0.025), (0, s * beta, 0), zone, bv=0)


def build_tesak(b):
    P = {'paint': (0.2, 0.2, 0.17), 'wear': 0.8, 'cloth': (0.30, 0.20, 0.12), 'steel_rust': 1.0,
         'wood_tex': 'worn_planks', 'tape': (0.10, 0.09, 0.07)}
    HT = 0.0034
    # ---- wide pitted cleaver blade with ground edge + chips -----------------------------------------------------
    tb = b.sub()
    blade = [(0.052, 0.018), (0.052, 0.024), (0.300, 0.026), (0.352, 0.020), (0.384, 0.004), (0.372, -0.020),
             (0.338, -0.046), (0.250, -0.064), (0.140, -0.070), (0.090, -0.066), (0.052, -0.052)]
    tb.prism(blade, 'YZ', -HT, HT, 'iron', bv=0.0005)
    cb = b.sub()
    edge_bevel_cutters(cb, 0.06, 0.40, HT, -0.040, -0.0705)
    for (y, z, a, sz) in ((0.14, -0.071, 30, 0.008), (0.19, -0.069, -25, 0.006), (0.245, -0.066, 40, 0.010),
                          (0.31, -0.056, 20, 0.007), (0.352, -0.036, 35, 0.008)):
        cb.box((0.02, sz, sz), (0, y, z), (a, 0, 0), 'steel', bv=0)
    cb.cyl(0.0085, 0.02, 'X', (0, 0.092, 0.002), ch=0, segs=12, zone='dark')      # hanging hole
    for (y, z) in ((0.21, 0.016), (0.275, 0.012)):
        cb.cyl(0.0045, 0.02, 'X', (0, y, z), ch=0, segs=8, zone='dark')
    b.cut(tb, cb, bv=0.0004)
    b.prism([(0.052, 0.014), (0.052, 0.026), (0.300, 0.028), (0.352, 0.022), (0.346, 0.016), (0.300, 0.017)], 'YZ', -0.0046, 0.0046,
            'iron', bv=0.0008)                                                   # thick spine
    # ---- bolster, rivets, wrapped handle, lanyard ------------------------------------------------------------------
    b.bx((-0.0105, 0.0105), (0.050, 0.068), (-0.030, 0.030), 'steel', bv=0.0025, seg=2)
    for s in (-1, 1):
        b.rivets([(s * 0.0105, 0.059, 0.020), (s * 0.0105, 0.059, -0.020)], (s, 0, 0), r=0.0042, h=0.0028, zone='brass')
    b.cyl(0.0170, 0.130, 'Y', (0, -0.005, 0), ch=0.003, segs=10, zone='wood', scale=(0.95, 1.12))
    circ = circle_profile(0.0176, 8, 0.0, 0.97, 1.13)
    b.wrap_helix(circ, -0.066, 0.048, 12, 0.0105, 0.0032, 'cloth', per=1)
    b.cyl(0.0205, 0.016, 'Y', (0, -0.080, 0), ch=0.003, segs=10, zone='iron', scale=(0.95, 1.12))
    b.torus(0.0085, 0.0018, 'Y', (0, -0.092, -0.010), major=10, minor=4, zone='steel')
    b.sweep(catmull([(0, -0.092, -0.017), (0.004, -0.095, -0.045), (-0.004, -0.092, -0.080), (0.0, -0.095, -0.100)], 5),
            rect_profile(0.006, 0.003), 'leather', bv=0.0006)
    b.empty('muzzle', (0, 0.384, 0.004))
    return P


def build_klinok(b):
    P = {'paint': (0.2, 0.2, 0.18), 'wear': 0.8, 'cloth': (0.34, 0.27, 0.17), 'steel_rust': 1.0, 'tape': (0.10, 0.09, 0.07)}
    HT = 0.0032
    # ---- long single-edged blade with fuller ----------------------------------------------------------------------
    tb = b.sub()
    blade = [(0.082, 0.024), (0.30, 0.0245), (0.62, 0.0225), (0.80, 0.0185), (0.875, 0.010), (0.884, -0.002), (0.82, -0.016),
             (0.50, -0.0235), (0.082, -0.0265)]
    tb.prism(blade, 'YZ', -HT, HT, 'iron', bv=0.0005)
    cb = b.sub()
    edge_bevel_cutters(cb, 0.08, 0.90, HT, -0.0085, -0.0270, tip_t=0.0006)
    for s in (1, -1):
        cb.box((0.0045, 0.60, 0.0085), (s * HT, 0.40, 0.0105), zone='steel', bv=0)
    for (y, z, a, sz) in ((0.42, -0.0240, 30, 0.006), (0.55, -0.0225, -35, 0.007), (0.69, -0.0200, 25, 0.006),
                          (0.78, -0.0160, 30, 0.007)):
        cb.box((0.02, sz, sz), (0, y, z), (a, 0, 0), 'steel', bv=0)
    b.cut(tb, cb, bv=0.0004)
    b.prism([(0.082, 0.020), (0.082, 0.0275), (0.62, 0.0255), (0.80, 0.0205), (0.80, 0.0175), (0.62, 0.0195)], 'YZ', -0.0042, 0.0042,
            'iron', bv=0.0008)
    # ---- square guard, ricasso block ------------------------------------------------------------------------------------
    b.bx((-0.052, 0.052), (0.074, 0.092), (-0.030, 0.030), 'steel', bv=0.003, seg=2)
    b.bx((-0.0105, 0.0105), (0.090, 0.112), (-0.0295, 0.0295), 'iron', bv=0.002)
    for s in (-1, 1):
        b.rivets([(s * 0.040, 0.0925, 0.0), (s * 0.040, 0.0735, 0.0)], (0, 1 if s > 0 else -1, 0), r=0.0045, h=0.003, zone='brass')
        b.rivet((s * 0.0105, 0.100, 0.020), (s, 0, 0), r=0.0042, h=0.0028, zone='brass')
    # ---- cord-wrapped long handle -----------------------------------------------------------------------------------------
    b.cyl(0.0172, 0.310, 'Y', (0, -0.085, 0), ch=0.002, segs=10, zone='wood', scale=(0.92, 1.1))
    circ = circle_profile(0.0178, 8, 0.0, 0.94, 1.12)
    b.wrap_helix(circ, -0.236, 0.068, 21, 0.0145, 0.0034, 'cloth', per=1)
    for yy in (-0.245, 0.066):
        b.cyl(0.0198, 0.012, 'Y', (0, yy, 0), ch=0.002, segs=10, zone='iron', scale=(0.94, 1.12))
    # pommel with spike and lanyard ring
    b.sphere(0.0235, (0, -0.268, 0), (0.9, 1.1, 1.0), 10, 6, 'steel')
    b.cone(0.0100, 0.0028, 0.030, 'Y', (0, -0.300, 0), segs=8, zone='iron')
    b.torus(0.0090, 0.0018, 'X', (0, -0.262, -0.033), major=10, minor=4, zone='steel')
    b.empty('muzzle', (0, 0.884, -0.002))
    b.empty('grip_L', (0, -0.145, 0))
    return P


def build_limonka(b):
    P = {'paint': (0.2, 0.25, 0.14), 'wear': 0.7, 'steel_rust': 0.9}
    # ---- segmented egg body ---------------------------------------------------------------------------------------------
    prof = [(0.0, -0.054)]
    grooves = (-0.036, -0.018, 0.0, 0.018, 0.036)
    zs = [-0.052 + i * 0.0052 for i in range(21)]
    for z in zs:
        r = 0.0345 * math.sqrt(max(0.0, 1 - (z / 0.057) ** 2)) + 0.0025 * (1 - abs(z) / 0.057)
        if any(abs(z - g) < 0.0016 for g in grooves):
            r -= 0.0028
        prof.append((max(r, 0.006), z))
    prof.append((0.0125, 0.0555))
    b.lathe(prof, 'Z', segs=12, zone='frag', cap=True)
    b.cyl(0.0135, 0.018, 'Z', (0, 0, 0.0615), ch=0.0022, segs=10, zone='iron')
    b.cyl(0.0165, 0.007, 'Z', (0, 0, 0.0555), ch=0.0015, segs=10, zone='steel')
    b.cyl(0.0105, 0.012, 'Z', (0, 0, 0.0765), ch=0.002, segs=8, zone='steel')
    b.cyl(0.0042, 0.0015, 'Z', (0, 0, 0.0825), ch=0, segs=6, zone='dark')
    b.cyl(0.0150, 0.005, 'Z', (0, 0, -0.054), ch=0.001, segs=10, zone='iron')
    # ---- spoon lever, hinge, pin + ring ----------------------------------------------------------------------------------
    spoon = [(0.0, 0.0135, 0.075), (0.0, 0.0225, 0.068), (0.0, 0.0385, 0.046), (0.0, 0.0415, 0.010), (0.0, 0.0365, -0.030),
             (0.0, 0.022, -0.052)]
    b.sweep(catmull(spoon, 5), rect_profile(0.019, 0.0033), 'steel', up=lambda i, p, t: Vector((1, 0, 0)), bv=0.0007)
    b.bx((-0.0105, 0.0105), (0.008, 0.020), (0.064, 0.078), 'steel', bv=0.0015)
    b.cyl(0.0024, 0.050, 'X', (0.005, 0.0, 0.0600), ch=0, segs=6, zone='steel')
    b.torus(0.0120, 0.0018, 'X', (0.034, 0.002, 0.052), major=12, minor=4, zone='steel')
    b.empty('muzzle', (0, 0, 0.0835))
    return P


def build_rocket(b):
    P = {'paint': (0.22, 0.25, 0.16), 'wear': 0.7, 'paint2': (0.5, 0.11, 0.05), 'steel_rust': 0.9}
    # body: motor section, warhead cylinder, ogive nose (axis Y, centre of mass at the origin)
    b.lathe([(0.030, -0.250), (0.038, -0.236), (0.038, -0.120), (0.045, -0.108), (0.045, 0.070), (0.043, 0.082),
             (0.040, 0.100), (0.033, 0.150), (0.022, 0.200), (0.011, 0.235), (0.0, 0.248)], 'Y', segs=16, zone='paint', cap=True)
    b.lathe([(0.0455, 0.0725), (0.0455, 0.070), (0.043, 0.082), (0.040, 0.100), (0.033, 0.150), (0.022, 0.200), (0.011, 0.235),
             (0.0, 0.248), (0.0, 0.248)][1:-1], 'Y', segs=16, zone='paint2', cap=False) if False else None
    b.cyl(0.0465, 0.016, 'Y', (0, 0.078, 0), ch=0.003, segs=16, zone='iron')
    b.cyl(0.0465, 0.014, 'Y', (0, -0.112, 0), ch=0.003, segs=16, zone='iron')
    b.cone(0.0405, 0.0105, 0.150, 'Y', (0, 0.175, 0), segs=16, zone='paint2')
    b.cyl(0.0105, 0.020, 'Y', (0, 0.255, 0), ch=0.002, segs=8, zone='steel')
    b.cyl(0.0465, 0.040, 'Y', (0, -0.020, 0), ch=0.002, segs=16, zone='paint2')
    # nozzle
    b.cone(0.034, 0.044, 0.030, 'Y', (0, -0.262, 0), segs=16, zone='iron')
    b.cyl(0.026, 0.004, 'Y', (0, -0.2775, 0), ch=0, segs=14, zone='dark')
    b.rivet_ring(-0.112, 0.0465, 14, center=(0, 0), r=0.0034, h=0.0022, zone='steel', lo=True)
    b.rivet_ring(0.078, 0.0465, 14, center=(0, 0), r=0.0034, h=0.0022, zone='steel', lo=True)
    # fins
    for ang in (0, 90, 180, 270):
        with b.at(rot=(0, ang, 0)):
            b.prism([(-0.128, 0.034), (-0.200, 0.098), (-0.262, 0.098), (-0.262, 0.034)], 'YZ', -0.0032, 0.0032, 'paint', bv=0.0012)
            b.rivets([(0.0, -0.140, 0.045), (0.0, -0.140, 0.060)], (1, 0, 0), r=0.003, h=0.002, lo=True)
    return P


def build_shell(b):
    P = {'red': (0.5, 0.04, 0.03)}
    add_shell(b, (0, -0.035, 0), 'Y', length=0.07, r=0.0105, segs=14)
    return P
