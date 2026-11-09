"""Hard-surface modelling helpers (bmesh based) for the SCHANDTAT weapon / arm generators.

Conventions (Blender, Z-up): barrel / forward = +Y, right = +X, up = +Z. Metres.
Everything is accumulated into ONE bmesh; each face carries a *zone* (material slot id) which
the bake step turns into photo-textured, worn surfaces.
"""
import math
from contextlib import contextmanager

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ZONES = ['paint', 'paint2', 'iron', 'steel', 'brass', 'wood', 'wood2', 'grip', 'leather', 'cloth',
         'tape', 'red', 'glass', 'dark', 'jacket', 'cuff', 'rubber']
ZI = {z: i for i, z in enumerate(ZONES)}


def rotm(rot):
    return Euler(tuple(math.radians(a) for a in rot), 'XYZ').to_matrix().to_4x4()


def xform(loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    if isinstance(scale, (int, float)):
        scale = (scale, scale, scale)
    s = Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
    return Matrix.Translation(Vector(loc)) @ rotm(rot) @ s


def align_z(n):
    """Rotation matrix taking +Z to direction n."""
    n = Vector(n).normalized()
    return n.to_track_quat('Z', 'Y').to_matrix().to_4x4()


def lerp(a, b, t):
    return a + (b - a) * t


def vlerp(a, b, t):
    return Vector(a).lerp(Vector(b), t)


def line_pts(p0, p1, n):
    """n points evenly spaced from p0 to p1 inclusive."""
    p0, p1 = Vector(p0), Vector(p1)
    if n == 1:
        return [(p0 + p1) / 2]
    return [p0.lerp(p1, i / (n - 1)) for i in range(n)]


def catmull(pts, per=6, closed=False):
    """Uniform Catmull-Rom through pts -> dense list of Vectors."""
    P = [Vector(p) for p in pts]
    n = len(P)
    out = []
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = P[(i - 1) % n] if (closed or i > 0) else P[0] * 2 - P[1]
        p1 = P[i]
        p2 = P[(i + 1) % n]
        p3 = P[(i + 2) % n] if (closed or i + 2 < n) else P[-1] * 2 - P[-2]
        for k in range(per):
            t = k / per
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    if not closed:
        out.append(P[-1])
    return out


def circle_profile(r, n=6, phase=0.0, sx=1.0, sy=1.0):
    return [(math.cos(phase + 2 * math.pi * i / n) * r * sx, math.sin(phase + 2 * math.pi * i / n) * r * sy) for i in range(n)]


def rect_profile(w, h):
    return [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]


def arc_pts(cx, cy, r, a0, a1, n, sx=1.0, sy=1.0):
    """Points along an arc (degrees)."""
    return [(cx + math.cos(math.radians(lerp(a0, a1, i / (n - 1)))) * r * sx,
             cy + math.sin(math.radians(lerp(a0, a1, i / (n - 1)))) * r * sy) for i in range(n)]


class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.stack = [Matrix.Identity(4)]
        self.empties = {}

    # ---- transforms -------------------------------------------------
    @contextmanager
    def at(self, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
        self.stack.append(self.stack[-1] @ xform(loc, rot, scale))
        try:
            yield self
        finally:
            self.stack.pop()

    @contextmanager
    def at_m(self, m):
        self.stack.append(self.stack[-1] @ m)
        try:
            yield self
        finally:
            self.stack.pop()

    def sym(self, fn):
        """Run fn() once, then mirrored across X=0."""
        fn()
        self.stack.append(self.stack[-1] @ Matrix.Diagonal((-1, 1, 1, 1)))
        try:
            fn()
        finally:
            self.stack.pop()

    def world(self, p):
        return self.stack[-1] @ Vector(p)

    def empty(self, name, loc):
        self.empties[name] = tuple(self.world(loc))

    # ---- bookkeeping ---------------------------------------------------
    def tris(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)

    def _commit(self, t, M, zone):
        Mw = self.stack[-1] @ M
        flip = Mw.determinant() < 0
        zi = ZI[zone]
        vm = {}
        for v in t.verts:
            vm[v] = self.bm.verts.new(Mw @ v.co)
        for f in t.faces:
            vs = [vm[v] for v in f.verts]
            if flip:
                vs.reverse()
            try:
                nf = self.bm.faces.new(vs)
            except ValueError:
                continue
            nf.material_index = zi
            nf.smooth = True
        t.free()

    @staticmethod
    def _bevel(t, w, seg=1, ang=35):
        if w <= 0:
            return
        es = [e for e in t.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(ang)]
        if es:
            bmesh.ops.bevel(t, geom=es, offset=w, offset_type='OFFSET', profile=0.5, segments=seg,
                            affect='EDGES', clamp_overlap=True, loop_slide=True)

    @staticmethod
    def _recalc(t):
        bmesh.ops.recalc_face_normals(t, faces=t.faces[:])

    # ---- primitives ------------------------------------------------------
    def box(self, size, loc=(0, 0, 0), rot=(0, 0, 0), zone='paint', bv=0.002, seg=1, taper=None):
        """Axis-aligned (before rot) box. taper=(sx, sz) scales the +Y end."""
        t = bmesh.new()
        bmesh.ops.create_cube(t, size=1.0)
        for v in t.verts:
            x, y, z = v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]
            if taper and y > 0:
                x *= taper[0]
                z *= taper[1]
            v.co = Vector((x, y, z))
        self._bevel(t, bv, seg)
        self._recalc(t)
        self._commit(t, xform(loc, rot), zone)

    def bx(self, x, y, z, zone='paint', bv=0.002, seg=1, rot=(0, 0, 0), taper=None):
        """Box from extents ((x0,x1),(y0,y1),(z0,z1))."""
        size = (x[1] - x[0], y[1] - y[0], z[1] - z[0])
        loc = ((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2)
        self.box(size, loc, rot, zone, bv, seg, taper)

    def prism(self, pts, plane='YZ', a=-0.01, b=0.01, zone='paint', bv=0.002, seg=1, b_scale=1.0,
              loc=(0, 0, 0), rot=(0, 0, 0)):
        """Polygon (list of (p,q)) extruded between a and b along the plane normal.
        plane YZ -> extrude along X; XZ -> along Y; XY -> along Z."""
        t = bmesh.new()

        def P(p, q, w):
            if plane == 'YZ':
                return Vector((w, p, q))
            if plane == 'XZ':
                return Vector((p, w, q))
            return Vector((p, q, w))
        cx = sum(p for p, _ in pts) / len(pts)
        cy = sum(q for _, q in pts) / len(pts)
        va = [t.verts.new(P(p, q, a)) for p, q in pts]
        vb = [t.verts.new(P(cx + (p - cx) * b_scale, cy + (q - cy) * b_scale, b)) for p, q in pts]
        n = len(pts)
        t.faces.new(va)
        t.faces.new(vb[::-1])
        for i in range(n):
            j = (i + 1) % n
            t.faces.new([va[i], va[j], vb[j], vb[i]])
        self._recalc(t)
        self._bevel(t, bv, seg)
        self._recalc(t)
        self._commit(t, xform(loc, rot), zone)

    def lathe(self, profile, axis='Y', loc=(0, 0, 0), rot=(0, 0, 0), segs=12, zone='iron', scale=(1, 1),
              phase=0.0, cap=True, offset=0.0):
        """Surface of revolution. profile = [(radius, t)] walked 'up the outside' from the lower end to the
        upper end (t increasing). axis: local axis the profile runs along."""
        prof = list(profile)
        if cap:
            if prof[0][0] > 1e-9:
                prof.insert(0, (0.0, prof[0][1]))
            if prof[-1][0] > 1e-9:
                prof.append((0.0, prof[-1][1]))
        t = bmesh.new()
        rings = []
        for r, h in prof:
            if r <= 1e-9:
                rings.append([t.verts.new((0, 0, h))])
            else:
                rings.append([t.verts.new((math.cos(phase + 2 * math.pi * j / segs) * r * scale[0],
                                           math.sin(phase + 2 * math.pi * j / segs) * r * scale[1], h))
                              for j in range(segs)])
        for i in range(len(prof) - 1):
            ra, rb = rings[i], rings[i + 1]
            for j in range(segs):
                j2 = (j + 1) % segs
                if len(ra) == 1 and len(rb) == 1:
                    continue
                if len(ra) == 1:
                    t.faces.new([ra[0], rb[j2], rb[j]])
                elif len(rb) == 1:
                    t.faces.new([ra[j], ra[j2], rb[0]])
                else:
                    t.faces.new([ra[j], ra[j2], rb[j2], rb[j]])
        if axis == 'Y':
            M = rotm((-90, 0, 0))
        elif axis == 'X':
            M = rotm((0, 90, 0))
        else:
            M = Matrix.Identity(4)
        self._commit(t, xform(loc, rot) @ M, zone)

    def cyl(self, r, length, axis='Y', loc=(0, 0, 0), ch=0.0015, segs=12, zone='iron', rot=(0, 0, 0),
            scale=(1, 1), phase=0.0):
        h = length / 2
        ch = min(ch, r * 0.45, h * 0.9)
        if ch > 0:
            prof = [(r - ch, -h), (r, -h + ch), (r, h - ch), (r - ch, h)]
        else:
            prof = [(r, -h), (r, h)]
        self.lathe(prof, axis, loc, rot, segs, zone, scale, phase)

    def cone(self, r1, r2, length, axis='Y', loc=(0, 0, 0), segs=12, zone='iron', rot=(0, 0, 0), ch=0.0, phase=0.0,
             scale=(1, 1)):
        h = length / 2
        prof = [(r1, -h), (r2, h)] if ch <= 0 else [(r1 - ch, -h), (r1, -h + ch), (r2, h - ch), (r2 - ch, h)]
        self.lathe(prof, axis, loc, rot, segs, zone, scale, phase)

    def sphere(self, r, loc=(0, 0, 0), scale=(1, 1, 1), segs=10, rings=6, zone='iron', rot=(0, 0, 0)):
        prof = [(math.sin(math.pi * k / rings) * r, -math.cos(math.pi * k / rings) * r) for k in range(1, rings)]
        prof = [(0.0, -r)] + prof + [(0.0, r)]
        t = bmesh.new()
        rg = []
        for rr, h in prof:
            if rr <= 1e-9:
                rg.append([t.verts.new((0, 0, h))])
            else:
                rg.append([t.verts.new((math.cos(2 * math.pi * j / segs) * rr, math.sin(2 * math.pi * j / segs) * rr, h))
                           for j in range(segs)])
        for i in range(len(prof) - 1):
            ra, rb = rg[i], rg[i + 1]
            for j in range(segs):
                j2 = (j + 1) % segs
                if len(ra) == 1:
                    t.faces.new([ra[0], rb[j2], rb[j]])
                elif len(rb) == 1:
                    t.faces.new([ra[j], ra[j2], rb[0]])
                else:
                    t.faces.new([ra[j], ra[j2], rb[j2], rb[j]])
        self._commit(t, xform(loc, rot, scale), zone)

    def sweep(self, path, profile, zone='iron', closed=False, up=None, scales=None, caps=True, bv=0.0, seg=1,
              profile_fn=None):
        """Extrude a closed 2D profile along a polyline. scales[i] may be a float or (sx, sy)."""
        P = [Vector(p) for p in path]
        n = len(P)
        T = []
        for i in range(n):
            a = P[(i - 1) % n] if (closed or i > 0) else P[i]
            b = P[(i + 1) % n] if (closed or i < n - 1) else P[i]
            d = b - a
            T.append(d.normalized() if d.length > 1e-9 else Vector((0, 1, 0)))
        frames = []
        if up is None:
            ref = Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0))
            N0 = (ref - T[0] * ref.dot(T[0])).normalized()
            Nprev = N0
            for i in range(n):
                Ni = Nprev - T[i] * Nprev.dot(T[i])
                Ni = Ni.normalized() if Ni.length > 1e-9 else N0
                frames.append((Ni, T[i].cross(Ni)))
                Nprev = Ni
        else:
            for i in range(n):
                u = Vector(up(i, P[i], T[i]))
                Ni = u - T[i] * u.dot(T[i])
                Ni = Ni.normalized()
                frames.append((Ni, T[i].cross(Ni)))
        t = bmesh.new()
        rings = []
        m = len(profile)
        for i in range(n):
            s = scales[i] if scales else 1.0
            sx, sy = (s, s) if isinstance(s, (int, float)) else s
            prof = profile_fn(i) if profile_fn else profile
            N, B = frames[i]
            rings.append([t.verts.new(P[i] + N * (u * sx) + B * (v * sy)) for u, v in prof])
        last = n if closed else n - 1
        for i in range(last):
            i2 = (i + 1) % n
            for j in range(m):
                j2 = (j + 1) % m
                try:
                    t.faces.new([rings[i][j], rings[i][j2], rings[i2][j2], rings[i2][j]])
                except ValueError:
                    pass
        if not closed and caps:
            t.faces.new(rings[0])
            t.faces.new(rings[-1][::-1])
        self._recalc(t)
        if bv > 0:
            self._bevel(t, bv, seg)
            self._recalc(t)
        self._commit(t, Matrix.Identity(4), zone)

    def tube_path(self, pts, r, zone='iron', segs=6, per=6, closed=False, scales=None):
        path = catmull(pts, per, closed)
        self.sweep(path, circle_profile(r, segs), zone, closed=closed, scales=scales)

    def torus(self, R, r, axis='Y', loc=(0, 0, 0), major=16, minor=6, zone='iron', rot=(0, 0, 0), arc=None):
        """Ring of radius R (tube radius r) lying around `axis`. arc=(a0,a1) degrees for open arcs."""
        if arc is None:
            path = [(math.cos(2 * math.pi * i / major) * R, math.sin(2 * math.pi * i / major) * R, 0) for i in range(major)]
            closed = True
        else:
            path = [(math.cos(math.radians(lerp(arc[0], arc[1], i / (major - 1)))) * R,
                     math.sin(math.radians(lerp(arc[0], arc[1], i / (major - 1)))) * R, 0) for i in range(major)]
            closed = False
        if axis == 'Y':
            M = rotm((-90, 0, 0))
        elif axis == 'X':
            M = rotm((0, 90, 0))
        else:
            M = Matrix.Identity(4)
        with self.at_m(xform(loc, rot) @ M):
            self.sweep(path, circle_profile(r, minor), zone, closed=closed,
                       up=(lambda i, p, tg: Vector((0, 0, 1))))

    def helix(self, r, length, turns, wire, zone='iron', per_turn=8, axis='Y', loc=(0, 0, 0), rot=(0, 0, 0), minor=4,
              band=None):
        """Coil spring around local axis. band=(axial_w, radial_t) makes a flat ribbon instead of a round wire."""
        n = int(turns * per_turn) + 1
        path = [(math.cos(2 * math.pi * i / per_turn) * r, math.sin(2 * math.pi * i / per_turn) * r,
                 -length / 2 + length * i / (n - 1)) for i in range(n)]
        if axis == 'Y':
            M = rotm((-90, 0, 0))
        elif axis == 'X':
            M = rotm((0, 90, 0))
        else:
            M = Matrix.Identity(4)
        if band:
            prof = rect_profile(band[1], band[0])
            upf = (lambda i, p, tg: Vector((p.x, p.y, 0)))
        else:
            prof = circle_profile(wire, minor)
            upf = None
        with self.at_m(xform(loc, rot) @ M):
            self.sweep(path, prof, zone, up=upf)

    def rivet(self, p, n=(0, 0, 1), r=0.004, h=0.003, zone='iron', segs=6):
        prof = [(r, 0.0), (r, h * 0.45), (r * 0.7, h * 0.9), (r * 0.3, h)]
        t = bmesh.new()
        ring = []
        for rr, hh in prof:
            ring.append([t.verts.new((math.cos(2 * math.pi * j / segs) * rr, math.sin(2 * math.pi * j / segs) * rr, hh)) for j in range(segs)])
        top = t.verts.new((0, 0, h * 1.05))
        for i in range(len(prof) - 1):
            for j in range(segs):
                j2 = (j + 1) % segs
                t.faces.new([ring[i][j], ring[i][j2], ring[i + 1][j2], ring[i + 1][j]])
        for j in range(segs):
            t.faces.new([ring[-1][j], ring[-1][(j + 1) % segs], top])
        self._commit(t, Matrix.Translation(Vector(p)) @ align_z(n), zone)

    def bolt(self, p, n=(0, 0, 1), r=0.005, h=0.003, zone='iron'):
        """Hex bolt head."""
        prof = [(r * 0.92, 0.0), (r, h * 0.2), (r, h * 0.85), (r * 0.8, h)]
        self.lathe(prof, 'Z', loc=(0, 0, 0), segs=6, zone=zone, cap=True) if False else None
        t = bmesh.new()
        segs = 6
        ring = []
        for rr, hh in prof:
            ring.append([t.verts.new((math.cos(2 * math.pi * j / segs) * rr, math.sin(2 * math.pi * j / segs) * rr, hh)) for j in range(segs)])
        for i in range(len(prof) - 1):
            for j in range(segs):
                j2 = (j + 1) % segs
                t.faces.new([ring[i][j], ring[i][j2], ring[i + 1][j2], ring[i + 1][j]])
        t.faces.new(ring[-1][::-1] if False else ring[-1])
        self._recalc(t)
        self._commit(t, Matrix.Translation(Vector(p)) @ align_z(n), zone)

    def rivets(self, pts, n=(0, 0, 1), **kw):
        for p in pts:
            self.rivet(p, n, **kw)

    # ---- sub-builders & booleans -------------------------------------------
    def sub(self):
        return Builder()

    def merge(self, other, zone=None):
        """Add another builder's geometry (current transform)."""
        t = other.bm
        vm = {}
        Mw = self.stack[-1]
        flip = Mw.determinant() < 0
        for v in t.verts:
            vm[v] = self.bm.verts.new(Mw @ v.co)
        for f in t.faces:
            vs = [vm[v] for v in f.verts]
            if flip:
                vs.reverse()
            try:
                nf = self.bm.faces.new(vs)
            except ValueError:
                continue
            nf.material_index = f.material_index if zone is None else ZI[zone]
            nf.smooth = True
        other.bm.free()

    def cut(self, target, cutters, bv=0.0015, seg=1, solver='EXACT', cutter_zone=None):
        """Boolean difference. target/cutters are sub-Builders (already filled); result is merged here."""
        scene = bpy.context.scene

        def mk(bld, name):
            me = bpy.data.meshes.new(name)
            bld.bm.to_mesh(me)
            ob = bpy.data.objects.new(name, me)
            scene.collection.objects.link(ob)
            return ob
        to = mk(target, 'cut_target')
        objs = [to]
        if not isinstance(cutters, (list, tuple)):
            cutters = [cutters]
        for i, c in enumerate(cutters):
            if cutter_zone:
                for f in c.bm.faces:
                    f.material_index = ZI[cutter_zone]
            co = mk(c, f'cut_c{i}')
            objs.append(co)
            md = to.modifiers.new(f'b{i}', 'BOOLEAN')
            md.operation = 'DIFFERENCE'
            md.object = co
            md.solver = solver
        dg = bpy.context.evaluated_depsgraph_get()
        dg.update()
        ev = to.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev)
        t = bmesh.new()
        t.from_mesh(me)
        bpy.data.meshes.remove(me)
        for o in objs:
            m = o.data
            bpy.data.objects.remove(o)
            bpy.data.meshes.remove(m)
        target.bm.free()
        for c in cutters:
            c.bm.free()
        self._recalc(t)
        if bv > 0:
            self._bevel(t, bv, seg, ang=30)
            self._recalc(t)
        # keep per-face zone from the evaluated mesh
        Mw = self.stack[-1]
        flip = Mw.determinant() < 0
        vm = {v: self.bm.verts.new(Mw @ v.co) for v in t.verts}
        for f in t.faces:
            vs = [vm[v] for v in f.verts]
            if flip:
                vs.reverse()
            try:
                nf = self.bm.faces.new(vs)
            except ValueError:
                continue
            nf.material_index = f.material_index
            nf.smooth = True
        t.free()
