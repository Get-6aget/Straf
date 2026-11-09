"""Procedural painting of the 1024x1024 base-colour atlas + jacket mask (numpy only).

Every part is a (u around, v along) rectangle, so painting is plain 2-D work.  Colours are written in
sRGB-encoded space; photographic detail (Poly Haven CC0) only modulates luminance so the palette stays ours.
"""
import math
import numpy as np
import char_tex as tex
from char_common import *
import char_geo as geo

AO_STRENGTH = 0.80
TAU = math.pi * 2


def C(r, g, b):
    return np.array([r, g, b], np.float32) / 255.0


# ---- palette (sRGB) ----
SKIN = C(226, 168, 132)
SKIN_SH = C(196, 128, 100)
HAIR = C(60, 38, 26)
HAIR_GREY = C(128, 112, 98)
JACKET = C(214, 146, 44)
JACKET_DK = C(150, 96, 26)
TRIM = C(48, 52, 62)
DENIM = C(52, 64, 88)
KNEEPATCH = C(44, 42, 44)
BOOT = C(54, 92, 58)
SOLE = C(34, 32, 30)
SOLE_LT = C(206, 190, 150)
LEATHER = C(190, 134, 80)
LEATHER_DK = C(118, 76, 44)
CORD = C(104, 70, 44)


class Ctx:
    def __init__(self, info, seed):
        self.info = info
        self.m = info['margin']
        self.W = info['w']
        self.H = info['h']
        self.Hn = self.H + 2 * self.m
        self.rng = np.random.RandomState(seed)
        xs = np.arange(self.W, dtype=np.float32)
        ys = np.arange(-self.m, self.H + self.m, dtype=np.float32)
        self.X, self.Y = np.meshgrid(xs, ys)
        self.U = self.X / self.W
        self.V = self.Y / self.H
        self.vv = info['vv']
        self.rings = info['rings']

    def ring_vals(self, key):
        return np.array([key(r) for r in self.rings], np.float32)

    def along(self, vals):
        """interpolate a per-ring quantity over the rows -> (Hn, W)"""
        return np.interp(self.V, self.vv, vals).astype(np.float32)

    def ring_row(self, i):
        return float(self.vv[i] * self.H)

    def noise(self, cell_x, cell_y=None, seed=0, octaves=1, gain=0.5):
        cell_y = cell_y or cell_x
        out = np.zeros_like(self.X)
        amp = 1.0
        tot = 0.0
        for o in range(octaves):
            out += amp * self._vn(cell_x / (2 ** o), cell_y / (2 ** o), seed + 17 * o)
            tot += amp
            amp *= gain
        return out / tot

    def _vn(self, cx, cy, seed):
        rng = np.random.RandomState(seed * 7919 + self.info['pid'] * 131 + 5)
        gw = max(1, int(round(self.W / max(cx, 0.5))))
        cxx = self.W / gw
        gh = int(math.ceil(self.Hn / max(cy, 0.5))) + 3
        g = rng.rand(gh + 1, gw).astype(np.float32)
        fx = self.X / cxx
        fy = (self.Y + self.m) / max(cy, 0.5)
        ix = np.floor(fx).astype(np.int32)
        iy = np.floor(fy).astype(np.int32)
        tx = fx - ix
        ty = fy - iy
        tx = tx * tx * (3 - 2 * tx)
        ty = ty * ty * (3 - 2 * ty)
        ix0 = ix % gw
        ix1 = (ix + 1) % gw
        a = g[iy, ix0] * (1 - tx) + g[iy, ix1] * tx
        b = g[iy + 1, ix0] * (1 - tx) + g[iy + 1, ix1] * tx
        return a * (1 - ty) + b * ty

    def wrap(self, a):
        m = self.m
        if m == 0:
            return a
        return np.concatenate([a[:, -m:], a, a[:, :m]], axis=1)

    def detail(self, key, down=2, strength=1.0, rgb=False, off=(0, 0)):
        """tile a Poly Haven photo over the rect; returns luminance multiplier (or RGB)"""
        ph = tex.photo(key)
        if down > 1:
            h = (ph.shape[0] // down) * down
            w = (ph.shape[1] // down) * down
            ph = ph[:h, :w].reshape(h // down, down, w // down, down, 3).mean((1, 3))
        lum = ph.mean(2)
        mean = float(lum.mean())
        th, tw = lum.shape
        ys = (np.arange(self.Hn) + off[1]) % th
        xs = (np.arange(self.W) + off[0]) % tw
        if rgb:
            return ph[np.ix_(ys, xs)]
        d = lum[np.ix_(ys, xs)] / mean
        return 1 + (d - 1) * strength


def mix(dst, col, a):
    a = np.clip(a, 0, 1)[..., None]
    return dst * (1 - a) + np.asarray(col, np.float32) * a


def cover(dist, half, soft=1.0):
    return np.clip((half + 0.5 * soft - np.abs(dist)) / soft, 0, 1)


def ell(X, Z, cx, cz, a, b, soft=0.0012):
    d = (np.sqrt(((X - cx) / a) ** 2 + ((Z - cz) / b) ** 2) - 1.0) * min(a, b)
    return np.clip(0.5 - d / soft, 0, 1)


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def rrect(X, Y, x0, y0, x1, y1, r, soft=1.0):
    """coverage of a rounded rectangle in pixel coords"""
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    hx, hy = (x1 - x0) / 2 - r, (y1 - y0) / 2 - r
    qx = np.abs(X - cx) - hx
    qy = np.abs(Y - cy) - hy
    d = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - r
    return np.clip(0.5 - d / soft, 0, 1)


def rrect_edge(X, Y, x0, y0, x1, y1, r, w=1.0, inset=0.0, soft=1.0):
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    hx, hy = (x1 - x0) / 2 - r - inset, (y1 - y0) / 2 - r - inset
    qx = np.abs(X - cx) - hx
    qy = np.abs(Y - cy) - hy
    d = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - r
    return np.clip((w / 2 + 0.5 * soft - np.abs(d)) / soft, 0, 1)


def stitched(cov, X, Y, step=5.0, duty=0.55, axis='x'):
    t = (X if axis == 'x' else Y)
    return cov * (((t % step) / step) < duty)


# ================================================================== parts
def fabric(ctx, col, det_key, det_s=0.6, down=3, wear=0.12, grime=0.0, seed=1):
    rgb = np.ones((ctx.Hn, ctx.W, 3), np.float32) * col
    rgb *= ctx.detail(det_key, down=down, strength=det_s)[..., None]
    n = ctx.noise(24, 24, seed, 3)
    rgb *= (1 + (n - 0.5) * wear * 2)[..., None]
    return rgb


def paint_torso(ctx):
    info = ctx.info
    W, H = ctx.W, ctx.H
    rz = ctx.ring_vals(lambda r: r['c'].z)
    rgb = fabric(ctx, JACKET, 'terlenka', 0.55, down=2, wear=0.10, seed=3)
    Zrow = np.interp(ctx.V, ctx.vv[1:], rz[1:]).astype(np.float32)
    # quilting
    pinch_rows = [ctx.ring_row(i) for i, r in enumerate(ctx.rings) if not r.get('pole') and
                  any(abs(r['c'].z - (geo.Q0 + geo.QP * j)) < 1e-6 for j in range(6))]
    pinch_rows.sort()
    y = ctx.Y
    shade = np.ones_like(y)
    for a, b in zip(pinch_rows[:-1], pinch_rows[1:]):
        inb = (y >= a) & (y < b)
        ph = np.clip((y - a) / (b - a), 0, 1)
        s = 0.70 + 0.34 * np.sin(math.pi * ph) ** 0.75
        shade = np.where(inb, s, shade)
    rgb *= shade[..., None]
    # puffy highlight band, slightly lighter on the top half of every baffle
    for a, b in zip(pinch_rows[:-1], pinch_rows[1:]):
        inb = (y >= a) & (y < b)
        ph = np.clip((y - a) / (b - a), 0, 1)
        rgb += (0.05 * np.exp(-((ph - 0.62) / 0.22) ** 2) * inb)[..., None] * JACKET
    for pr in pinch_rows:
        d = y - pr
        line = cover(d, 0.9, 1.0)
        rgb = mix(rgb, JACKET_DK * 0.55, line * 0.85)
        rgb = mix(rgb, JACKET * 1.05, cover(d - 2.3, 0.5, 1.0) * 0.30)
        thread = stitched(cover(d + 2.6, 0.55, 1.0), ctx.X, y, 4.5, 0.55)
        rgb = mix(rgb, C(240, 210, 130), thread * 0.35)
    # side seams
    for u in (0.25, 0.75):
        d = (ctx.X - u * W)
        rgb = mix(rgb, JACKET_DK * 0.6, cover(d, 0.9) * 0.8)
    # rib-knit hem band
    hem_top = pinch_rows[0]
    hem = (y < hem_top - 0.5)
    rib = 0.72 + 0.28 * np.cos(ctx.X * TAU / 4.4)
    rgb = np.where(hem[..., None], (TRIM * rib[..., None]) * ctx.detail('knit', 2, 0.7)[..., None] * 1.15, rgb)
    rgb = mix(rgb, C(20, 20, 24), cover(y - hem_top, 1.2) * 0.8)
    # front zip with storm flap
    xc = 0.5 * W
    top = ctx.ring_row(len(ctx.rings) - 2)
    flap = cover(ctx.X - xc - 7.5, 0.7) + cover(ctx.X - xc + 7.5, 0.7)
    rgb = mix(rgb, JACKET_DK * 0.6, np.clip(flap, 0, 1) * 0.7 * (y > hem_top))
    zipc = cover(ctx.X - xc, 3.0, 1.0) * (y > hem_top - 3)
    rgb = mix(rgb, C(34, 34, 38), zipc)
    teeth = cover(ctx.X - xc, 1.1) * (((y % 3.0) < 1.5)) * (y > hem_top - 3)
    rgb = mix(rgb, C(176, 178, 184), teeth * 0.95)
    # zip pull
    pull = rrect(ctx.X, y, xc - 2.2, top - 22, xc + 2.2, top - 7, 1.5)
    rgb = mix(rgb, C(190, 190, 196), pull)
    # pockets: hand pockets (welt + zip) and chest pocket
    z_to_y = lambda z: float(np.interp(z, rz[2:], ctx.vv[2:]) * H)
    for sgn in (-1, 1):
        ucen = 0.5 + sgn * 0.155
        x0, x1 = (ucen - 0.065) * W, (ucen + 0.065) * W
        y0, y1 = z_to_y(0.87), z_to_y(1.05)
        # slanted opening
        for_welt = cover((ctx.X - (ucen * W - sgn * 3.0)) * 0.9 + (y - (y0 + y1) / 2) * 0.35 * sgn * 0 + 0.0, 0.0001)
        pr = rrect_edge(ctx.X, y, x0, y0, x1, y1, 4.0, 1.1)
        rgb = mix(rgb, JACKET_DK * 0.55, pr * 0.8)
        slit = cover(y - (y1 - 5 - (ctx.X - x0) * (0.0)), 1.0) * ((ctx.X > x0 + 2) & (ctx.X < x1 - 2))
        rgb = mix(rgb, C(38, 30, 22), slit * 0.9)
        rgb = mix(rgb, C(176, 178, 184), cover(y - (y1 - 5), 0.5) * ((ctx.X > x0 + 3) & (ctx.X < x1 - 3)) * 0.8)
        rgb = mix(rgb, C(240, 210, 130), stitched(rrect_edge(ctx.X, y, x0, y0, x1, y1, 4.0, 0.9, inset=2.0), ctx.X, y, 4.0, 0.5) * 0.45)
    # chest patch + chest zip pocket on the wearer's left
    ux = 0.5 + 0.13
    x0, x1 = (ux - 0.055) * W, (ux + 0.055) * W
    y0, y1 = z_to_y(1.185), z_to_y(1.235)
    patch = rrect(ctx.X, y, x0, y0, x1, y1, 2.0)
    rgb = mix(rgb, C(232, 224, 204), patch)
    rgb = mix(rgb, C(190, 52, 40), patch * cover(y - (y0 + y1) / 2, 1.8) * ((ctx.X > x0 + 3) & (ctx.X < x1 - 3)))
    rgb = mix(rgb, C(70, 52, 40), rrect_edge(ctx.X, y, x0, y0, x1, y1, 2.0, 0.9) * 0.8)
    # yoke seam near the shoulders
    yy = ctx.ring_row(len(ctx.rings) - 4)
    rgb = mix(rgb, JACKET_DK * 0.55, cover(y - yy, 0.9) * 0.8)
    # grime: darker toward the hem, muddy smears
    g = ctx.noise(30, 18, 11, 3)
    dirt = np.clip((hem_top + 70 - y) / 90, 0, 1) * (0.25 + 0.55 * g)
    rgb = mix(rgb, C(86, 62, 38), dirt * 0.35)
    rgb = mix(rgb, C(70, 50, 30), np.clip((ctx.noise(5, 5, 12, 2) - 0.78) * 4, 0, 1) * 0.25 * np.clip(1.4 - y / H, 0, 1))
    mask = (y > hem_top + 1).astype(np.float32)
    return rgb, mask


def paint_collar(ctx):
    W = ctx.W
    rgb = np.ones((ctx.Hn, W, 3), np.float32) * CORD
    wales = 0.78 + 0.22 * np.cos(ctx.X * TAU / 3.6)
    rgb *= wales[..., None]
    rgb *= ctx.detail('knit', 2, 0.5)[..., None]
    rgb *= (1 + (ctx.noise(16, 16, 4, 2) - 0.5) * 0.25)[..., None]
    xc = 0.5 * W
    rgb = mix(rgb, C(34, 34, 38), cover(ctx.X - xc, 2.8) * 0.9)
    rgb = mix(rgb, C(176, 178, 184), cover(ctx.X - xc, 1.0) * (((ctx.Y % 3.0) < 1.5)) * 0.9)
    # rolled top edge stitching
    top = ctx.ring_row(len(ctx.rings) - 3)
    rgb = mix(rgb, C(30, 20, 14), cover(ctx.Y - top, 1.0) * 0.7)
    rgb = mix(rgb, C(220, 190, 130), stitched(cover(ctx.Y - top + 4.0, 0.6), ctx.X, ctx.Y, 4.5, 0.55) * 0.5)
    return rgb, np.zeros((ctx.Hn, W), np.float32)


def paint_sleeve(ctx):
    info = ctx.info
    W, H = ctx.W, ctx.H
    rgb = fabric(ctx, JACKET, 'terlenka', 0.55, down=2, wear=0.10, seed=5)
    ss = [0.0, 0.0, 0.0] + list(info['s']) + [info['s'][-1] + 0.01]
    s0 = 0.07
    rows = []
    for i, r in enumerate(ctx.rings):
        pass
    # pinch rings are those whose s is s0 + k*pitch ; recover pitch from the stored list
    pinch_rows = [ctx.ring_row(i) for i in info['pinch_rings']]
    y = ctx.Y
    shade = np.ones_like(y)
    for a, b in zip(pinch_rows[:-1], pinch_rows[1:]):
        inb = (y >= a) & (y < b)
        ph = np.clip((y - a) / (b - a), 0, 1)
        shade = np.where(inb, 0.70 + 0.34 * np.sin(math.pi * ph) ** 0.75, shade)
        rgb += (0.05 * np.exp(-((ph - 0.62) / 0.22) ** 2) * inb)[..., None] * JACKET
    rgb *= shade[..., None]
    for pr in pinch_rows:
        d = y - pr
        rgb = mix(rgb, JACKET_DK * 0.55, cover(d, 0.9) * 0.85)
        rgb = mix(rgb, C(240, 210, 130), stitched(cover(d + 2.6, 0.5), ctx.X, y, 4.5, 0.55) * 0.35)
    # knit cuff at the wrist end
    cuff_start = ctx.ring_row(len(ctx.rings) - 3)
    cuff = (y > cuff_start - 2)
    rib = 0.70 + 0.30 * np.cos(ctx.X * TAU / 3.6)
    rgb = np.where(cuff[..., None], TRIM * rib[..., None] * ctx.detail('knit', 2, 0.7)[..., None] * 1.2, rgb)
    rgb = mix(rgb, C(20, 20, 24), cover(y - cuff_start + 2, 1.0) * 0.8)
    # elbow patches (outer side of the elbow)
    ring_s = np.array(ss, np.float32)
    s_el = (info.get('s_elbow', None))
    # elbow row: ring nearest the geometric elbow
    elbow_row = ctx.ring_row(info['elbow_ring'])
    # seam on the underside (u = 0); the outside of the elbow is opposite to the bend direction
    ux = info['elbow_u'] * W
    dx = (ctx.X - ux + W / 2) % W - W / 2
    patch = rrect(dx + 0, y, -W * 0.20, elbow_row - 20, W * 0.20, elbow_row + 20, 6.0)
    pcol = CORD * (0.8 + 0.4 * ctx.noise(5, 5, 8, 2))[..., None]
    rgb = mix(rgb, pcol, patch)
    rgb = mix(rgb, C(30, 20, 14), rrect_edge(dx, y, -W * 0.20, elbow_row - 20, W * 0.20, elbow_row + 20, 6.0, 1.0) * 0.8)
    rgb = mix(rgb, C(230, 205, 150), stitched(rrect_edge(dx, y, -W * 0.20, elbow_row - 20, W * 0.20, elbow_row + 20, 6.0, 0.8, inset=2.5), ctx.X, y, 4.0, 0.5) * 0.5)
    # shoulder seam ring
    rgb = mix(rgb, JACKET_DK * 0.55, cover(y - ctx.ring_row(3), 0.9) * 0.8)
    # sleeve underside seam
    rgb = mix(rgb, JACKET_DK * 0.6, cover(((ctx.X + W / 2) % W) - W / 2, 0.9) * 0.7)
    g = ctx.noise(20, 14, 9, 3)
    rgb = mix(rgb, C(80, 58, 36), np.clip(g - 0.55, 0, 1) * 0.35 * np.clip(y / H * 1.5, 0, 1))
    mask = ((~cuff) & (patch < 0.5)).astype(np.float32)
    return rgb, mask


def paint_trousers(ctx, side=None):
    W, H = ctx.W, ctx.H
    rz = ctx.ring_vals(lambda r: r['c'].z)
    rgb = np.ones((ctx.Hn, W, 3), np.float32) * DENIM
    rgb *= ctx.detail('denim', 2, 0.9)[..., None]
    # soft wrinkles
    n = ctx.noise(30, 8, 21, 3)
    rgb *= (0.82 + 0.36 * n)[..., None]
    Z = np.interp(ctx.V, ctx.vv, rz).astype(np.float32)
    # knee / thigh creases
    for zc, amp in ((0.50, 0.30), (0.78, 0.18), (0.88, 0.2)):
        rgb *= (1 - amp * np.exp(-((Z - zc) / 0.012) ** 2) * (0.4 + 0.6 * ctx.noise(10, 10, 5)))[..., None]
    if side is not None:
        outer_u = 0.25 if side > 0 else 0.75
        # double-stitched side seams
        for du in (-0.012, 0.012):
            d = ctx.X - (outer_u + du) * W
            rgb = mix(rgb, C(232, 196, 110), stitched(cover(d, 0.6), ctx.X, ctx.Y, 4.0, 0.6, axis='y') * 0.7)
        inner = 0.75 if side > 0 else 0.25
        rgb = mix(rgb, DENIM * 0.7, cover(ctx.X - inner * W, 0.8) * 0.7)
        # knee patch: reinforced darker panel with stitching
        yk0 = float(np.interp(0.43, rz[::-1], ctx.vv[::-1]) * H)
        yk1 = float(np.interp(0.585, rz[::-1], ctx.vv[::-1]) * H)
        # rz is descending: v increases as z decreases
        ya, yb = sorted([float(np.interp(0.585, rz[1:][::-1], ctx.vv[1:][::-1]) * H), float(np.interp(0.43, rz[1:][::-1], ctx.vv[1:][::-1]) * H)])
        x0, x1 = 0.5 * W - 0.17 * W, 0.5 * W + 0.17 * W
        patch = rrect(ctx.X, ctx.Y, x0, ya, x1, yb, 6.0)
        pc = KNEEPATCH * (0.9 + 0.3 * ctx.detail('denim', 2, 0.8, off=(130, 40)))[..., None]
        rgb = mix(rgb, pc, patch)
        rgb = mix(rgb, C(16, 16, 18), rrect_edge(ctx.X, ctx.Y, x0, ya, x1, yb, 6.0, 1.2) * 0.9)
        rgb = mix(rgb, C(232, 196, 110), stitched(rrect_edge(ctx.X, ctx.Y, x0, ya, x1, yb, 6.0, 0.9, inset=2.4), ctx.X, ctx.Y, 4.0, 0.55) * 0.75)
        # cargo pocket on the outer thigh
        pu = 0.5 - 0.17 if side > 0 else 0.5 + 0.17
        px0, px1 = (pu - 0.10) * W, (pu + 0.10) * W
        pya, pyb = sorted([float(np.interp(0.80, rz[1:][::-1], ctx.vv[1:][::-1]) * H), float(np.interp(0.64, rz[1:][::-1], ctx.vv[1:][::-1]) * H)])
        pk = rrect_edge(ctx.X, ctx.Y, px0, pya, px1, pyb, 3.0, 1.0)
        rgb = mix(rgb, DENIM * 0.55, pk * 0.9)
        rgb = mix(rgb, C(232, 196, 110), stitched(rrect_edge(ctx.X, ctx.Y, px0, pya, px1, pyb, 3.0, 0.8, inset=2.0), ctx.X, ctx.Y, 4.0, 0.55) * 0.6)
        flap = rrect(ctx.X, ctx.Y, px0, pyb - (pyb - pya) * 0.32, px1, pyb, 2.0)
        rgb = mix(rgb, DENIM * 0.82, flap * 0.7)
        rgb = mix(rgb, C(20, 20, 24), rrect_edge(ctx.X, ctx.Y, px0, pyb - (pyb - pya) * 0.32, px1, pyb, 2.0, 0.9) * 0.8)
        btn = ell(ctx.X, ctx.Y, pu * W, pyb - (pyb - pya) * 0.16, 2.4, 2.4, 1.0)
        rgb = mix(rgb, C(170, 160, 120), btn)
    # mud near the boot rim
    low = np.clip((0.26 - Z) / 0.1, 0, 1)
    rgb = mix(rgb, C(86, 64, 44), low * (0.35 + 0.5 * ctx.noise(8, 8, 3, 2)) * 0.5)
    return rgb, np.zeros((ctx.Hn, W), np.float32)


def paint_pelvis(ctx):
    W = ctx.W
    rgb = np.ones((ctx.Hn, W, 3), np.float32) * DENIM
    rgb *= ctx.detail('denim', 2, 0.9)[..., None]
    rgb *= (0.82 + 0.36 * ctx.noise(30, 8, 22, 3))[..., None]
    rgb = mix(rgb, DENIM * 0.7, cover(ctx.X - 0.5 * W, 0.8) * 0.6)
    return rgb, np.zeros((ctx.Hn, W), np.float32)


def paint_boot_shaft(ctx):
    W, H = ctx.W, ctx.H
    rz = ctx.ring_vals(lambda r: r['c'].z)
    Z = np.interp(ctx.V, ctx.vv, rz).astype(np.float32)
    rgb = np.ones((ctx.Hn, W, 3), np.float32) * BOOT
    rgb *= ctx.detail('smooth', 2, 0.9)[..., None] * 1.2
    n = ctx.noise(18, 12, 7, 3)
    rgb *= (0.84 + 0.32 * n)[..., None]
    # top band (rolled rim) + flex creases at the ankle
    rgb = mix(rgb, BOOT * 0.7, sstep(0.30, 0.322, Z))
    rgb = mix(rgb, C(206, 190, 130), cover(Z - 0.298, 0.006, 0.006) * 0.85)
    for zc, a in ((0.20, 0.30), (0.178, 0.22), (0.155, 0.15)):
        rgb *= (1 - a * np.exp(-((Z - zc) / 0.007) ** 2) * (0.5 + 0.5 * np.sin(ctx.U * TAU * 3 + 1.7) ** 2))[..., None]
    # moulded seams
    for u in (0.25, 0.75):
        rgb = mix(rgb, BOOT * 1.35, cover(ctx.X - u * W, 0.8) * 0.5)
    # scuffs and mud
    sc = np.clip((ctx.noise(5, 14, 30, 2) - 0.72) * 5, 0, 1)
    rgb = mix(rgb, C(160, 190, 150), sc * 0.28)
    mud = np.clip((0.2 - Z) / 0.12, 0, 1) * (0.3 + 0.7 * ctx.noise(7, 7, 31, 3))
    rgb = mix(rgb, C(96, 72, 48), np.clip(mud * 1.2 - 0.15, 0, 1) * 0.65)
    return rgb, np.zeros((ctx.Hn, W), np.float32)


def paint_boot_foot(ctx):
    W, H = ctx.W, ctx.H
    rcz = ctx.ring_vals(lambda r: r['c'].z)
    rrx = ctx.ring_vals(lambda r: r['rx'])
    cz = ctx.along(rcz)
    rx = ctx.along(rrx)
    th = np.array([geo.theta_of_u(0)], np.float32)
    ang = ctx.U * TAU
    c = np.cos(ang)
    e = 2.0 / 3.2
    zpt = cz - rx * np.sign(c) * np.abs(c) ** np.where(c >= 0, 2.0 / 3.2, 2.0 / 2.0)
    height = zpt
    rgb = np.ones((ctx.Hn, W, 3), np.float32) * BOOT
    rgb *= ctx.detail('smooth', 2, 0.9)[..., None] * 1.2
    rgb *= (0.84 + 0.32 * ctx.noise(18, 12, 8, 3))[..., None]
    # outsole band + cream welt line
    sole = sstep(0.034, 0.026, height)
    rgb = mix(rgb, SOLE * (0.8 + 0.4 * ctx.noise(6, 6, 9)[..., None]), sole)
    rgb = mix(rgb, SOLE_LT, cover(height - 0.0385, 0.0035, 0.004) * 0.9)
    # tread on the bottom (u around 0/1)
    bu = np.minimum(ctx.U, 1 - ctx.U)
    tread = (bu < 0.13)
    lug = (((ctx.Y // 6) % 2) == 0) & ((((ctx.X // 7) % 2) == 0) | (bu < 0.04))
    rgb = mix(rgb, C(12, 12, 12), tread * lug * 0.55)
    rgb = mix(rgb, C(70, 68, 62), tread * (1 - lug) * 0.3)
    # toe cap + heel counter wear
    toe = ctx.V > 0.80
    rgb = mix(rgb, C(160, 190, 150), sstep(0.80, 0.97, ctx.V) * 0.22)
    rgb = mix(rgb, BOOT * 0.6, (ctx.V < 0.2) * 0.25)
    sc = np.clip((ctx.noise(5, 14, 33, 2) - 0.70) * 5, 0, 1)
    rgb = mix(rgb, C(170, 195, 160), sc * 0.3)
    mud = np.clip((0.07 - height) / 0.05, 0, 1) * (0.3 + 0.7 * ctx.noise(7, 7, 34, 3))
    rgb = mix(rgb, C(96, 72, 48), np.clip(mud * 1.3 - 0.1, 0, 1) * 0.7)
    return rgb, np.zeros((ctx.Hn, W), np.float32)


def paint_leather(ctx, base=LEATHER, creases=(), cuff=False, seed=1):
    W, H = ctx.W, ctx.H
    rgb = np.ones((ctx.Hn, W, 3), np.float32) * base
    d = ctx.detail('leather', 2, 1.0)
    rgb *= (0.55 + 0.6 * d)[..., None] * 1.15
    rgb *= (0.85 + 0.3 * ctx.noise(10, 10, seed, 3))[..., None]
    for r in creases:
        rgb *= (1 - 0.33 * np.exp(-((ctx.Y - r) / 1.4) ** 2))[..., None]
    # stitched seams down the sides
    for u in (0.25, 0.75):
        rgb = mix(rgb, C(226, 196, 130), stitched(cover(ctx.X - u * W, 0.5), ctx.X, ctx.Y, 3.2, 0.5, axis='y') * 0.55)
    if cuff:
        top = ctx.ring_row(len(ctx.rings) - 2)
        rgb = mix(rgb, C(30, 20, 14), cover(ctx.Y - top, 1.0) * 0.7)
        rgb = mix(rgb, C(226, 196, 130), stitched(cover(ctx.Y - top + 3.5, 0.5), ctx.X, ctx.Y, 4.0, 0.55) * 0.6)
        rgb *= 0.9
    dirt = np.clip(ctx.noise(8, 8, seed + 4, 3) - 0.5, 0, 1)
    rgb = mix(rgb, C(70, 48, 30), dirt * 0.5)
    return rgb, np.zeros((ctx.Hn, W), np.float32)


def paint_hair(ctx, col=HAIR, grey=0.18):
    W = ctx.W
    streak = ctx.noise(1.6, 18.0, 41, 2)
    streak2 = ctx.noise(3.0, 40.0, 42, 1)
    rgb = np.ones((ctx.Hn, W, 3), np.float32) * col
    rgb *= (0.55 + 0.9 * streak)[..., None]
    rgb = mix(rgb, HAIR_GREY, np.clip((streak2 - 0.62) * 3.0, 0, 1) * grey * 3)
    # lighter tips toward the outer end
    rgb = mix(rgb, col * 1.5, np.clip((ctx.V - 0.75) * 3, 0, 1) * 0.4)
    return rgb, np.zeros((ctx.Hn, W), np.float32)


def skin_base(ctx, ushade=None):
    W = ctx.W
    rgb = np.ones((ctx.Hn, W, 3), np.float32) * SKIN
    n = ctx.noise(30, 30, 51, 3)
    rgb = mix(rgb, SKIN_SH, np.clip((n - 0.45) * 1.5, 0, 1) * 0.35)
    pores = ctx.noise(1.7, 1.7, 52, 1)
    rgb *= (0.94 + 0.12 * pores)[..., None]
    return rgb


def paint_nose(ctx):
    W = ctx.W
    rgb = skin_base(ctx)
    # redder toward the tip (v ~ 1)
    tip = sstep(0.35, 1.0, ctx.V)
    rgb = mix(rgb, C(214, 104, 86), 0.25 + tip * 0.6)
    rgb = mix(rgb, C(236, 140, 120), np.clip((ctx.noise(6, 6, 60, 2) - 0.55) * 2, 0, 1) * 0.3)
    # nostrils on the underside (u ~ 0.75 is "down" for this loft) near the tip
    for du in (-0.09, 0.09):
        d = ell((ctx.U - (0.75 + du)) * W, (ctx.V - 0.82) * ctx.H, 0, 0, 3.4, 2.8, 1.0)
        rgb = mix(rgb, C(74, 30, 26), d * 0.85)
    return rgb, np.zeros((ctx.Hn, W), np.float32)


def paint_ear(ctx):
    W = ctx.W
    rgb = skin_base(ctx)
    rgb = mix(rgb, C(214, 120, 104), sstep(0.2, 0.9, ctx.V) * 0.35)
    # inner shading: darker at the ear centre
    rgb = mix(rgb, C(160, 84, 70), np.exp(-((ctx.V - 0.8) / 0.18) ** 2) * 0.4)
    return rgb, np.zeros((ctx.Hn, W), np.float32)


def paint_neck(ctx):
    W = ctx.W
    rgb = skin_base(ctx)
    rz = ctx.ring_vals(lambda r: r['c'].z)
    Z = ctx.along(rz)
    rgb = mix(rgb, SKIN_SH * 0.75, sstep(1.42, 1.34, Z) * 0.8)
    # light stubble
    st = np.clip((ctx.noise(1.4, 1.4, 53) - 0.55) * 3, 0, 1)
    rgb = mix(rgb, C(70, 52, 44), st * 0.35 * sstep(1.30, 1.44, Z))
    return rgb, np.zeros((ctx.Hn, W), np.float32)


def paint_head(ctx):
    W, H = ctx.W, ctx.H
    N = geo.HEAD_N
    rh = ctx.ring_vals(lambda r: r['c'].z - CHIN_Z)
    h = ctx.along(rh)
    z = h + CHIN_Z
    u = ctx.U
    theta = np.interp(u, [0, 0.5 - geo.FACE_U, 0.5 + geo.FACE_U, 1.0],
                      [0, math.pi - geo.FACE_ALPHA, math.pi + geo.FACE_ALPHA, TAU]).astype(np.float32)
    hw = np.interp(h, geo.HEAD_PROF_H, geo.HEAD_PROF_W).astype(np.float32)
    s = np.sin(theta)
    X = -hw * np.sign(s) * np.abs(s) ** (2 / 2.15)         # world X (left = +)
    Xa = np.abs(X)
    front = np.abs(theta - math.pi)                         # 0 = straight ahead
    rgb = skin_base(ctx)
    # tonal variation: forehead lighter, cheeks flushed, under-chin shadow
    rgb = mix(rgb, C(240, 190, 156), sstep(1.66, 1.74, z) * 0.35 * (front < 1.0))
    for sx in (-1, 1):
        rgb = mix(rgb, C(236, 120, 104), ell(X, z, sx * 0.088, 1.553, 0.050, 0.038, 0.03) * 0.42)
    rgb = mix(rgb, C(228, 130, 110), ell(X, z, 0, 1.605, 0.04, 0.05, 0.03) * 0.25)
    rgb = mix(rgb, SKIN_SH * 0.8, sstep(1.46, 1.42, z) * 0.7)
    # stubble: lower face, around the mouth, jaw and chin (never on forehead)
    stub_zone = sstep(1.545, 1.488, z) * sstep(0.140, 0.085, Xa) * (front < 1.25)
    sp = ctx.noise(1.25, 1.25, 55)
    st = np.clip((sp - 0.52) * 2.4, 0, 1)
    rgb = mix(rgb, C(92, 68, 56), st * stub_zone * 0.45)
    rgb = mix(rgb, C(150, 108, 88), stub_zone * 0.14)
    # nasolabial folds
    for sx in (-1, 1):
        for k in range(1):
            t = np.linspace(0, 1, 30)
            fx = 0.034 + 0.040 * t
            fz = 1.585 - 0.052 * t - 0.012 * np.sin(t * math.pi)
            for a, b in zip(fx, fz):
                rgb = mix(rgb, SKIN_SH * 0.72, ell(Xa, z, a, b, 0.0035, 0.0035, 0.0016) * 0.22 * (X * sx > 0))
    # eyes: dark ovals + highlight, lid creases, bags
    for sx in (-1, 1):
        ex = sx * 0.062
        ez = 1.645
        rgb = mix(rgb, SKIN_SH * 0.82, ell(X, z, ex, ez + 0.020, 0.027, 0.0065, 0.0015) * 0.0)
        lid = ell(X, z, ex, ez + 0.002, 0.0225, 0.0235, 0.0016) - ell(X, z, ex, ez - 0.003, 0.0205, 0.0215, 0.0016)
        rgb = mix(rgb, C(160, 100, 82), np.clip(lid, 0, 1) * (z > ez - 0.006) * 0.55)
        bag = ell(X, z, ex, ez - 0.027, 0.020, 0.0042, 0.0015)
        rgb = mix(rgb, SKIN_SH * 0.80, bag * 0.4)
        eye = ell(X, z, ex, ez, 0.0120, 0.0160, 0.0013)
        rgb = mix(rgb, C(22, 14, 12), eye)
        rgb = mix(rgb, C(70, 44, 30), eye * ell(X, z, ex, ez - 0.006, 0.010, 0.006, 0.004) * 0.5)
        rgb = mix(rgb, C(255, 255, 255), ell(X, z, ex + 0.0033, ez + 0.0052, 0.0034, 0.0034, 0.0009))
        rgb = mix(rgb, C(255, 255, 255), ell(X, z, ex - 0.0040, ez - 0.0060, 0.0015, 0.0015, 0.0007) * 0.7)
    # mouth: gentle smile, pink lower lip
    mz = 1.508 + 0.010 * (Xa / 0.040) ** 2
    mouth_line = cover((z - mz) * 700, 0.9, 0.9) * (Xa < 0.040)
    lip = ell(X, z, 0, 1.488, 0.034, 0.0075, 0.002)
    rgb = mix(rgb, C(208, 112, 100), lip * 0.7)
    rgb = mix(rgb, C(86, 30, 28), mouth_line * 0.95)
    for sx in (-1, 1):
        rgb = mix(rgb, C(120, 52, 44), ell(X, z, sx * 0.042, 1.521, 0.003, 0.006, 0.0014) * 0.7)
    # cleft under the lip
    rgb = mix(rgb, SKIN_SH * 0.8, ell(X, z, 0, 1.468, 0.016, 0.004, 0.002) * 0.35)
    # hair: buzz cut with a high hairline
    phi = front
    zline = np.where(phi < 0.55, 1.742 - 0.02 * (phi / 0.55) ** 2, 1.722 - (phi - 0.55) / 0.85 * 0.12)
    zline = np.where(phi > 1.4, 1.60 - sstep(1.4, 2.2, phi) * 0.04, zline)
    zline = zline + (ctx.noise(14, 14, 57, 3) - 0.5) * 0.010
    hair_cov = sstep(zline - 0.006, zline + 0.010, z)
    hair_cov = np.where(phi > 1.3, np.maximum(hair_cov, sstep(zline - 0.005, zline + 0.008, z)), hair_cov)
    hs = ctx.noise(1.3, 2.4, 58, 2)
    hcol = HAIR * (0.62 + 0.80 * hs)[..., None]
    hcol *= (0.85 + 0.30 * ctx.noise(16, 16, 59, 3))[..., None]
    hcol = mix(hcol, HAIR_GREY, np.clip((ctx.noise(8, 8, 60, 3) - 0.62) * 3, 0, 1) * 0.35)
    skin_through = mix(rgb, HAIR * 0.9, 0.55)
    hair_col = mix(skin_through, hcol, np.clip(0.55 + 0.45 * hs, 0, 1))
    rgb = mix(rgb, hair_col, hair_cov * np.clip(sstep(1.0, 1.7, z), 0, 1) * 0.95 + hair_cov * 0.05)
    return rgb, np.zeros((ctx.Hn, W), np.float32)


def paint_beanie(ctx):
    W, H = ctx.W, ctx.H
    rz = ctx.ring_vals(lambda r: r['c'].z)
    base = C(166, 52, 44)
    rgb = np.ones((ctx.Hn, W, 3), np.float32) * base
    cuff_lo = ctx.ring_row(1)
    cuff_hi = ctx.ring_row(5)
    y = ctx.Y
    # dome: V stitches
    cw = 4.2
    colp = (ctx.X % cw) / cw
    ch = np.abs(colp - 0.5) * 2
    vst = 0.80 + 0.20 * np.cos((y * 0.9 + ch * 2.2) * TAU / 3.6)
    rgb *= vst[..., None]
    # cuff: 2x2 ribs
    rib = 0.68 + 0.32 * np.cos(ctx.X * TAU / (W / 72.0))
    incuff = ((y >= cuff_lo - 1) & (y <= cuff_hi + 1))[..., None]
    rgb = np.where(incuff, base * 0.95 * rib[..., None], rgb)
    rgb *= ctx.detail('knit', 2, 0.9)[..., None] * 1.25
    rgb = mix(rgb, C(60, 14, 12), cover(y - cuff_hi, 1.2) * 0.65)
    rgb = mix(rgb, C(60, 14, 12), cover(y - cuff_lo, 1.0) * 0.5)
    rgb *= (0.88 + 0.24 * ctx.noise(12, 12, 61, 2))[..., None]
    fuzz = np.clip((ctx.noise(1.3, 1.3, 62) - 0.55) * 3, 0, 1)
    rgb = mix(rgb, base * 1.5, fuzz * 0.25)
    return rgb, np.zeros((ctx.Hn, W), np.float32)


def paint_cap_crown(ctx):
    W, H = ctx.W, ctx.H
    base = C(112, 94, 72)
    rgb = np.ones((ctx.Hn, W, 3), np.float32) * base
    rgb *= (0.45 + 0.9 * ctx.detail('wool', 2, 1.0))[..., None] * 1.2
    rgb *= (0.88 + 0.24 * ctx.noise(14, 14, 63, 2))[..., None]
    # 8 panel seams converging at the button
    for k in range(8):
        rgb = mix(rgb, base * 0.45, cover(ctx.X - (k / 8.0) * W, 0.9) * 0.8)
        rgb = mix(rgb, C(190, 170, 130), stitched(cover(ctx.X - (k / 8.0) * W - 3.0, 0.45), ctx.X, ctx.Y, 4.0, 0.5, axis='y') * 0.35)
    # bottom band
    rgb = mix(rgb, C(60, 48, 38), cover(ctx.Y - ctx.ring_row(2), 1.0) * 0.6)
    rgb = mix(rgb, base * 0.7, (ctx.Y < ctx.ring_row(2)) * 0.5)
    # button on top
    rgb = mix(rgb, C(70, 56, 44), sstep(0.93, 0.985, ctx.V) * 0.9)
    return rgb, np.zeros((ctx.Hn, W), np.float32)


def paint_cap_brim(ctx):
    W, H = ctx.W, ctx.H
    base = C(66, 52, 42)
    rgb = np.ones((ctx.Hn, W, 3), np.float32) * base
    rgb *= (0.55 + 0.7 * ctx.detail('leather', 2, 1.0))[..., None] * 1.3
    rgb *= (0.85 + 0.3 * ctx.noise(8, 8, 64, 2))[..., None]
    rgb = mix(rgb, C(150, 130, 96), stitched(cover(ctx.Y - ctx.H * 0.55, 0.5), ctx.X, ctx.Y, 3.2, 0.5) * 0.4)
    return rgb, np.zeros((ctx.Hn, W), np.float32)


def paint_helmet(ctx, ridge=False):
    W, H = ctx.W, ctx.H
    base = C(236, 196, 38) if not ridge else C(212, 170, 28)
    rgb = np.ones((ctx.Hn, W, 3), np.float32) * base
    rgb *= (0.88 + 0.24 * ctx.noise(16, 16, 65, 3))[..., None]
    sc = np.clip((ctx.noise(2.2, 10.0, 66, 2) - 0.68) * 5, 0, 1)
    rgb = mix(rgb, C(250, 232, 150), sc * 0.55)
    dirt = np.clip((ctx.noise(6, 6, 67, 3) - 0.5) * 2, 0, 1)
    rgb = mix(rgb, C(90, 70, 40), dirt * 0.4 * np.clip(1.2 - ctx.V * 1.5, 0, 1))
    return rgb, np.zeros((ctx.Hn, W), np.float32)


# ================================================================== driver
def paint_all(reg):
    A = tex.ATLAS
    alb = np.ones((A, A, 3), np.float32) * 0.5
    msk = np.zeros((A, A), np.float32)
    seed = 100
    for name, info in reg.items():
        seed += 1
        ctx = Ctx(info, seed)
        if name == 'head':
            rgb, m = paint_head(ctx)
        elif name == 'nose':
            rgb, m = paint_nose(ctx)
        elif name.startswith('ear_'):
            rgb, m = paint_ear(ctx)
        elif name.startswith('mous_') or name.startswith('brow_'):
            rgb, m = paint_hair(ctx)
        elif name == 'neck':
            rgb, m = paint_neck(ctx)
        elif name == 'collar':
            rgb, m = paint_collar(ctx)
        elif name == 'torso':
            rgb, m = paint_torso(ctx)
        elif name == 'pelvis':
            rgb, m = paint_pelvis(ctx)
        elif name.startswith('leg_'):
            rgb, m = paint_trousers(ctx, +1 if name.endswith('L') else -1)
        elif name.startswith('sleeve_'):
            rgb, m = paint_sleeve(ctx)
        elif name.startswith('boot_shaft'):
            rgb, m = paint_boot_shaft(ctx)
        elif name.startswith('boot_foot'):
            rgb, m = paint_boot_foot(ctx)
        elif name.startswith('cuff_'):
            rgb, m = paint_leather(ctx, LEATHER_DK * 1.15, cuff=True, seed=seed)
        elif name.startswith('palm_') or name.startswith('finger') or name.startswith('thumb_'):
            crease = []
            if name.startswith('finger') or name.startswith('thumb_'):
                n = len(ctx.rings)
                crease = [ctx.ring_row(i) for i in (3, 5)]
            rgb, m = paint_leather(ctx, LEATHER, creases=crease, seed=seed)
        elif name == 'hat_beanie':
            rgb, m = paint_beanie(ctx)
        elif name == 'hat_cap_crown':
            rgb, m = paint_cap_crown(ctx)
        elif name == 'hat_cap_brim':
            rgb, m = paint_cap_brim(ctx)
        elif name.startswith('hat_helmet'):
            rgb, m = paint_helmet(ctx, ridge=name.endswith('ridge'))
        else:
            rgb, m = np.ones((ctx.Hn, ctx.W, 3), np.float32) * 0.5, np.zeros((ctx.Hn, ctx.W), np.float32)
        rgb = ctx.wrap(np.clip(rgb, 0, 1))
        m = ctx.wrap(m)
        mm = ctx.m
        x, y, w, h = info['x'], info['y'], info['w'], info['h']
        alb[y - mm:y + h + mm, x - mm:x + w + mm] = rgb
        msk[y - mm:y + h + mm, x - mm:x + w + mm] = m
    return alb, msk
