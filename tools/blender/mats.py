"""Procedural + photo (Poly Haven CC0) material recipes used ONLY for baking.

Each geometry zone (see geo.ZONES) gets a colour material (emission bake) and a bump material (normal bake).
Photo textures are projected triplanar in object space, edge wear comes from the Bevel node, dirt from AO.
"""
import hashlib

import bpy

import phtex

# key -> (poly haven id, tile size in metres, grain axis: 'u' = grain runs along image u)
TEX = {
    'rust04': ('rusty_metal_04', 0.42, None),
    'rust05': ('rusty_metal_05', 0.50, None),
    'rustc': ('rust_coarse_01', 0.45, None),
    'rust02': ('rusty_metal_02', 0.40, None),
    'rust03': ('rusty_metal_03', 0.40, None),
    'sheet': ('rusty_metal_sheet', 0.50, None),
    'plate2': ('metal_plate_02', 0.45, None),
    'gmetal': ('green_metal_rust', 0.55, None),
    'wood_dark': ('dark_wood', 0.32, 'u'),
    'wood_fine': ('fine_grained_wood', 0.30, 'v'),
    'wood_planks': ('worn_planks', 0.40, 'v'),
    'wood_table': ('wood_table_worn', 0.35, None),
    'leather': ('fabric_leather_02', 0.22, None),
    'leather_br': ('brown_leather', 0.20, None),
    'hessian': ('hessian_230', 0.16, None),
    'cord': ('ribbed_corduroy', 0.10, None),
    'denim': ('denim_fabric_03', 0.12, None),
    'peel': ('wood_peeling_paint_weathered', 0.55, None),
}

_img_cache = {}
_tex_cache = {}


def tex_paths(key):
    if key not in _tex_cache:
        pid = TEX[key][0]
        _tex_cache[key] = phtex.texture(pid, maps=('Diffuse', 'Displacement', 'Rough', 'nor_gl'))
    return _tex_cache[key]


def load_img(path, srgb=True):
    k = (path, srgb)
    if k not in _img_cache:
        im = bpy.data.images.load(path, check_existing=False)
        im.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
        _img_cache[k] = im
    return _img_cache[k]


def srgb(c):
    return tuple([x ** 2.2 for x in c[:3]] + [1.0])


class G:
    """Tiny node-graph DSL."""

    def __init__(self, mat):
        mat.use_nodes = True
        self.mat = mat
        self.nt = mat.node_tree
        self.nt.nodes.clear()

    def node(self, typ, **props):
        n = self.nt.nodes.new(typ)
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def put(self, sock, val):
        if val is None:
            return
        if isinstance(val, bpy.types.NodeSocket):
            self.nt.links.new(val, sock)
        else:
            if sock.type == 'RGBA':
                sock.default_value = tuple(val) if hasattr(val, '__len__') else (val, val, val, 1.0)
                if len(sock.default_value) == 3:
                    sock.default_value = tuple(val) + (1.0,)
            elif sock.type == 'VECTOR':
                sock.default_value = tuple(val)[:3] if hasattr(val, '__len__') else (val, val, val)
            else:
                sock.default_value = val

    # --- helpers returning output sockets
    def math(self, op, a, b=None, c=None, clamp=False):
        n = self.node('ShaderNodeMath', operation=op, use_clamp=clamp)
        self.put(n.inputs[0], a)
        self.put(n.inputs[1], b)
        self.put(n.inputs[2], c)
        return n.outputs[0]

    def vmath(self, op, a, b=None, s=None, out=0):
        n = self.node('ShaderNodeVectorMath', operation=op)
        self.put(n.inputs[0], a)
        self.put(n.inputs[1], b)
        if s is not None:
            self.put(n.inputs[3], s)
        return n.outputs[out]

    def mix(self, fac, a, b, blend='MIX'):
        n = self.node('ShaderNodeMix', data_type='RGBA', blend_type=blend, clamp_factor=True, clamp_result=False)
        self.put(n.inputs[0], fac)
        self.put(n.inputs[6], a)
        self.put(n.inputs[7], b)
        return n.outputs[2]

    def mixf(self, fac, a, b):
        n = self.node('ShaderNodeMix', data_type='FLOAT', clamp_factor=True)
        self.put(n.inputs[0], fac)
        self.put(n.inputs[2], a)
        self.put(n.inputs[3], b)
        return n.outputs[0]

    def ramp(self, fac, stops, interp='LINEAR'):
        n = self.node('ShaderNodeValToRGB')
        n.color_ramp.interpolation = interp
        el = n.color_ramp.elements
        while len(el) < len(stops):
            el.new(1.0)
        for e, (pos, val) in zip(el, stops):
            e.position = pos
            e.color = tuple(val) if hasattr(val, '__len__') else (val, val, val, 1.0)
            if len(e.color) == 3:
                e.color = tuple(val) + (1.0,)
        self.put(n.inputs[0], fac)
        return n.outputs[0]

    def lum(self, col):
        n = self.node('ShaderNodeRGBToBW')
        self.put(n.inputs[0], col)
        return n.outputs[0]

    def hsv(self, col, h=0.5, s=1.0, v=1.0, fac=1.0):
        n = self.node('ShaderNodeHueSaturation')
        n.inputs[0].default_value = h
        n.inputs[1].default_value = s
        n.inputs[2].default_value = v
        n.inputs[3].default_value = fac
        self.put(n.inputs[4], col)
        return n.outputs[0]

    def sepc(self, col):
        n = self.node('ShaderNodeSeparateColor')
        self.put(n.inputs[0], col)
        return n.outputs[0], n.outputs[1], n.outputs[2]

    def sep(self, vec):
        n = self.node('ShaderNodeSeparateXYZ')
        self.put(n.inputs[0], vec)
        return n.outputs[0], n.outputs[1], n.outputs[2]

    def comb(self, x, y, z):
        n = self.node('ShaderNodeCombineXYZ')
        self.put(n.inputs[0], x)
        self.put(n.inputs[1], y)
        self.put(n.inputs[2], z)
        return n.outputs[0]


class Ctx:
    """Per-material shared inputs (object coords, triplanar weights, edge / AO masks)."""

    def __init__(self, g, zone, need_edge=True, need_ao=True, edge_r=0.0035, ao_dist=0.05):
        self.g = g
        self.zone = zone
        tc = g.node('ShaderNodeTexCoord')
        self.co = tc.outputs['Object']
        nx, ny, nz = g.sep(tc.outputs['Normal'])
        ax = g.math('POWER', g.math('ABSOLUTE', nx), 4.0)
        ay = g.math('POWER', g.math('ABSOLUTE', ny), 4.0)
        az = g.math('POWER', g.math('ABSOLUTE', nz), 4.0)
        self.f1 = g.math('DIVIDE', ay, g.math('ADD', ax, ay, 1e-6))
        self.f2 = g.math('DIVIDE', az, g.math('ADD', g.math('ADD', ax, ay), az, 1e-6))
        self.edge = None
        self.ao = None
        if need_edge:
            geo = g.node('ShaderNodeNewGeometry')
            bev = g.node('ShaderNodeBevel', samples=10)
            bev.inputs[0].default_value = edge_r
            d = g.vmath('DOT_PRODUCT', bev.outputs[0], geo.outputs['True Normal'], out=1)
            raw = g.math('SUBTRACT', 1.0, d)
            self.edge = g.ramp(raw, [(0.012, 0.0), (0.14, 1.0)])
        if need_ao:
            ao = g.node('ShaderNodeAmbientOcclusion', samples=24)
            ao.inputs[1].default_value = ao_dist
            self.ao = ao.outputs[1]
        self._seed = int(hashlib.md5(zone.encode()).hexdigest()[:6], 16) % 1000 / 10.0

    def _off(self, tag):
        h = int(hashlib.md5((self.zone + tag).encode()).hexdigest()[:6], 16)
        return ((h % 997) / 97.0, ((h // 997) % 991) / 97.0, ((h // 7919) % 983) / 97.0)

    def noise(self, scale, detail=5.0, rough=0.5, tag='n', dist=0.0):
        g = self.g
        n = g.node('ShaderNodeTexNoise', noise_dimensions='3D')
        off = self._off(tag)
        m = g.node('ShaderNodeMapping')
        g.put(m.inputs[0], self.co)
        m.inputs[1].default_value = off
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough
        n.inputs['Distortion'].default_value = dist
        g.put(n.inputs[0], m.outputs[0])
        return n.outputs[0]

    def tri(self, key, scale=1.0, srgb_=True, map_='Diffuse', grain=None, tag=None):
        """Triplanar photo lookup in object space. Returns colour socket."""
        g = self.g
        paths = tex_paths(key)
        im = load_img(paths[map_], srgb_)
        size = TEX[key][1] / scale
        grain = grain or TEX[key][2]
        m = g.node('ShaderNodeMapping')
        g.put(m.inputs[0], self.co)
        m.inputs[1].default_value = self._off(tag or key)
        m.inputs[3].default_value = (1.0 / size,) * 3
        x, y, z = g.sep(m.outputs[0])
        ax = {'x': x, 'y': y, 'z': z}
        if grain == 'u':      # grain along image u -> run it along object Y
            planes = ('yz', 'xz', 'yx')
        elif grain == 'v':    # grain along image v
            planes = ('zy', 'zx', 'xy')
        else:
            planes = ('yz', 'xz', 'xy')
        cols = []
        for pl in planes:
            vec = g.comb(ax[pl[0]], ax[pl[1]], 0.0)
            t = g.node('ShaderNodeTexImage', interpolation='Linear', extension='REPEAT')
            t.image = im
            g.put(t.inputs[0], vec)
            cols.append(t.outputs[0])
        m1 = g.mix(self.f1, cols[0], cols[1])
        return g.mix(self.f2, m1, cols[2])

    def streak(self, scale=18.0, stretch=7.0, detail=3.0, tag='sk'):
        """Noise stretched along object Z -> vertical drip streaks."""
        g = self.g
        m = g.node('ShaderNodeMapping')
        g.put(m.inputs[0], self.co)
        m.inputs[1].default_value = self._off(tag)
        m.inputs[3].default_value = (scale, scale, scale / stretch)
        n = g.node('ShaderNodeTexNoise', noise_dimensions='3D')
        n.inputs['Scale'].default_value = 1.0
        n.inputs['Detail'].default_value = detail
        g.put(n.inputs[0], m.outputs[0])
        return n.outputs[0]

    def dirt(self, col, amount=0.7, tint=(0.07, 0.05, 0.035), mot=0.45, streaks=0.35):
        g = self.g
        if self.ao is not None:
            k = g.ramp(self.ao, [(0.0, 0.0), (0.35, 0.25), (0.8, 0.9), (1.0, 1.0)])
            col = g.mix(1.0, col, g.ramp(k, [(0, (0.28, 0.27, 0.27, 1)), (1, (1, 1, 1, 1))]), 'MULTIPLY')
            col = g.mix(g.math('MULTIPLY', g.math('SUBTRACT', 1.0, k), amount * 0.6), col, srgb(tint))
        if mot > 0:
            mt = g.ramp(self.noise(2.6, 6.0, 0.6, tag='mot'), [(0.25, 1.0 - mot), (0.6, 1.0), (0.85, 1.0 + mot * 0.12)])
            col = g.mix(1.0, col, mt, 'MULTIPLY')
        if streaks > 0:
            st = g.ramp(self.streak(tag='dst'), [(0.35, 0.0), (0.7, streaks)])
            col = g.mix(st, col, srgb((0.045, 0.035, 0.028)))
        return col


def vec(c):
    return srgb(c)


# --------------------------------------------------------------------------------------------
# colour recipes
# --------------------------------------------------------------------------------------------

def r_paint(g, c, P, key='paint', wear=None):
    wear = P.get('wear', 0.5) if wear is None else wear
    paint = srgb(P[key])
    t1 = c.tri('rust04', tag='p_u1')
    t2 = c.tri('rustc', tag='p_u2')
    under = g.mix(g.ramp(c.noise(5.0, 3.0, tag='pn1'), [(0.35, 0.0), (0.65, 1.0)]), t1, t2)
    under = g.hsv(under, 0.5, 0.75, 0.62)
    var = g.lum(c.tri('plate2', tag='p_v'))
    pcol = g.mix(1.0, paint, g.ramp(var, [(0.0, 0.5), (0.35, 0.85), (0.7, 1.1), (1.0, 1.35)]), 'MULTIPLY')
    # paint-free areas follow a photographed peeling pattern + edges + low-frequency noise
    pk = c.tri('peel', tag='p_peel')
    pr, _, pb = g.sepc(pk)
    peel = g.ramp(g.math('SUBTRACT', pr, pb), [(0.0, 0.0), (0.1, 1.0)])
    n1 = c.noise(14.0, 6.0, 0.6, tag='chip1')
    n2 = c.noise(70.0, 3.0, 0.5, tag='chip2')
    m = g.math('MULTIPLY', peel, 0.45 + wear * 0.35)
    m = g.math('ADD', m, g.math('MULTIPLY', n1, 0.30))
    m = g.math('ADD', m, g.math('MULTIPLY', c.edge, 0.35 + wear * 0.35))
    m = g.math('ADD', m, g.math('MULTIPLY', n2, 0.08))
    m = g.math('ADD', m, wear * 0.18 - 0.24)
    chip = g.ramp(m, [(0.40, 0.0), (0.46, 1.0)])
    col = g.mix(chip, pcol, under)
    steel = g.mix(1.0, srgb((0.36, 0.34, 0.31)), g.ramp(c.noise(120.0, 2.0, tag='st'), [(0, 0.6), (1, 1.3)]), 'MULTIPLY')
    col = g.mix(g.math('MULTIPLY', g.math('MULTIPLY', c.edge, chip), 0.65), col, steel)
    col = g.mix(1.0, col, g.ramp(c.noise(45.0, 4.0, tag='gr'), [(0, 0.78), (1, 1.12)]), 'MULTIPLY')
    return c.dirt(col, 0.9)


def r_iron(g, c, P):
    a = c.tri('rustc', tag='i_a')
    b = c.tri('rust05', tag='i_b')
    col = g.mix(g.ramp(c.noise(7.0, 4.0, tag='in'), [(0.3, 0.0), (0.7, 1.0)]), a, b)
    col = g.hsv(col, 0.5, 0.8, 0.6)
    steel = srgb((0.33, 0.31, 0.29))
    col = g.mix(g.math('MULTIPLY', c.edge, 0.45), col, steel)
    return c.dirt(col, 0.8)


def r_steel(g, c, P):
    base = c.tri('plate2', tag='s_a')
    base = g.mix(1.0, base, srgb((0.55, 0.55, 0.6)), 'MULTIPLY')
    rust = c.tri('rust04', tag='s_r')
    rm = g.ramp(g.math('ADD', c.noise(9.0, 5.0, tag='sn'), g.math('MULTIPLY', c.edge, -0.1)),
                [(0.52, 0.0), (0.68, P.get('steel_rust', 0.7))])
    col = g.mix(rm, base, rust)
    bright = g.mix(1.0, srgb((0.55, 0.54, 0.52)), g.ramp(c.noise(110.0, 2.0, tag='sx'), [(0, 0.7), (1, 1.25)]), 'MULTIPLY')
    col = g.mix(g.math('MULTIPLY', c.edge, 0.75), col, bright)
    return c.dirt(col, 0.7)


def r_brass(g, c, P):
    base = srgb((0.50, 0.36, 0.13))
    dark = srgb((0.16, 0.13, 0.05))
    n = g.ramp(c.noise(25.0, 5.0, tag='br'), [(0.3, 0.0), (0.7, 1.0)])
    col = g.mix(n, base, dark)
    col = g.mix(g.math('MULTIPLY', c.edge, 0.7), col, srgb((0.78, 0.62, 0.28)))
    return c.dirt(col, 0.7)


def r_wood(g, c, P, key='wood_tex'):
    tk = P.get(key, 'wood_fine')
    tint = srgb(P.get(key + '_tint', (1.0, 0.95, 0.9)))
    col = c.tri(tk, tag='w')
    col = g.mix(1.0, col, tint, 'MULTIPLY')
    # worn pale edges, oil/dirt stains
    col = g.mix(g.math('MULTIPLY', c.edge, 0.35), col, srgb((0.36, 0.27, 0.18)))
    stain = g.ramp(c.noise(8.0, 4.0, tag='ws'), [(0.4, 0.0), (0.75, 0.55)])
    col = g.mix(stain, col, srgb((0.05, 0.035, 0.025)))
    return c.dirt(col, 0.8)


def r_grip(g, c, P):
    tint = P.get('grip', (0.10, 0.065, 0.045))
    col = srgb(tint)
    n = g.ramp(c.noise(60.0, 5.0, tag='gp'), [(0.2, 0.55), (0.8, 1.4)])
    col = g.mix(1.0, col, n, 'MULTIPLY')
    sp = g.ramp(c.noise(200.0, 1.0, 0.5, tag='gps'), [(0.7, 0.0), (0.85, 1.0)])
    col = g.mix(g.math('MULTIPLY', sp, 0.35), col, srgb((0.30, 0.22, 0.16)))
    col = g.mix(g.math('MULTIPLY', c.edge, 0.55), col, srgb((0.30, 0.22, 0.15)))
    return c.dirt(col, 0.5)


def r_rubber(g, c, P):
    col = srgb((0.045, 0.045, 0.045))
    n = g.ramp(c.noise(50.0, 4.0, tag='rb'), [(0.2, 0.7), (0.8, 1.5)])
    col = g.mix(1.0, col, n, 'MULTIPLY')
    col = g.mix(g.math('MULTIPLY', c.edge, 0.4), col, srgb((0.17, 0.16, 0.15)))
    return c.dirt(col, 0.4)


def r_leather(g, c, P):
    tint = srgb(P.get('leather', (0.85, 0.7, 0.5)))
    col = c.tri(P.get('leather_tex', 'leather'), tag='lt')
    col = g.mix(1.0, col, tint, 'MULTIPLY')
    col = g.mix(g.math('MULTIPLY', c.edge, 0.4), col, srgb((0.55, 0.42, 0.27)))
    stain = g.ramp(c.noise(10.0, 4.0, tag='ls'), [(0.4, 0.0), (0.8, 0.5)])
    col = g.mix(stain, col, srgb((0.08, 0.055, 0.035)))
    return c.dirt(col, 0.7)


def r_cloth(g, c, P):
    tint = srgb(P.get('cloth', (0.65, 0.55, 0.4)))
    col = c.tri(P.get('cloth_tex', 'hessian'), tag='cl')
    col = g.mix(1.0, g.hsv(col, 0.5, 0.35, 1.2), tint, 'MULTIPLY')
    stain = g.ramp(c.noise(9.0, 4.0, tag='cs'), [(0.35, 0.0), (0.8, 0.6)])
    col = g.mix(stain, col, srgb((0.07, 0.055, 0.04)))
    return c.dirt(col, 0.8)


def r_tape(g, c, P):
    tint = srgb(P.get('tape', (0.07, 0.07, 0.065)))
    col = c.tri('cord', tag='tp')
    col = g.mix(1.0, g.hsv(col, 0.5, 0.0, 1.0), tint, 'MULTIPLY')
    col = g.mix(1.0, col, g.ramp(c.noise(30.0, 4.0, tag='tpn'), [(0.2, 0.7), (0.8, 1.5)]), 'MULTIPLY')
    col = g.mix(g.math('MULTIPLY', c.edge, 0.5), col, srgb((0.22, 0.2, 0.17)))
    return c.dirt(col, 0.6)


def r_red(g, c, P):
    col = srgb(P.get('red', (0.55, 0.045, 0.03)))
    n = g.ramp(c.noise(40.0, 5.0, tag='rd'), [(0.2, 0.7), (0.8, 1.25)])
    col = g.mix(1.0, col, n, 'MULTIPLY')
    col = g.mix(g.math('MULTIPLY', c.edge, 0.5), col, srgb((0.65, 0.3, 0.22)))
    return c.dirt(col, 0.5)


def r_glass(g, c, P):
    col = srgb((0.025, 0.04, 0.07))
    n = g.ramp(c.noise(30.0, 3.0, tag='gl'), [(0.3, 0.8), (0.7, 2.0)])
    col = g.mix(1.0, col, n, 'MULTIPLY')
    col = g.mix(g.math('MULTIPLY', c.edge, 0.7), col, srgb((0.18, 0.2, 0.22)))
    return col


def r_dark(g, c, P):
    return g.mix(1.0, srgb((0.03, 0.028, 0.026)), g.ramp(c.noise(40.0, 3.0, tag='dk'), [(0, 0.7), (1, 1.5)]), 'MULTIPLY')


def r_jacket(g, c, P):
    """Quilted olive-drab padded cotton. Uses the 'pat' UV layer: u along the arm (m), v around (m)."""
    uvn = g.node('ShaderNodeUVMap', uv_map='pat')
    ux, uy, _ = g.sep(uvn.outputs[0])
    cell = P.get('quilt', 0.05)
    # diamond cells: |fract(u/c + v/c) - .5| & |fract(u/c - v/c) - .5|
    a = g.math('FRACT', g.math('ADD', g.math('DIVIDE', ux, cell), g.math('DIVIDE', uy, cell)))
    b = g.math('FRACT', g.math('SUBTRACT', g.math('DIVIDE', ux, cell), g.math('DIVIDE', uy, cell)))
    da = g.math('ABSOLUTE', g.math('SUBTRACT', a, 0.5))
    db = g.math('ABSOLUTE', g.math('SUBTRACT', b, 0.5))
    dm = g.math('MINIMUM', da, db)           # 0 at stitch lines, up to .5 in cell centres
    seam = g.ramp(dm, [(0.02, 1.0), (0.07, 0.0)])
    puff = g.ramp(dm, [(0.0, 0.62), (0.3, 1.0)])
    base = c.tri('cord', tag='jk')
    tint = srgb(P.get('jacket', (0.30, 0.31, 0.17)))
    col = g.mix(1.0, g.hsv(base, 0.5, 0.45, 1.1), tint, 'MULTIPLY')
    col = g.mix(1.0, col, puff, 'MULTIPLY')
    col = g.mix(g.math('MULTIPLY', seam, 0.8), col, srgb((0.07, 0.07, 0.04)))
    stain = g.ramp(c.noise(7.0, 5.0, tag='jst'), [(0.4, 0.0), (0.8, 0.7)])
    col = g.mix(stain, col, srgb((0.06, 0.05, 0.03)))
    col = g.mix(g.math('MULTIPLY', c.edge, 0.3), col, srgb((0.38, 0.38, 0.26)))
    return c.dirt(col, 0.7)


def r_cuff(g, c, P):
    tint = srgb(P.get('cuff', (0.16, 0.15, 0.1)))
    base = c.tri('cord', tag='cf')
    col = g.mix(1.0, g.hsv(base, 0.5, 0.3, 1.0), tint, 'MULTIPLY')
    rib = g.node('ShaderNodeUVMap', uv_map='pat')
    _, vy, _ = g.sep(rib.outputs[0])
    ribs = g.ramp(g.math('PINGPONG', g.math('MULTIPLY', vy, 160.0), 1.0), [(0, 0.55), (1, 1.15)])
    col = g.mix(1.0, col, ribs, 'MULTIPLY')
    return c.dirt(col, 0.9)


COLOR = {
    'paint': r_paint,
    'paint2': lambda g, c, P: r_paint(g, c, P, key='paint2'),
    'iron': r_iron, 'steel': r_steel, 'brass': r_brass,
    'wood': r_wood, 'wood2': lambda g, c, P: r_wood(g, c, P, key='wood2_tex'),
    'grip': r_grip, 'leather': r_leather, 'cloth': r_cloth, 'tape': r_tape, 'red': r_red,
    'glass': r_glass, 'dark': r_dark, 'jacket': r_jacket, 'cuff': r_cuff, 'rubber': r_rubber,
}
NEEDS_EDGE = {'dark': False}
NEEDS_AO = {'dark': False, 'glass': False}


# --------------------------------------------------------------------------------------------
# bump (normal bake) recipes -> normal socket
# --------------------------------------------------------------------------------------------

def height_tex(c, key, map_='Displacement', tag='h'):
    paths = tex_paths(key)
    if map_ not in paths:
        map_ = 'Diffuse'
    g = c.g
    col = c.tri(key, srgb_=(map_ == 'Diffuse'), map_=map_, tag=tag)
    return g.lum(col)


def bump_zone(zone, P):
    """returns (height socket builder) config: (tex key, strength, distance) or special."""
    return {
        'paint': ('rust04', 1.0, 0.004), 'paint2': ('rust04', 1.0, 0.004),
        'iron': ('rustc', 1.4, 0.004), 'steel': ('plate2', 0.9, 0.003), 'brass': ('rustc', 0.15, 0.002),
        'wood': (P.get('wood_tex', 'wood_fine'), 0.35, 0.003), 'wood2': (P.get('wood2_tex', 'wood_fine'), 0.35, 0.003),
        'grip': ('rustc', 0.2, 0.002), 'leather': ('leather', 0.6, 0.003), 'cloth': ('hessian', 0.9, 0.003),
        'tape': ('cord', 0.5, 0.0015), 'red': ('rustc', 0.12, 0.002), 'glass': None, 'dark': None,
        'jacket': ('cord', 0.6, 0.002), 'cuff': ('cord', 0.5, 0.002), 'rubber': ('rustc', 0.1, 0.002),
    }[zone]


def make_materials(P, zones, image, mode):
    """mode 'color' | 'normal'. Returns {zone: material}. image = bake target."""
    out = {}
    for z in zones:
        mat = bpy.data.materials.new(f'bake_{mode}_{z}')
        g = G(mat)
        if mode == 'color':
            c = Ctx(g, z, NEEDS_EDGE.get(z, True), NEEDS_AO.get(z, True))
            col = COLOR[z](g, c, P)
            em = g.node('ShaderNodeEmission')
            g.put(em.inputs[0], col)
            surf = em.outputs[0]
        else:
            cfg = bump_zone(z, P)
            bsdf = g.node('ShaderNodeBsdfPrincipled')
            if cfg is not None:
                c = Ctx(g, z, False, False)
                h = height_tex(c, cfg[0], tag='bh')
                if z in ('jacket', 'cuff'):
                    uvn = g.node('ShaderNodeUVMap', uv_map='pat')
                    ux, uy, _ = g.sep(uvn.outputs[0])
                    cell = P.get('quilt', 0.05)
                    if z == 'jacket':
                        a = g.math('FRACT', g.math('ADD', g.math('DIVIDE', ux, cell), g.math('DIVIDE', uy, cell)))
                        b = g.math('FRACT', g.math('SUBTRACT', g.math('DIVIDE', ux, cell), g.math('DIVIDE', uy, cell)))
                        dm = g.math('MINIMUM', g.math('ABSOLUTE', g.math('SUBTRACT', a, 0.5)),
                                    g.math('ABSOLUTE', g.math('SUBTRACT', b, 0.5)))
                        puff = g.ramp(dm, [(0.0, 0.0), (0.06, 0.55), (0.3, 1.0)], 'EASE')
                        h = g.math('ADD', g.math('MULTIPLY', puff, 3.0), g.math('MULTIPLY', h, 0.3))
                    else:
                        h = g.math('ADD', g.math('MULTIPLY', g.math('PINGPONG', g.math('MULTIPLY', uy, 160.0), 1.0), 1.5),
                                   g.math('MULTIPLY', h, 0.3))
                bump = g.node('ShaderNodeBump')
                bump.inputs[0].default_value = cfg[1] * (1.5 if z == 'jacket' else 1.0)
                bump.inputs[1].default_value = cfg[2] * (3.0 if z == 'jacket' else 1.0)
                g.put(bump.inputs[3], h)
                g.put(bsdf.inputs['Normal'], bump.outputs[0])
            surf = bsdf.outputs[0]
        outn = g.node('ShaderNodeOutputMaterial')
        g.nt.links.new(surf, outn.inputs[0])
        tn = g.node('ShaderNodeTexImage')
        tn.image = image
        g.nt.nodes.active = tn
        out[z] = mat
    return out
