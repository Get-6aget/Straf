"""Procedural body geometry for "The Worker": ring-loft builder + all body / hat parts.

Every part is a lofted tube with its own rectangular UV island (u = around, v = along),
so textures can be painted per island with no stretching.  Vertex weights are assigned at
creation time (no heat-diffusion auto weights needed).
"""
import math
import numpy as np
import bmesh
from mathutils import Vector, Matrix
from char_common import *

TAU = 2 * math.pi


def interp(x, xs, ys):
    return float(np.interp(x, xs, ys))


# ---------------------------------------------------------------- weights
def chain_w(s, joints, bones, hw):
    """Piecewise blend along a chain. joints = boundaries (len n-1), bones len n, hw = half widths."""
    u = 0.0
    for j, h in zip(joints, hw):
        u += smoothstep(j - h, j + h, s)
    i = min(int(u), len(bones) - 1)
    f = u - i
    if i >= len(bones) - 1 or f < 1e-4:
        return {bones[min(i, len(bones) - 1)]: 1.0}
    return {bones[i]: 1 - f, bones[i + 1]: f}


def add_w(d, k, w):
    d[k] = d.get(k, 0.0) + w


def scale_w(d, s):
    return {k: v * s for k, v in d.items()}


def merge_w(a, b, tb):
    out = {}
    for k, v in a.items():
        out[k] = out.get(k, 0) + v * (1 - tb)
    for k, v in b.items():
        out[k] = out.get(k, 0) + v * tb
    return out


# ---------------------------------------------------------------- builder
class Builder:
    def __init__(self, reg=None, objname='body'):
        self.objname = objname
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.dv = self.bm.verts.layers.deform.new()
        self.pl = self.bm.faces.layers.int.new('part')
        self.parts = reg if reg is not None else {}
        self.order = []
        self.groups = {n: i for i, n in enumerate(BONES)}
        self.hat_parts = {}

    def frames(self, centers, ex0):
        n = len(centers)
        Ts = []
        for i in range(n):
            a = centers[max(i - 1, 0)]
            b = centers[min(i + 1, n - 1)]
            t = b - a
            if t.length < 1e-9:
                t = Ts[-1] if Ts else Vector((0, 0, 1))
            Ts.append(t.normalized())
        ex = ex0.copy()
        out = []
        for T in Ts:
            ex = ex - T * ex.dot(T)
            if ex.length < 1e-6:
                ex = T.orthogonal()
            ex.normalize()
            ey = T.cross(ex)
            out.append((T, ex.copy(), ey))
        return out

    def loft(self, name, rings, N, ppm_u, ppm_v, wfn, ex0=None, thetas=None, u_of_k=None,
             w_px=None, hat=None, margin=3, disp=None, min_w=18):
        """rings: list of dict(c, rx, ry, [n], [pole], [ex, ey])"""
        centers = [r['c'] for r in rings]
        if ex0 is not None:
            fr = self.frames(centers, ex0)
            for r, (T, ex, ey) in zip(rings, fr):
                r.setdefault('ex', ex)
                r.setdefault('ey', ey)
        thetas = thetas if thetas is not None else [TAU * k / N for k in range(N)]
        if u_of_k is None:
            u_of_k = [k / N for k in range(N + 1)]
        bm = self.bm
        pid = len(self.order)
        self.order.append(name)
        # v parameter
        cum = [0.0]
        rb = lambda r: 0.0 if r.get('pole') else 0.5 * (r['rx'] + r['ry'])
        for i in range(1, len(rings)):
            d = (rings[i]['c'] - rings[i - 1]['c']).length
            dr = rb(rings[i]) - rb(rings[i - 1])
            cum.append(cum[-1] + math.hypot(d, dr))
        total = cum[-1]
        vv = [c / total for c in cum]
        per = [TAU * math.sqrt((r['rx'] ** 2 + r['ry'] ** 2) / 2) for r in rings if not r.get('pole')]
        mean_per = sum(per) / len(per)
        W = int(round(w_px if w_px else max(min_w, ppm_u * mean_per)))
        H = int(round(max(min_w, ppm_v * total)))
        # vertices
        vid = []
        for i, r in enumerate(rings):
            row = []
            if r.get('pole'):
                p = r['c']
                v = bm.verts.new(p)
                self._wt(v, wfn(i, 0, p))
                row = [v] * N
            else:
                n_a, n_b = r.get('n', (2.0, 2.0))
                if not isinstance(r.get('n', 2.0), tuple):
                    n_a = n_b = r.get('n', 2.0)
                for k in range(N):
                    th = thetas[k]
                    c, s = math.cos(th), math.sin(th)
                    nn = n_a if c >= 0 else n_b
                    e = 2.0 / nn
                    x = math.copysign(abs(c) ** e, c)
                    y = math.copysign(abs(s) ** e, s)
                    p = r['c'] + r['ex'] * (r['rx'] * x + r.get('dx', 0)) + r['ey'] * (r['ry'] * y + r.get('dy', 0))
                    if disp:
                        p = disp(i, k, p)
                    v = bm.verts.new(p)
                    self._wt(v, wfn(i, k, p))
                    row.append(v)
            vid.append(row)
        # faces (flip handled via frame handedness; verified by recalc below)
        nr = len(rings)
        for i in range(nr - 1):
            for k in range(N):
                k1 = (k + 1) % N
                corners = [(i, k, k), (i, k1, k + 1), (i + 1, k1, k + 1), (i + 1, k, k)]
                vs, uvs = [], []
                for (ri, kk, ku) in corners:
                    v = vid[ri][kk]
                    u = u_of_k[ku]
                    if rings[ri].get('pole'):
                        u = 0.5 * (u_of_k[k] + u_of_k[k + 1])
                    if vs and vs[-1] is v:
                        continue
                    if v in vs:
                        continue
                    vs.append(v)
                    uvs.append((u, vv[ri]))
                if len(vs) < 3:
                    continue
                try:
                    f = bm.faces.new(vs)
                except ValueError:
                    continue
                f[self.pl] = pid
                for lp, (u, v) in zip(f.loops, uvs):
                    lp[self.uv].uv = (u, v)
        info = dict(builder=self, pid=pid, name=name, w=W, h=H, vv=np.array(vv), N=N, rings=rings,
                    u_of_k=np.array(u_of_k), margin=margin, hat=hat, total=total)
        self.parts[name] = info
        return info

    def _wt(self, v, w):
        tot = sum(w.values())
        if tot <= 0:
            w = {'hips': 1.0}
            tot = 1.0
        items = sorted(w.items(), key=lambda kv: -kv[1])[:4]
        tot = sum(x for _, x in items)
        for b, x in items:
            if x / tot > 1e-3:
                v[self.dv][self.groups[b]] = x / tot

    def finish(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])


# ---------------------------------------------------------------- head profile
HEAD_PROF_H = [0.0, 0.010, 0.030, 0.060, 0.100, 0.150, 0.200, 0.245, 0.285, 0.322, 0.350, 0.368, 0.378, 0.38]
HEAD_PROF_W = [0.0, 0.052, 0.086, 0.118, 0.150, 0.174, 0.187, 0.190, 0.184, 0.164, 0.130, 0.092, 0.050, 0.0]


def head_hw(h):
    return interp(h, HEAD_PROF_H, HEAD_PROF_W)


def head_cy(h):
    return 0.010 * math.sin(math.pi * clamp(h / HEAD_H, 0, 1))


def head_front_y(z, x=0.0):
    h = z - CHIN_Z
    rx = head_hw(h)
    ry = rx * 1.035
    if abs(x) >= rx:
        return head_cy(h)
    return head_cy(h) - ry * math.sqrt(1 - (x / rx) ** 2) ** (1.0)


# face u mapping: front fraction of the UV width
FACE_ALPHA = 1.10          # half angle (rad) of the front wedge
FACE_U = 0.31              # half width (in u) given to that wedge


def theta_of_u(u):
    """u (0 back .. 0.5 front .. 1 back) -> angle from back, piecewise-linear."""
    a = math.pi - FACE_ALPHA
    b = math.pi + FACE_ALPHA
    u0, u1 = 0.5 - FACE_U, 0.5 + FACE_U
    if u <= u0:
        return a * u / u0
    if u >= u1:
        return b + (TAU - b) * (u - u1) / (1 - u1)
    return a + (b - a) * (u - u0) / (u1 - u0)


def u_of_theta(th):
    a = math.pi - FACE_ALPHA
    b = math.pi + FACE_ALPHA
    u0, u1 = 0.5 - FACE_U, 0.5 + FACE_U
    th = th % TAU
    if th <= a:
        return u0 * th / a
    if th >= b:
        return u1 + (1 - u1) * (th - b) / (TAU - b)
    return u0 + (u1 - u0) * (th - a) / (b - a)


# ---------------------------------------------------------------- torso etc.
Z_AX = Vector((0, 0, 1))
BACK = Vector((0, 1, 0))


def quilt(z, z0, pitch, a, z_hi):
    """radius multiplier for horizontal quilting baffles."""
    if z < z0 - 1e-6 or z > z_hi + 1e-6:
        return 1.0
    ph = ((z - z0) / pitch) % 1.0
    return 1.0 + a * (math.sin(math.pi * ph) ** 0.7 - 0.5)


TORSO_Z = [0.775, 0.84, 0.92, 1.00, 1.08, 1.16, 1.22, 1.27, 1.31, 1.345, 1.375]
TORSO_RX = [0.192, 0.190, 0.180, 0.174, 0.184, 0.202, 0.212, 0.210, 0.198, 0.156, 0.115]
TORSO_RY = [0.140, 0.140, 0.132, 0.128, 0.134, 0.142, 0.144, 0.137, 0.122, 0.099, 0.088]
TORSO_CY = [0.006, 0.006, 0.002, -0.002, -0.006, -0.012, -0.012, -0.006, 0.0, 0.0, 0.0]
Q0, QP = 0.84, 0.085          # first pinch height and pitch of the quilted baffles


def torso_levels():
    zs = [0.775, 0.808, Q0]
    for j in range(5):
        base = Q0 + QP * j
        zs += [base + QP / 3, base + 2 * QP / 3, base + QP]
    zs += [1.305, 1.340, 1.372]
    return zs


def torso_w(i, k, p):
    z = p.z
    w = chain_w(z, [1.00, 1.13, 1.36], ['hips', 'spine', 'chest', 'neck'], [0.07, 0.06, 0.03])
    # shoulder influence
    for sd in (+1, -1):
        S = Vector((sd * SHOULDER_X, 0, SHOULDER_Z))
        d = (p - S).length
        if d < 0.14 and z > 1.18:
            t = (1 - d / 0.14) * 0.45
            w = merge_w(w, {('upperarm.L' if sd > 0 else 'upperarm.R'): 1.0}, t)
    return w


def build_torso(B):
    rings = []
    for z in torso_levels():
        f = quilt(z, Q0, QP, 0.075, Q0 + 5 * QP)
        rx = interp(z, TORSO_Z, TORSO_RX) * f
        ry = interp(z, TORSO_Z, TORSO_RY) * f
        cy = interp(z, TORSO_Z, TORSO_CY)
        if z < 0.78:
            rx *= 0.97
            ry *= 0.97
        rings.append(dict(c=Vector((0, cy, z)), rx=rx, ry=ry, n=(2.4, 2.4)))
    rings.insert(0, dict(c=Vector((0, 0.006, 0.785)), rx=0.0, ry=0.0, pole=True))
    rings.append(dict(c=Vector((0, 0.0, 1.372)), rx=0.0, ry=0.0, pole=True))
    return B.loft('torso', rings, 26, 400, 400, torso_w, ex0=BACK)


def build_collar(B):
    prof = [(1.332, 0.094, 0.090), (1.362, 0.100, 0.095), (1.398, 0.106, 0.100),
            (1.425, 0.104, 0.098), (1.438, 0.094, 0.090), (1.436, 0.082, 0.079)]
    rings = [dict(c=Vector((0.0, 0.004, z)), rx=rx, ry=ry, n=(2.2, 2.2)) for z, rx, ry in prof]
    def w(i, k, p):
        return chain_w(p.z, [1.37], ['chest', 'neck'], [0.04])
    return B.loft('collar', rings, 22, 420, 420, w, ex0=BACK)


def build_neck(B):
    zs = [1.30, 1.38, 1.44, 1.50]
    rr = [0.062, 0.058, 0.056, 0.056]
    rings = [dict(c=Vector((0, 0.005, z)), rx=r, ry=r * 0.95, n=(2.0, 2.0)) for z, r in zip(zs, rr)]
    def w(i, k, p):
        return chain_w(p.z, [1.37, 1.44], ['chest', 'neck', 'head'], [0.05, 0.03])
    return B.loft('neck', rings, 14, 400, 400, w, ex0=BACK)


def build_pelvis(B):
    prof = [(0.70, 0.0, 0.0), (0.73, 0.080, 0.065), (0.78, 0.150, 0.112), (0.84, 0.176, 0.124),
            (0.92, 0.176, 0.124)]
    rings = []
    for z, rx, ry in prof:
        if rx == 0:
            rings.append(dict(c=Vector((0, 0.0, z)), rx=0, ry=0, pole=True))
        else:
            rings.append(dict(c=Vector((0, 0.0, z)), rx=rx, ry=ry, n=(2.3, 2.3)))
    rings.append(dict(c=Vector((0, 0.0, 0.95)), rx=0, ry=0, pole=True))
    def w(i, k, p):
        d = {'hips': 1.0}
        t = smoothstep(0.90, 0.78, p.z) * 0.55
        bone = 'thigh.L' if p.x > 0 else 'thigh.R'
        t *= smoothstep(0.0, 0.05, abs(p.x))
        return merge_w(d, {bone: 1.0}, t)
    return B.loft('pelvis', rings, 22, 400, 400, w, ex0=BACK)


# ---------------------------------------------------------------- legs & boots
def build_leg(B, side):
    sd = side
    nm = 'L' if sd > 0 else 'R'
    x = sd * HIP_X
    prof = [(0.945, 0.0, True), (0.925, 0.062, False), (0.89, 0.086, False), (0.80, 0.085, False),
            (0.68, 0.076, False), (0.575, 0.067, False), (0.50, 0.065, False), (0.42, 0.061, False),
            (0.30, 0.059, False), (0.20, 0.059, False), (0.15, 0.057, False), (0.13, 0.0, True)]
    rings = []
    for z, r, pole in prof:
        if pole:
            rings.append(dict(c=Vector((x, 0, z)), rx=0, ry=0, pole=True))
        else:
            kneebulge = 1.0 + 0.06 * math.exp(-((z - 0.50) / 0.05) ** 2)
            rings.append(dict(c=Vector((x, 0.0, z)), rx=r * kneebulge, ry=r * kneebulge, n=(2.0, 2.0)))
    def w(i, k, p):
        return chain_w(p.z, [KNEE_Z + 0.0, ANKLE_Z + 0.02][::-1], ['thigh.' + nm, 'shin.' + nm, 'foot.' + nm], [0.0, 0.0]) \
            if False else leg_w(nm, p.z)
    return B.loft('leg_' + nm, rings, 16, 400, 400, w, ex0=BACK)


def leg_w(nm, z):
    # descending: thigh above knee, shin between, foot below ankle
    t = smoothstep(KNEE_Z + 0.07, KNEE_Z - 0.07, z)
    f = smoothstep(ANKLE_Z + 0.04, ANKLE_Z - 0.04, z)
    d = {'thigh.' + nm: 1 - t}
    d['shin.' + nm] = t * (1 - f)
    d['foot.' + nm] = t * f
    return {k: v for k, v in d.items() if v > 1e-4}


def build_boot(B, side):
    sd = side
    nm = 'L' if sd > 0 else 'R'
    x = sd * HIP_X
    # shaft
    prof = [(0.330, 0.078, 0.078), (0.318, 0.082, 0.082), (0.285, 0.076, 0.076), (0.22, 0.070, 0.070),
            (0.16, 0.070, 0.074), (0.12, 0.072, 0.078)]
    rings = [dict(c=Vector((x, 0.004, 0.330)), rx=0, ry=0, pole=True)]
    rings[0]['c'] = Vector((x, 0.004, 0.322))
    for z, rx, ry in prof:
        rings.append(dict(c=Vector((x, 0.004, z)), rx=rx, ry=ry, n=(2.0, 2.0)))
    rings.append(dict(c=Vector((x, 0.01, 0.075)), rx=0, ry=0, pole=True))
    w = lambda i, k, p: leg_w(nm, p.z)
    B.loft('boot_shaft_' + nm, rings, 16, 400, 400, w, ex0=BACK)
    # foot shell along -Y.  ring semi-axes: rx = vertical half height (ex = down), ry = half width (ey = +X)
    fprof = [  # y, centre z, half height, half width
        (0.105, 0.062, 0.058, 0.050), (0.085, 0.064, 0.062, 0.062), (0.040, 0.066, 0.066, 0.068),
        (-0.020, 0.062, 0.062, 0.071), (-0.090, 0.056, 0.056, 0.073), (-0.150, 0.050, 0.050, 0.068),
        (-0.205, 0.043, 0.043, 0.056), (-0.230, 0.040, 0.035, 0.040)]
    rings = [dict(c=Vector((x, 0.118, 0.062)), rx=0, ry=0, pole=True)]
    for y, cz, hh, hw in fprof:
        rings.append(dict(c=Vector((x, y, cz)), rx=hh, ry=hw, n=(3.2, 2.0)))
    rings.append(dict(c=Vector((x, -0.243, 0.040)), rx=0, ry=0, pole=True))
    def wf(i, k, p):
        return leg_w(nm, p.z) if p.z > 0.09 else {'foot.' + nm: 1.0}
    B.loft('boot_foot_' + nm, rings, 16, 400, 400, wf, ex0=Vector((0, 0, -1)))


# ---------------------------------------------------------------- arms
def arm_solution(side):
    S = Vector((side * SHOULDER_X, 0, SHOULDER_Z))
    Wp = wrist_pos(side)
    E, end, perp = solve_two_bone(S, Wp, UPPER_LEN, FORE_LEN, ARM_POLE[side])
    return S, E, Wp, perp


def smooth_polyline(pts, radius, step):
    """Round the corners of a polyline with quadratic beziers, resample every ~step."""
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, b, c = pts[i - 1], pts[i], pts[i + 1]
        r1 = min(radius, (b - a).length * 0.45)
        r2 = min(radius, (c - b).length * 0.45)
        p0 = b + (a - b).normalized() * r1
        p2 = b + (c - b).normalized() * r2
        for t in [float(x) for x in np.linspace(0, 1, 9)]:
            out.append((1 - t) ** 2 * p0 + 2 * (1 - t) * t * b + t * t * p2)
    out.append(pts[-1])
    # dedupe & resample by arclength
    poly = [out[0]]
    for p in out[1:]:
        if (p - poly[-1]).length > 1e-6:
            poly.append(p)
    cum = [0.0]
    for i in range(1, len(poly)):
        cum.append(cum[-1] + (poly[i] - poly[i - 1]).length)
    return poly, cum


def sample_poly(poly, cum, s):
    s = clamp(s, 0, cum[-1])
    j = max(1, np.searchsorted(cum, s))
    j = min(j, len(poly) - 1)
    t = (s - cum[j - 1]) / max(cum[j] - cum[j - 1], 1e-9)
    return poly[j - 1].lerp(poly[j], t)


def build_sleeve(B, side):
    nm = 'L' if side > 0 else 'R'
    S, E, Wp, perp = arm_solution(side)
    u = (E - S).normalized()
    f = (Wp - E).normalized()
    poly, cum = smooth_polyline([S, E, Wp + f * 0.06], 0.075, 0.02)
    total = cum[-1]
    s_elbow = cum[min(range(len(poly)), key=lambda i: (poly[i] - E).length)]
    s_end = (Wp - E).length + (E - S).length - 0.015
    pitch = 0.095
    s0 = 0.07
    nb = int((s_end - s0) / pitch)
    pitch = (s_end - s0) / nb
    ss = [0.0]  # cap handled below
    ss = [0.035, s0]
    for j in range(nb):
        b = s0 + pitch * j
        ss += [b + pitch / 3, b + 2 * pitch / 3, b + pitch]
    # extra ring at the elbow so the bend has a ring on its apex
    ss = sorted(set(ss + [s_elbow]))
    def rad(s):
        return interp(s, [0, 0.20, s_elbow, s_elbow + 0.15, s_end], [0.063, 0.058, 0.054, 0.050, 0.046])
    rings = []
    r0 = rad(0)
    for ang in (0.0, 35.0, 65.0):
        a = math.radians(ang)
        rings.append(dict(c=S - u * (r0 * math.cos(a)), rx=r0 * math.sin(a), ry=r0 * math.sin(a), n=(2.0, 2.0),
                          pole=(ang == 0.0)))
    for s in ss:
        fq = quilt(s, s0, pitch, 0.085, s_end) if s >= s0 - 1e-6 else 1.0
        r = rad(s) * (1.0 if s < s0 - 1e-6 else fq)
        rings.append(dict(c=sample_poly(poly, cum, s), rx=r, ry=r, n=(2.0, 2.0)))
    rings.append(dict(c=sample_poly(poly, cum, s_end + 0.01), rx=0, ry=0, pole=True))
    # frame reference: underside of arm
    ex0 = Vector((0, 0.3, -1.0)).normalized()
    cenfn = lambda p: p

    def w(i, k, p):
        # distance along chain approximated by projection
        d1 = (p - S).dot(u)
        if d1 < 0.07:
            ch = {'upperarm.' + nm: 1.0}
            return merge_w(ch, {'chest': 1.0}, 0.6 * (1 - smoothstep(-0.05, 0.07, d1)))
        # use ring param
        s = ring_s[i]
        return chain_w(s, [s_elbow - 0.0, (E - S).length + (Wp - E).length - 0.03],
                       ['upperarm.' + nm, 'forearm.' + nm, 'hand.' + nm], [0.05, 0.03])
    ring_s = [0.0, 0.0, 0.0] + ss + [s_end + 0.01]
    info = B.loft('sleeve_' + nm, rings, 14, 420, 420, w, ex0=ex0)
    info['s'] = ss
    pinch_s = [s0 + pitch * j for j in range(nb + 1)]
    info['pinch_rings'] = [3 + ss.index(min(ss, key=lambda v: abs(v - p))) for p in pinch_s]
    ei = 3 + ss.index(s_elbow)
    info['elbow_ring'] = ei
    r = rings[ei]
    th = math.atan2(perp.dot(r['ey']), perp.dot(r['ex']))
    info['elbow_u'] = (th / TAU) % 1.0
    return info


def hand_to_world(side, l, w, n):
    L, W, N = hand_frame(side)
    O = wrist_pos(side)
    return O + L * l + W * w + N * n


def build_glove(B, side):
    nm = 'L' if side > 0 else 'R'
    L, W, N = hand_frame(side)
    O = wrist_pos(side)
    S, E, Wp, perp = arm_solution(side)
    F = (Wp - E).normalized()
    hw_ = lambda p: {'hand.' + nm: 1.0}

    def wglove(i, k, p):
        s = (p - O).dot(F)
        t = smoothstep(0.015, -0.04, s)
        return merge_w({'hand.' + nm: 1.0}, {'forearm.' + nm: 1.0}, t)
    # cuff (gauntlet) along the forearm axis
    cprof = [(-0.085, 0.050), (-0.05, 0.053), (-0.01, 0.055), (0.02, 0.050)]
    rings = [dict(c=O + F * (-0.09 + 0.0), rx=0, ry=0, pole=True)]
    for s, r in cprof:
        rings.append(dict(c=O + F * s, rx=r, ry=r * 0.93, n=(2.0, 2.0)))
    rings.append(dict(c=O + F * 0.03, rx=0, ry=0, pole=True))
    B.loft('cuff_' + nm, rings, 14, 420, 420, wglove, ex0=Vector((0, 0.3, -1)).normalized())
    # palm block along L
    P = lambda l, w_, n: hand_to_world(side, l, w_, n)
    prof = [(-0.020, 0.034, 0.020, 0.0), (0.0, 0.040, 0.019, 0.0), (0.025, 0.046, 0.018, 0.0),
            (0.050, 0.049, 0.018, 0.0), (0.066, 0.046, 0.015, -0.002)]
    rings = [dict(c=P(-0.030, 0, 0), rx=0, ry=0, pole=True)]
    for l, hw, hn, cn in prof:
        rings.append(dict(c=P(l, 0, cn), rx=hn, ry=hw, n=(2.6, 2.6), ex=N, ey=W))
    rings.append(dict(c=P(0.074, 0, -0.002), rx=0, ry=0, pole=True))
    # ex=N, ey=W: ex x ey = N x W; ensure along +L handedness
    if N.cross(W).dot(L) < 0:
        for r in rings:
            if 'ey' in r:
                r['ey'] = -W
    B.loft('palm_' + nm, rings, 12, 420, 420, wglove)
    # fingers: C-shape around the grip circle in the (l, n) plane
    Gl, Gn = GRIP_OFF_L, GRIP_OFF_N
    fw = [-0.036, -0.012, 0.012, 0.034]
    fr = [0.0128, 0.0128, 0.0122, 0.0108]
    fang = [(-75, 0.0), (-35, 0.0), (5, 0.0), (45, 0.0), (85, 0.0), (125, 0.0), (160, 0.0)]
    for fi in range(4):
        Rc = 0.0205 + fr[fi]
        pts = []
        for a, _ in fang:
            ar = math.radians(a)
            pts.append(P(Gl + Rc * math.cos(ar), fw[fi], Gn + Rc * math.sin(ar)))
        rings = [dict(c=pts[0] + (pts[0] - pts[1]).normalized() * 0.012, rx=0, ry=0, pole=True)]
        for j, p in enumerate(pts):
            t = j / (len(pts) - 1)
            r = fr[fi] * (1.0 - 0.18 * t)
            rings.append(dict(c=p, rx=r, ry=r, n=(2.0, 2.0)))
        rings.append(dict(c=pts[-1] + (pts[-1] - pts[-2]).normalized() * r * 0.9, rx=0, ry=0, pole=True))
        B.loft('finger%d_%s' % (fi, nm), rings, 8, 420, 420, wglove, ex0=W, min_w=14)
    # thumb: from the top edge of the palm, forward over the index finger
    tp = [P(-0.012, -0.050, 0.002), P(0.012, -0.056, 0.012), P(0.040, -0.054, 0.030),
          P(0.062, -0.047, 0.050), P(0.070, -0.040, 0.066)]
    rings = [dict(c=tp[0] + (tp[0] - tp[1]).normalized() * 0.012, rx=0, ry=0, pole=True)]
    rr = [0.015, 0.0145, 0.0135, 0.0125, 0.0115]
    for p, r in zip(tp, rr):
        rings.append(dict(c=p, rx=r, ry=r, n=(2.0, 2.0)))
    rings.append(dict(c=tp[-1] + (tp[-1] - tp[-2]).normalized() * 0.010, rx=0, ry=0, pole=True))
    B.loft('thumb_' + nm, rings, 8, 420, 420, wglove, ex0=W, min_w=14)


# ---------------------------------------------------------------- head & face
HEAD_RING_H = [0.0, 0.012, 0.030, 0.055, 0.085, 0.115, 0.145, 0.175, 0.205, 0.235, 0.265, 0.295, 0.322,
               0.346, 0.364, 0.376, 0.38]
HEAD_N = 28


def build_head(B):
    N = HEAD_N
    rings = []
    for h in HEAD_RING_H:
        z = CHIN_Z + h
        if h <= 0 or h >= HEAD_H:
            rings.append(dict(c=Vector((0, head_cy(h), z)), rx=0, ry=0, pole=True))
        else:
            rx = head_hw(h)
            rings.append(dict(c=Vector((0, head_cy(h), z)), rx=rx * 1.035, ry=rx, n=(2.15, 2.15)))
    thetas = [theta_of_u(k / N) for k in range(N)]
    u_of_k = [k / N for k in range(N + 1)]
    # cheeks / brow ridge / chin shaping
    def disp(i, k, p):
        z = p.z
        front = max(0.0, (-p.y + 0.02) / 0.2)
        d = Vector((0, 0, 0))
        # cheek puff
        for sx in (-1, 1):
            q = Vector((sx * 0.085, -0.15, 1.545))
            dist = (Vector((p.x, p.y, p.z)) - q).length
            if p.y < -0.05:
                d.y -= 0.011 * math.exp(-(dist / 0.055) ** 2)
        # brow ridge
        if p.y < -0.05:
            d.y -= 0.007 * math.exp(-((z - 1.682) / 0.020) ** 2) * math.exp(-(p.x / 0.11) ** 2)
        # chin
        if p.y < -0.05:
            d.y -= 0.008 * math.exp(-((z - 1.445) / 0.022) ** 2) * math.exp(-(p.x / 0.04) ** 2)
        return p + d
    info = B.loft('head', rings, N, 0, 0, lambda i, k, p: {'head': 1.0}, ex0=BACK, thetas=thetas,
                  u_of_k=u_of_k, w_px=512, disp=disp)
    # fix height to fixed 960 px/m
    info['h'] = int(round(0.38 * 1000))
    return info


def tube_along(B, name, pts, radii, N, ex0, wfn, ppm=420, nfn=(2.0, 2.0), cap=True, min_w=14, ry_scale=None):
    rings = []
    if cap:
        rings.append(dict(c=pts[0] + (pts[0] - pts[1]).normalized() * radii[0] * 0.6, rx=0, ry=0, pole=True))
    for j, (p, r) in enumerate(zip(pts, radii)):
        ry = r * (ry_scale[j] if ry_scale else 1.0)
        rings.append(dict(c=p, rx=r, ry=ry, n=nfn))
    if cap:
        rings.append(dict(c=pts[-1] + (pts[-1] - pts[-2]).normalized() * radii[-1] * 0.7, rx=0, ry=0, pole=True))
    return B.loft(name, rings, N, ppm, ppm, wfn, ex0=ex0, min_w=min_w)


def build_face_details(B):
    head_w = lambda i, k, p: {'head': 1.0}
    # nose
    fy = head_front_y(1.60)
    pts = [Vector((0, fy + 0.030, 1.640)), Vector((0, fy + 0.004, 1.626)), Vector((0, fy - 0.016, 1.610)),
           Vector((0, fy - 0.032, 1.597)), Vector((0, fy - 0.042, 1.589))]
    rr = [0.019, 0.025, 0.029, 0.0325, 0.030]
    ry = [0.95, 1.0, 1.0, 0.95, 0.88]
    # rx lateral (ex = +X), ry vertical
    rings = [dict(c=pts[0] + (pts[0] - pts[1]).normalized() * 0.01, rx=0, ry=0, pole=True)]
    for p, r, s in zip(pts, rr, ry):
        rings.append(dict(c=p, rx=r * 0.98, ry=r * s * 1.03, n=(2.0, 2.0)))
    rings.append(dict(c=pts[-1] + Vector((0, -0.016, -0.008)), rx=0, ry=0, pole=True))
    B.loft('nose', rings, 14, 420, 420, head_w, ex0=Vector((1, 0, 0)), min_w=24)
    # ears
    for sd in (+1, -1):
        nm = 'L' if sd > 0 else 'R'
        hz = 1.605
        h = hz - CHIN_Z
        x0 = head_hw(h) - 0.012
        cy = head_cy(h) + 0.012
        rings = [dict(c=Vector((sd * (x0 - 0.004), cy, hz)), rx=0, ry=0, pole=True)]
        prof = [(0.000, 0.046, 0.026), (0.012, 0.050, 0.029), (0.026, 0.047, 0.027), (0.036, 0.040, 0.022)]
        for dx, rz, ryy in prof:
            rings.append(dict(c=Vector((sd * (x0 + dx), cy, hz)), rx=rz, ry=ryy, n=(2.0, 2.0)))
        rings.append(dict(c=Vector((sd * (x0 + 0.042), cy, hz)), rx=0, ry=0, pole=True))
        B.loft('ear_' + nm, rings, 10, 420, 420, head_w, ex0=Vector((0, 1, 0)), min_w=20)
    # moustache lobes
    for sd in (+1, -1):
        nm = 'L' if sd > 0 else 'R'
        xs = [0.006, 0.026, 0.048, 0.069, 0.088, 0.101]
        zs = [1.551, 1.552, 1.548, 1.541, 1.536, 1.543]
        pts = []
        for x, z in zip(xs, zs):
            y = head_front_y(z, x) - 0.014 - 0.006 * (x < 0.05)
            pts.append(Vector((sd * x, y, z)))
        rad = [0.019, 0.023, 0.0235, 0.021, 0.0155, 0.009]
        tube_along(B, 'mous_' + nm, pts, rad, 10, Vector((0, -1, 0.2)), head_w, ry_scale=[0.8] * 6, min_w=24)
    # eyebrows
    for sd in (+1, -1):
        nm = 'L' if sd > 0 else 'R'
        xs = [0.024, 0.045, 0.066, 0.086, 0.102]
        zs = [1.686, 1.692, 1.693, 1.688, 1.675]
        pts = []
        for x, z in zip(xs, zs):
            y = head_front_y(z, x) - 0.004
            pts.append(Vector((sd * x, y, z)))
        rad = [0.0085, 0.0105, 0.0110, 0.0095, 0.0065]
        tube_along(B, 'brow_' + nm, pts, rad, 8, Vector((0, -1, 0.3)), head_w, ry_scale=[0.7] * 5, min_w=20)


# ---------------------------------------------------------------- hats
def head_r_at(z):
    h = z - CHIN_Z
    if h >= HEAD_H:
        return 0.0
    return head_hw(h)


def tilt_frame(phi):
    """Ring frame for a horizontal ring tilted about X (negative phi lowers the back)."""
    ex = Vector((0, math.cos(phi), math.sin(phi)))
    ey = Vector((-1, 0, 0))
    return ex, ey


def hat_ring(z, margin, phi, dy=0.0, sx=1.035, rmin=0.0, n=2.15):
    ex, ey = tilt_frame(phi)
    r = max(head_r_at(min(z, HEAD_TOP - 0.004)) + margin, rmin)
    return dict(c=Vector((0, head_cy(clamp(z - CHIN_Z, 0, HEAD_H)) + dy, z)), rx=r * sx, ry=r, n=(n, n), ex=ex, ey=ey)


def pole(x, y, z):
    return dict(c=Vector((x, y, z)), rx=0, ry=0, pole=True)


def build_hats(Bs):
    nowt = lambda i, k, p: {'head': 1.0}
    # ---- beanie: ribbed cuff + slightly slouchy dome
    Bb = Bs['hat_beanie']
    rings = [pole(0, 0.0, 1.684)]
    for z, m, phi in [(1.686, 0.002, -0.15), (1.694, 0.010, -0.15), (1.724, 0.0135, -0.13),
                      (1.752, 0.0125, -0.10), (1.760, 0.008, -0.09)]:
        rings.append(hat_ring(z, m, phi))
    for t in (0.18, 0.40, 0.60, 0.76, 0.89, 0.97):
        zr = 1.76 + t * 0.04
        r = hat_ring(zr, 0.0075, -0.09 * (1 - t) ** 1.5)
        r['c'] = Vector((0, r['c'].y, 1.76 + t * 0.062))
        rings.append(r)
    rings.append(pole(0, 0.008, 1.832))
    Bb.loft('hat_beanie', rings, 36, 330, 330, nowt, hat='hat_beanie', min_w=30)

    # ---- flat cap: puffy crown pushed forward + short peak
    Bc = Bs['hat_cap']
    rings = [pole(0, 0.0, 1.700)]
    for z, m, dy, phi, rr in [(1.708, 0.004, 0.0, -0.10, 0), (1.722, 0.020, -0.004, -0.10, 0),
                              (1.750, 0.036, -0.020, -0.07, 0), (1.778, 0.040, -0.034, -0.04, 0),
                              (1.799, 0.034, -0.040, -0.03, 0.115), (1.812, 0.018, -0.042, -0.02, 0.095)]:
        rings.append(hat_ring(z, m, phi, dy=dy + 0.008, sx=1.04, rmin=rr, n=2.3))
    rings.append(pole(0, -0.045, 1.820))
    Bc.loft('hat_cap_crown', rings, 32, 330, 330, nowt, hat='hat_cap', min_w=30)
    pts = []
    for x in [float(v) for v in np.linspace(-0.105, 0.105, 7)]:
        pts.append(Vector((x, head_front_y(1.712, x) - 0.030 - 0.025 * math.cos(x / 0.105 * math.pi / 2),
                           1.706 - 0.006 * (x / 0.105) ** 2)))
    rings = [dict(c=pts[0] + Vector((-0.012, 0.01, 0)), rx=0, ry=0, pole=True)]
    for j, p in enumerate(pts):
        t = abs(j - 3) / 3.0
        rings.append(dict(c=p, rx=0.0045, ry=0.050 * (1 - 0.55 * t * t), n=(2.0, 2.0),
                          ex=Vector((0, 0, 1)), ey=Vector((0, -1, 0))))
    rings.append(dict(c=pts[-1] + Vector((0.012, 0.01, 0)), rx=0, ry=0, pole=True))
    Bc.loft('hat_cap_brim', rings, 10, 420, 420, nowt, hat='hat_cap', min_w=20)

    # ---- hard hat: dome + wide rim flange + centre ridge
    Bh = Bs['hat_helmet']
    rings = [pole(0, 0.0, 1.686)]
    for z, m, dy, phi in [(1.690, 0.016, 0.0, -0.12), (1.712, 0.024, 0.0, -0.10), (1.742, 0.028, 0.0, -0.06),
                          (1.780, 0.026, 0.0, -0.03), (1.811, 0.019, 0.0, -0.01), (1.830, 0.009, 0.0, 0.0)]:
        rings.append(hat_ring(z, m, phi, dy=dy, sx=1.05, rmin=(0.05 if z > 1.82 else 0), n=2.1))
    rings.append(pole(0, 0.006, 1.843))
    Bh.loft('hat_helmet_dome', rings, 32, 330, 330, nowt, hat='hat_helmet', min_w=30)
    rings = [pole(0, -0.010, 1.700)]
    for z, m, dy in [(1.699, 0.028, -0.004), (1.691, 0.048, -0.014), (1.685, 0.050, -0.016)]:
        rings.append(hat_ring(z, m, -0.10, dy=dy, sx=1.0, n=2.3))
    rings.append(pole(0, -0.014, 1.683))
    Bh.loft('hat_helmet_rim', rings, 32, 330, 330, nowt, hat='hat_helmet', min_w=24)
    ridge = [Vector((0, -0.075, 1.814)), Vector((0, -0.035, 1.834)), Vector((0, 0.0, 1.8465)),
             Vector((0, 0.045, 1.844)), Vector((0, 0.09, 1.824))]
    tube_along(Bh, 'hat_helmet_ridge', ridge, [0.011, 0.014, 0.0155, 0.0145, 0.011], 8, Vector((1, 0, 0)), nowt,
               ry_scale=[0.55] * 5, min_w=20)
    for nm in ('hat_helmet_ridge',):
        Bh.parts[nm]['hat'] = 'hat_helmet'
