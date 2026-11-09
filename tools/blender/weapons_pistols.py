"""One-handed sidearms: shilo, baraban, otboinik, strizh. Forward = +Y, grip centre at the origin."""
import math

from mathutils import Matrix, Vector

from wpn_geo import align_z, catmull, circle_profile, line_pts, rect_profile


def rake(y, z, k=0.14):
    return (y + k * z, z)


def build_shilo(b):
    P = {'paint': (0.36, 0.38, 0.31), 'wear': 0.55, 'grip': (0.13, 0.06, 0.04), 'wood_tex': 'wood_fine'}
    ZS, ZB = 0.062, 0.110      # slide z range
    # ---- slide (boolean: serrations both sides + ejection port) -------------------------------------
    tb = b.sub()
    prof = [(-0.064, ZS), (-0.064, ZB - 0.007), (-0.058, ZB), (0.122, ZB), (0.140, ZB - 0.014), (0.140, ZS)]
    tb.prism(prof, 'YZ', -0.0172, 0.0172, 'paint', bv=0.0028, seg=2)
    cb = b.sub()
    for i in range(7):
        y = -0.056 + i * 0.0072
        for s in (-1, 1):
            cb.box((0.006, 0.0034, 0.040), (s * 0.0172, y, 0.086), zone='steel', bv=0)
    cb.box((0.012, 0.050, 0.026), (0.0172, 0.018, 0.090), zone='dark', bv=0)       # ejection port
    b.cut(tb, cb, bv=0.0009)
    # slide top: sight rail, rear notch block, front blade
    b.bx((-0.0045, 0.0045), (-0.050, 0.126), (ZB - 0.001, ZB + 0.0045), 'paint', bv=0.0012)
    for i in range(9):
        b.bx((-0.0048, 0.0048), (-0.046 + i * 0.0165, -0.046 + i * 0.0165 + 0.003), (ZB + 0.0035, ZB + 0.0052), 'steel', bv=0.0006)
    b.bx((-0.008, 0.008), (-0.064, -0.050), (ZB, ZB + 0.011), 'iron', bv=0.0015)
    b.bx((-0.0022, 0.0022), (-0.0625, -0.0505), (ZB + 0.006, ZB + 0.0125), 'dark', bv=0)
    b.bx((-0.0017, 0.0017), (0.126, 0.134), (ZB, ZB + 0.011), 'iron', bv=0.0008)
    # recoil spring rod + barrel at the muzzle
    b.cyl(0.0095, 0.022, 'Y', (0, 0.141, 0.086), ch=0.0018, segs=12, zone='steel')
    b.cyl(0.0058, 0.002, 'Y', (0, 0.1525, 0.086), ch=0, segs=10, zone='dark')
    b.cyl(0.0046, 0.014, 'Y', (0, 0.134, 0.0705), ch=0.0008, segs=8, zone='iron')
    # slide-front plate with rivets
    b.rivets([(0.0, 0.1402, 0.066)], (0, 1, 0), r=0.0035, h=0.002)
    # ---- frame ---------------------------------------------------------------------------------------
    fr = [(-0.068, 0.040), (-0.068, ZS + 0.003), (0.134, ZS + 0.003), (0.134, 0.050), (0.075, 0.050), (0.075, 0.040)]
    b.prism(fr, 'YZ', -0.0155, 0.0155, 'iron', bv=0.002, seg=2)
    # frame rail ribs at the dust cover
    for i in range(3):
        b.bx((-0.0165, 0.0165), (0.090 + i * 0.016, 0.098 + i * 0.016), (0.048, 0.056), 'steel', bv=0.001)
    # trigger guard (sweep) + trigger
    pts = [(0.034, 0.045), (0.038, 0.020), (0.054, 0.0085), (0.078, 0.016), (0.080, 0.050)]
    path = [(0, y, z) for y, z in catmull([(p[0], p[1]) for p in pts], 5)]
    b.sweep(path, rect_profile(0.007, 0.0048), 'iron', up=lambda i, p, t: Vector((1, 0, 0)), bv=0.0008)
    b.prism([(0.040, 0.047), (0.050, 0.047), (0.047, 0.024), (0.041, 0.026)], 'YZ', -0.0028, 0.0028, 'steel', bv=0.0008)
    # hammer spur & safety
    b.prism([(-0.072, 0.108), (-0.064, 0.108), (-0.064, 0.095), (-0.072, 0.098)], 'YZ', -0.0055, 0.0055, 'iron', bv=0.0012)
    b.prism([(-0.044, 0.093), (-0.030, 0.093), (-0.026, 0.083), (-0.044, 0.082)], 'YZ', -0.0215, -0.0165, 'steel', bv=0.0010)
    b.cyl(0.0042, 0.006, 'X', (-0.0192, -0.030, 0.056), ch=0.0008, segs=8, zone='steel')   # mag-release
    # ---- bakelite grip -------------------------------------------------------------------------------
    gp = [rake(-0.031, 0.056), rake(-0.034, 0.0), rake(-0.031, -0.062), rake(0.029, -0.062), rake(0.034, 0.0),
          rake(0.030, 0.040), rake(0.040, 0.056)]
    b.prism(gp, 'YZ', -0.0235, 0.0235, 'grip', bv=0.003, seg=2, b_scale=1.0)
    # ribs along the front strap and grip screws
    for i in range(4):
        z = -0.044 + i * 0.020
        y, zz = rake(0.0345, z)
        b.bx((-0.0238, 0.0238), (y - 0.0012, y + 0.0030), (zz - 0.0030, zz + 0.0030), 'grip', bv=0.001)
    for s in (-1, 1):
        for yy, zz in ((-0.012, 0.030), (0.008, -0.030)):
            y, z = rake(yy, zz)
            b.bolt((s * 0.0232, y, z), (s, 0, 0), r=0.0052, h=0.0032, zone='iron')
    # magazine base plate with lanyard loop
    y0, z0 = rake(0, -0.068)
    b.bx((-0.0245, 0.0245), (y0 - 0.040, y0 + 0.037), (z0 - 0.0065, z0 + 0.0065), 'iron', bv=0.0018)
    b.bx((-0.007, 0.007), (y0 - 0.050, y0 - 0.036), (z0 - 0.0065, z0 + 0.0025), 'iron', bv=0.0012)
    b.torus(0.0105, 0.0019, 'X', (0, y0 - 0.056, z0 - 0.010), major=14, minor=5, zone='steel')
    b.rivets([(0.0, y0 - 0.050, z0 - 0.001), (0.0, y0 - 0.047, z0 + 0.0026)], (0, 0, 1), r=0.003, h=0.002)
    # frame rivets (left+right)
    for s in (-1, 1):
        b.rivets([(s * 0.0158, 0.110, 0.0575), (s * 0.0158, 0.125, 0.0575), (s * 0.0158, -0.050, 0.066)], (s, 0, 0), r=0.0034, h=0.0022)
    b.empty('muzzle', (0, 0.1535, 0.086))
    return P


def build_baraban(b):
    P = {'paint': (0.22, 0.22, 0.2), 'wear': 0.65, 'grip': (0.1, 0.07, 0.05), 'wood_tex': 'wood_dark',
         'wood_tex_tint': (1.0, 0.85, 0.75), 'steel_rust': 0.85}
    AX = 0.092      # bore axis height
    # ---- frame: solid iron body around the cylinder ---------------------------------------------------
    fr = [(-0.052, 0.050), (-0.060, 0.090), (-0.048, 0.118), (0.055, 0.118), (0.062, 0.100), (0.062, 0.060),
          (0.030, 0.052), (0.012, 0.062), (-0.020, 0.052)]
    b.prism(fr, 'YZ', -0.0175, 0.0175, 'iron', bv=0.0028, seg=2)
    # cylinder window (recess both sides) done as dark panels behind the cylinder
    b.bx((-0.0185, 0.0185), (-0.002, 0.060), (0.058, 0.108), 'dark', bv=0)
    # topstrap with rear notch + sight
    b.bx((-0.009, 0.009), (-0.050, 0.060), (0.116, 0.1245), 'iron', bv=0.0015)
    b.bx((-0.0055, 0.0055), (-0.054, -0.040), (0.1235, 0.131), 'steel', bv=0.001)
    b.bx((-0.0016, 0.0016), (-0.0545, -0.0405), (0.1275, 0.1315), 'dark', bv=0)
    # ---- fluted cylinder: profile with 6 flutes, extruded along Y --------------------------------------
    R = 0.0345
    pts = []
    n = 6
    for i in range(n):
        base = 360.0 / n * i
        for k in range(7):
            a = math.radians(base + 60.0 * k / 6.0)
            r = R - (0.0055 * math.sin(math.pi * k / 6.0) ** 0.7)
            pts.append((math.cos(a) * r, math.sin(a) * r))
    cyl_pts = [(p[0], p[1]) for p in pts]
    b.prism(cyl_pts, 'XZ', 0.0, 0.058, 'steel', bv=0.0016, loc=(0, 0.0, AX))
    # chamber mouths on the cylinder rear face (dark) and ratchet
    for i in range(n):
        a = math.radians(30 + 60 * i)
        b.cyl(0.0078, 0.002, 'Y', (math.cos(a) * 0.0215, -0.0005, AX + math.sin(a) * 0.0215), ch=0, segs=8, zone='dark')
    b.cyl(0.011, 0.006, 'Y', (0, 0.0585, AX), ch=0.0015, segs=10, zone='iron')
    # ---- octagonal barrel + top rib + ejector rod ----------------------------------------------------
    b.cyl(0.0145, 0.178, 'Y', (0, 0.062 + 0.089, AX), ch=0.0015, segs=8, zone='steel', phase=math.radians(22.5))
    b.cyl(0.0185, 0.030, 'Y', (0, 0.070, AX), ch=0.003, segs=8, zone='iron', phase=math.radians(22.5))
    b.cyl(0.0170, 0.010, 'Y', (0, 0.236, AX), ch=0.002, segs=8, zone='steel', phase=math.radians(22.5))   # muzzle crown
    b.cyl(0.0078, 0.0016, 'Y', (0, 0.2415, AX), ch=0, segs=10, zone='dark')
    b.bx((-0.0035, 0.0035), (0.060, 0.226), (AX + 0.0135, AX + 0.0185), 'iron', bv=0.0012)
    for i in range(10):
        b.bx((-0.004, 0.004), (0.070 + i * 0.016, 0.073 + i * 0.016), (AX + 0.0175, AX + 0.0195), 'steel', bv=0.0005)
    b.bx((-0.0016, 0.0016), (0.222, 0.231), (AX + 0.0155, AX + 0.0245), 'iron', bv=0.0008)       # front sight
    # ejector rod under barrel + housing
    b.cyl(0.0058, 0.140, 'Y', (0.0, 0.140, AX - 0.0235), ch=0.001, segs=8, zone='iron')
    b.cyl(0.0085, 0.020, 'Y', (0.0, 0.217, AX - 0.0235), ch=0.002, segs=8, zone='steel')
    b.cyl(0.0125, 0.012, 'Y', (0.0, 0.074, AX - 0.021), ch=0.002, segs=8, zone='iron')
    b.bx((-0.006, 0.006), (0.060, 0.215), (AX - 0.0235, AX - 0.012), 'iron', bv=0.001)
    # ---- hammer (big, curved spur) -----------------------------------------------------------------------
    hp = [(-0.046, 0.118), (-0.050, 0.130), (-0.066, 0.142), (-0.072, 0.134), (-0.062, 0.122), (-0.052, 0.108),
          (-0.052, 0.098), (-0.040, 0.100)]
    b.prism(hp, 'YZ', -0.0065, 0.0065, 'steel', bv=0.0018, seg=2)
    # ---- trigger guard + trigger ----------------------------------------------------------------------------
    tg = [(0.052, 0.058), (0.056, 0.036), (0.036, 0.020), (0.0, 0.020), (-0.022, 0.034), (-0.030, 0.052)]
    path = [(0, y, z) for y, z in catmull(tg, 5)]
    b.sweep(path, rect_profile(0.0075, 0.0055), 'iron', up=lambda i, p, t: Vector((1, 0, 0)), bv=0.0008)
    b.prism([(0.014, 0.060), (0.022, 0.060), (0.014, 0.036), (0.009, 0.040)], 'YZ', -0.0028, 0.0028, 'steel', bv=0.0008)
    # ---- wooden bird-head grip with brass rivets & iron butt cap ----------------------------------------
    gp = [rake(-0.032, 0.055, 0.2), rake(-0.040, 0.010, 0.2), rake(-0.043, -0.050, 0.2), rake(0.020, -0.062, 0.2),
          rake(0.030, -0.010, 0.2), rake(0.028, 0.040, 0.2), rake(0.040, 0.056, 0.2)]
    gp = [(y - 0.006, z) for y, z in gp]
    b.prism(gp, 'YZ', -0.0215, 0.0215, 'wood', bv=0.003, seg=2)
    for s in (-1, 1):
        for yy, zz in ((-0.020, 0.032), (0.0, -0.040), (-0.014, -0.012)):
            y, z = rake(yy - 0.004, zz, 0.2)
            b.rivet((s * 0.0213, y, z), (s, 0, 0), r=0.0042, h=0.003, zone='brass')
    b.prism([rake(-0.048, -0.050, 0.2), rake(0.026, -0.058, 0.2), rake(0.026, -0.069, 0.2), rake(-0.050, -0.062, 0.2)],
            'YZ', -0.0235, 0.0235, 'iron', bv=0.002)
    b.torus(0.0085, 0.0017, 'X', (0, -0.058, -0.080), major=12, minor=5, zone='steel')
    # frame screws and cylinder pin
    for s in (-1, 1):
        b.bolt((s * 0.0176, 0.030, 0.108), (s, 0, 0), r=0.0048, h=0.003, zone='steel')
        b.bolt((s * 0.0176, -0.030, 0.070), (s, 0, 0), r=0.0048, h=0.003, zone='steel')
        b.rivets([(s * 0.0176, 0.044, 0.076)], (s, 0, 0), r=0.0045, h=0.0028, zone='brass')
    b.empty('muzzle', (0, 0.2425, AX))
    return P


def build_otboinik(b):
    P = {'paint': (0.28, 0.30, 0.34), 'wear': 0.7, 'paint2': (0.45, 0.14, 0.07), 'grip': (0.11, 0.08, 0.06),
         'wood_tex': 'wood_planks', 'steel_rust': 0.9}
    AX = 0.098
    # ---- riveted plate frame (3 stacked slabs) -------------------------------------------------------
    b.prism([(-0.070, 0.044), (-0.076, 0.084), (-0.064, 0.130), (0.080, 0.130), (0.092, 0.112), (0.092, 0.050),
             (0.060, 0.044)], 'YZ', -0.0185, 0.0185, 'paint', bv=0.0035, seg=2)
    for s in (-1, 1):
        b.prism([(-0.062, 0.050), (-0.066, 0.084), (-0.056, 0.122), (0.074, 0.122), (0.084, 0.108), (0.084, 0.056),
                 (0.056, 0.050)], 'YZ', s * 0.0185, s * 0.0222, 'iron', bv=0.002, seg=1)
        # rivet rows
        pts = line_pts((-0.050, s * 0.0222, 0.058), (0.070, s * 0.0222, 0.058), 8) + \
            line_pts((-0.050, s * 0.0222, 0.116), (0.070, s * 0.0222, 0.116), 8) + \
            [(-0.058, s * 0.0222, 0.087), (0.078, s * 0.0222, 0.086)]
        for p in pts:
            b.rivet((p[1], p[0], p[2]), (s, 0, 0), r=0.0048, h=0.0034, zone='steel')
    # ---- fat barrel with muzzle brake -----------------------------------------------------------------------
    b.cyl(0.0305, 0.150, 'Y', (0, 0.150, AX), ch=0.0035, segs=14, zone='steel')
    b.cyl(0.0345, 0.030, 'Y', (0, 0.092, AX), ch=0.004, segs=14, zone='iron')
    for yy in (0.130, 0.180):
        b.cyl(0.0325, 0.008, 'Y', (0, yy, AX), ch=0.002, segs=14, zone='paint')
    # muzzle brake: collar + baffles with ports
    b.cyl(0.0345, 0.018, 'Y', (0, 0.232, AX), ch=0.003, segs=14, zone='iron')
    for i in range(3):
        b.cyl(0.0325, 0.0055, 'Y', (0, 0.236 + i * 0.0105, AX), ch=0.0015, segs=14, zone='iron')
    b.cyl(0.0185, 0.0015, 'Y', (0, 0.272, AX), ch=0, segs=12, zone='dark')
    for s in (-1, 1):
        b.bx((s * 0.0345 - 0.002, s * 0.0345 + 0.002), (0.233, 0.262), (AX - 0.0125, AX + 0.0125), 'dark', bv=0)
    b.bx((-0.0125, 0.0125), (0.233, 0.262), (AX + 0.0345 - 0.002, AX + 0.0345 + 0.002), 'dark', bv=0)
    # front post and rear notch
    b.bx((-0.0025, 0.0025), (0.222, 0.232), (AX + 0.030, AX + 0.046), 'iron', bv=0.001)
    b.bx((-0.012, 0.012), (-0.070, -0.052), (0.130, 0.140), 'iron', bv=0.0018)
    b.bx((-0.0025, 0.0025), (-0.0705, -0.0525), (0.135, 0.1405), 'dark', bv=0)
    # ---- oversized hammer ---------------------------------------------------------------------------------
    hp = [(-0.052, 0.126), (-0.060, 0.148), (-0.082, 0.166), (-0.096, 0.156), (-0.082, 0.140), (-0.072, 0.118),
          (-0.066, 0.100), (-0.046, 0.108)]
    b.prism(hp, 'YZ', -0.0105, 0.0105, 'steel', bv=0.0025, seg=2)
    for i in range(6):
        z = 0.147 + i * 0.0035
        b.bx((-0.0112, 0.0112), (-0.098 + i * 0.0035 - 0.012, -0.090 + i * 0.0035 - 0.012), (z - 0.0016, z + 0.0016), 'dark', bv=0)
    b.cyl(0.010, 0.050, 'X', (0, -0.046, 0.108), ch=0.002, segs=10, zone='iron')
    # ---- trigger guard (square) + trigger ---------------------------------------------------------------------
    tg = [(0.070, 0.060), (0.074, 0.034), (0.030, 0.026), (-0.010, 0.032), (-0.020, 0.050)]
    path = [(0, y, z) for y, z in catmull(tg, 5)]
    b.sweep(path, rect_profile(0.0125, 0.0085), 'iron', up=lambda i, p, t: Vector((1, 0, 0)), bv=0.0012)
    b.prism([(0.026, 0.060), (0.038, 0.060), (0.028, 0.036), (0.021, 0.040)], 'YZ', -0.0042, 0.0042, 'steel', bv=0.001)
    # ---- very heavy grip: wooden slabs on an iron core, thick butt cap ------------------------------------
    b.prism([rake(-0.038, 0.060), rake(-0.040, 0.0), rake(-0.036, -0.058), rake(0.036, -0.058), rake(0.040, 0.0),
             rake(0.038, 0.050)], 'YZ', -0.0185, 0.0185, 'iron', bv=0.002)
    for s in (-1, 1):
        b.prism([rake(-0.036, 0.052), rake(-0.038, 0.0), rake(-0.034, -0.054), rake(0.034, -0.054), rake(0.038, 0.0),
                 rake(0.036, 0.046)], 'YZ', s * 0.0185, s * 0.0262, 'wood', bv=0.0032, seg=2)
        for yy, zz in ((-0.016, 0.030), (0.016, 0.030), (-0.016, -0.030), (0.016, -0.030)):
            y, z = rake(yy, zz)
            b.bolt((s * 0.0262, y, z), (s, 0, 0), r=0.0058, h=0.0034, zone='steel')
    b.prism([rake(-0.044, -0.054), rake(0.044, -0.054), rake(0.044, -0.076), rake(-0.044, -0.076)], 'YZ', -0.0295, 0.0295,
            'paint2', bv=0.003, seg=2)
    b.torus(0.011, 0.0022, 'X', (0, -0.062, -0.093), major=12, minor=5, zone='steel')
    b.empty('muzzle', (0, 0.2735, AX))
    return P


def build_strizh(b):
    P = {'paint': (0.30, 0.31, 0.26), 'wear': 0.6, 'grip': (0.09, 0.07, 0.06), 'wood_tex': 'wood_fine',
         'tape': (0.06, 0.06, 0.055)}
    AX = 0.084
    # ---- receiver tube (octagon) + rear cap -------------------------------------------------------------------
    b.cyl(0.0295, 0.150, 'Y', (0, 0.020, AX), ch=0.003, segs=10, zone='paint')
    b.cyl(0.0325, 0.012, 'Y', (0, -0.062, AX), ch=0.0025, segs=10, zone='iron')
    b.cyl(0.0155, 0.014, 'Y', (0, -0.073, AX), ch=0.003, segs=10, zone='steel')
    # flat top plate with ejection slot and cocking slot
    b.bx((-0.0175, 0.0175), (-0.055, 0.085), (AX + 0.0245, AX + 0.0315), 'paint', bv=0.0018)
    b.bx((-0.003, 0.003), (-0.030, 0.050), (AX + 0.0305, AX + 0.0325), 'dark', bv=0)
    # cocking knob on the right + bolt handle
    b.cyl(0.0040, 0.020, 'X', (0.037, -0.006, AX + 0.002), ch=0.001, segs=8, zone='iron')
    b.sphere(0.0092, (0.0495, -0.006, AX + 0.002), (1, 1, 1), 8, 5, 'iron')
    # ---- perforated barrel shroud --------------------------------------------------------------------------------
    tb = b.sub()
    tb.cyl(0.0265, 0.120, 'Y', (0, 0.155, AX), ch=0.002, segs=12, zone='steel')
    cb = b.sub()
    for j in range(5):
        for k in range(8):
            a = math.radians(k * 45 + (22.5 if j % 2 else 0))
            with cb.at_m(Matrix.Translation(Vector((0.0265 * math.cos(a), 0.108 + j * 0.0185, AX + 0.0265 * math.sin(a)))) @ align_z((math.cos(a), 0, math.sin(a)))):
                cb.cyl(0.0042, 0.014, 'Z', (0, 0, 0), ch=0, segs=6, zone='dark')
    b.cut(tb, cb, bv=0.0)
    b.cyl(0.0285, 0.010, 'Y', (0, 0.100, AX), ch=0.002, segs=12, zone='iron')
    b.cyl(0.0285, 0.010, 'Y', (0, 0.212, AX), ch=0.002, segs=12, zone='iron')
    b.cyl(0.0105, 0.020, 'Y', (0, 0.226, AX), ch=0.002, segs=10, zone='steel')
    b.cyl(0.0055, 0.0016, 'Y', (0, 0.2365, AX), ch=0, segs=8, zone='dark')
    b.bx((-0.0025, 0.0025), (0.190, 0.200), (AX + 0.026, AX + 0.040), 'iron', bv=0.001)   # front sight
    b.bx((-0.0150, -0.0125), (0.185, 0.205), (AX + 0.026, AX + 0.040), 'iron', bv=0.001)
    b.bx((0.0125, 0.0150), (0.185, 0.205), (AX + 0.026, AX + 0.040), 'iron', bv=0.001)
    # ---- top-loaded vertical box magazine -----------------------------------------------------------------------
    mg = [(-0.020, 0.0), (0.020, 0.0), (0.021, 0.135), (-0.021, 0.135)]
    b.prism([(y + 0.0, z + AX + 0.030) for y, z in mg], 'YZ', -0.0155, 0.0155, 'steel', bv=0.0025, seg=2,
            loc=(0, 0.032, 0))
    for i in range(5):
        z = AX + 0.045 + i * 0.022
        b.bx((-0.0162, 0.0162), (0.032 - 0.0215, 0.032 - 0.0195), (z, z + 0.011), 'steel', bv=0.0008)
        b.bx((-0.0162, 0.0162), (0.032 + 0.0195, 0.032 + 0.0215), (z, z + 0.011), 'steel', bv=0.0008)
    b.bx((-0.017, 0.017), (0.032 - 0.024, 0.032 + 0.024), (AX + 0.158, AX + 0.168), 'iron', bv=0.002)
    b.bx((-0.0105, 0.0105), (0.032 - 0.022, 0.032 + 0.022), (AX + 0.026, AX + 0.034), 'iron', bv=0.0015)
    b.bx((-0.004, 0.004), (0.032 + 0.015, 0.032 + 0.030), (AX + 0.150, AX + 0.158), 'iron', bv=0.001)
    # ---- pistol grip + guard ---------------------------------------------------------------------------------------
    b.prism([rake(-0.030, 0.052), rake(-0.034, 0.0), rake(-0.030, -0.060), rake(0.030, -0.060), rake(0.034, 0.0),
             rake(0.030, 0.052)], 'YZ', -0.0215, 0.0215, 'grip', bv=0.003, seg=2)
    b.prism([rake(-0.032, 0.060), rake(0.040, 0.060), rake(0.040, 0.050), rake(-0.032, 0.050)], 'YZ', -0.0235, 0.0235,
            'iron', bv=0.002)
    for i in range(4):
        y, z = rake(0.0335, -0.040 + i * 0.019)
        b.bx((-0.0218, 0.0218), (y - 0.001, y + 0.0030), (z - 0.003, z + 0.003), 'grip', bv=0.001)
    tg = [(0.034, 0.052), (0.042, 0.028), (0.064, 0.018), (0.090, 0.028), (0.092, 0.060)]
    path = [(0, y, z) for y, z in catmull(tg, 5)]
    b.sweep(path, rect_profile(0.007, 0.005), 'iron', up=lambda i, p, t: Vector((1, 0, 0)), bv=0.0008)
    b.prism([(0.046, 0.056), (0.056, 0.056), (0.050, 0.030), (0.044, 0.034)], 'YZ', -0.003, 0.003, 'steel', bv=0.0008)
    # front vertical stub grip under shroud
    b.cyl(0.0125, 0.045, 'Z', (0, 0.150, AX - 0.044), ch=0.002, segs=8, zone='grip')
    b.bx((-0.0055, 0.0055), (0.140, 0.160), (AX - 0.030, AX - 0.020), 'iron', bv=0.001)
    # ---- folded wire stock along the right side -------------------------------------------------------------------
    rr = 0.0036
    wire = [(0.0375, -0.078, AX - 0.012), (0.0415, -0.070, AX - 0.012), (0.0455, -0.040, AX - 0.012),
            (0.0455, 0.040, AX - 0.012), (0.0415, 0.056, AX - 0.012)]
    b.tube_path(wire, rr, 'iron', 6, 6)
    b.tube_path([(0.0455, -0.040, AX - 0.012), (0.0455, -0.040, AX - 0.044), (0.0455, 0.046, AX - 0.044),
                 (0.0455, 0.046, AX - 0.012)], rr, 'iron', 6, 4)
    b.tube_path([(0.0455, -0.040, AX - 0.044), (0.0455, -0.075, AX - 0.040), (0.0455, -0.076, AX - 0.022)], rr, 'iron', 6, 4)
    b.bx((0.0425, 0.0505), (-0.083, -0.071), (AX - 0.034, AX - 0.004), 'iron', bv=0.0015)
    b.bx((0.0305, 0.0425), (-0.078, -0.066), (AX - 0.022, AX - 0.012), 'steel', bv=0.001)
    # rivets
    for s in (-1, 1):
        for p in ((-0.040, AX + 0.002), (0.0, AX + 0.016), (0.060, AX - 0.004)):
            b.rivet((s * 0.0295 * 0.95, p[0], p[1]), (s, 0, 0), r=0.004, h=0.0026, zone='steel')
    b.empty('muzzle', (0, 0.2375, AX))
    return P
