"""Architectural kit for building SCHANDTAT maps in Blender (bpy, headless).

Every helper creates real geometry (bevelled, world-UV-mapped) and, where it
matters for gameplay, a simple collider. Colliders are exported in three.js
coordinates (x, y-up, z = -blender_y) as boxes, ramps and vertical cylinders.
"""
import json
import math
import os

import bpy  # noqa: F401  (must precede bmesh)
import bmesh

import numpy as np
from mathutils import Matrix, Vector

CACHE = '/tmp/blender_cache/tex'

# material key -> (Poly Haven texture id, metres per texture tile, tint, roughness)
MATERIALS = {
    'pavers':   ('concrete_pavement', 4.0, (0.92, 0.94, 0.88)),
    'tiles':    ('large_grey_tiles', 2.5, (0.95, 0.97, 0.92)),
    'wall':     ('concrete_slab_wall', 3.0, (0.95, 0.98, 0.92)),
    'wall2':    ('concrete_wall_004', 3.5, (0.92, 0.95, 0.88)),
    'trim':     ('brushed_concrete', 2.0, (0.85, 0.87, 0.82)),
    'stone':    ('castle_wall_slates', 3.0, (0.95, 0.97, 0.9)),
    'cast':     ('concrete_layers', 3.0, (0.95, 0.97, 0.92)),
    'plaster':  ('grey_plaster', 3.0, (0.92, 0.95, 0.88)),
    'corr':     ('rusty_corrugated_iron', 2.0, (0.85, 0.8, 0.75)),
    'wood':     ('brown_planks_05', 2.0, (0.85, 0.78, 0.7)),
    'rust':     ('rusty_metal_02', 1.5, (0.8, 0.78, 0.74)),
    'worn':     ('concrete_floor_worn_001', 3.0, (0.9, 0.92, 0.86)),
    'moss':     ('concrete_moss', 3.0, (0.95, 0.98, 0.9)),
    'dark':     (None, 1.0, (0.035, 0.038, 0.036)),
    'lamp':     (None, 1.0, (1.0, 0.92, 0.75)),
}
MAT_KEYS = list(MATERIALS.keys())


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


class Kit:
    def __init__(self, name):
        self.name = name
        self.objs = []          # static, baked, exported
        self.bg_objs = []       # background (no collision, separate lightmap)
        self.cutters = []
        self.colliders = []
        self.spawns = []
        self.weapons = []
        self.mats = [self._material(k) for k in MAT_KEYS]
        self.coll = bpy.data.collections.new('level')
        bpy.context.scene.collection.children.link(self.coll)

    # ------------------------------------------------------------------ materials
    def _material(self, key):
        tex_id, _tile, tint = MATERIALS[key]
        m = bpy.data.materials.new(key)
        m.use_nodes = True
        nt = m.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        bsdf.inputs['Roughness'].default_value = 1.0
        bsdf.inputs['Specular IOR Level'].default_value = 0.15
        if key == 'lamp':
            bsdf.inputs['Emission Color'].default_value = (1.0, 0.9, 0.7, 1)
            bsdf.inputs['Emission Strength'].default_value = 25.0
        if tex_id:
            uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
            img = nt.nodes.new('ShaderNodeTexImage')
            img.image = bpy.data.images.load(os.path.join(CACHE, f'{tex_id}_diff.jpg'), check_existing=True)
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            mix.inputs[7].default_value = (*tint, 1)
            nt.links.new(uv.outputs['UV'], img.inputs['Vector'])
            nt.links.new(img.outputs['Color'], mix.inputs[6])
            nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
        else:
            bsdf.inputs['Base Color'].default_value = (*tint, 1)
        return m

    # ------------------------------------------------------------------ mesh utils
    def _obj_from_bm(self, bm, name, mat, bg=False):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(m)
        mi = MAT_KEYS.index(mat)
        for p in me.polygons:
            p.material_index = mi
        ob = bpy.data.objects.new(name, me)
        self.coll.objects.link(ob)
        (self.bg_objs if bg else self.objs).append(ob)
        return ob

    def _bevel(self, ob, width, segments=1):
        if width <= 0:
            return
        mod = ob.modifiers.new('bev', 'BEVEL')
        mod.width = width
        mod.segments = segments
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(40)
        mod.harden_normals = False
        self._apply(ob)

    def _apply(self, ob):
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        old = ob.data
        ob.modifiers.clear()
        ob.data = me
        bpy.data.meshes.remove(old)

    def _cut(self, ob, cutters):
        for c in cutters:
            mod = ob.modifiers.new('cut', 'BOOLEAN')
            mod.operation = 'DIFFERENCE'
            mod.solver = 'EXACT'
            mod.object = c
        self._apply(ob)

    # ------------------------------------------------------------------ colliders (three.js space)
    def col_box(self, x0, y0, z0, x1, y1, z1, kind='solid'):
        self.colliders.append({'t': 'box', 'min': [x0, z0, -y1], 'max': [x1, z1, -y0], 'kind': kind})

    def col_ramp(self, x0, y0, x1, y1, z_lo, z_hi, rise):
        """rise: '+x', '-x', '+y', '-y' (blender axes) direction in which the top rises."""
        axis = {'+x': ('x', 1), '-x': ('x', -1), '+y': ('z', -1), '-y': ('z', 1)}[rise]
        self.colliders.append({'t': 'ramp', 'min': [x0, z_lo, -y1], 'max': [x1, z_hi, -y0], 'axis': axis[0], 'dir': axis[1]})

    def col_cyl(self, x, y, r, z0, z1):
        self.colliders.append({'t': 'cyl', 'x': x, 'z': -y, 'r': r, 'y0': z0, 'y1': z1})

    def spawn(self, x, y, z):
        self.spawns.append([x, z, -y])

    def weapon(self, x, y, z):
        self.weapons.append([x, z, -y])

    # ------------------------------------------------------------------ primitives
    def box(self, x0, y0, z0, x1, y1, z1, mat='wall', bevel=0.03, collide=True, bg=False, name='box', cut=None):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(x1 - x0, y1 - y0, z1 - z0), verts=bm.verts)
        bmesh.ops.translate(bm, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=bm.verts)
        ob = self._obj_from_bm(bm, name, mat, bg)
        if cut:
            self._cut(ob, cut)
        self._bevel(ob, min(bevel, (x1 - x0) / 3, (y1 - y0) / 3, (z1 - z0) / 3))
        if collide:
            self.col_box(x0, y0, z0, x1, y1, z1)
        return ob

    def cylinder(self, x, y, z0, z1, r, mat='cast', seg=32, collide=True, bevel=0.02, axis='z', cap=True, name='cyl', bg=False):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=(z1 - z0))
        if axis == 'x':
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
            bmesh.ops.translate(bm, vec=((z0 + z1) / 2, x, y), verts=bm.verts)
        elif axis == 'y':
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
            bmesh.ops.translate(bm, vec=(x, (z0 + z1) / 2, y), verts=bm.verts)
        else:
            bmesh.ops.translate(bm, vec=(x, y, (z0 + z1) / 2), verts=bm.verts)
        ob = self._obj_from_bm(bm, name, mat, bg)
        self._bevel(ob, bevel)
        if collide and axis == 'z':
            self.col_cyl(x, y, r, z0, z1)
        return ob

    def cutter_box(self, x0, y0, z0, x1, y1, z1):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(x1 - x0, y1 - y0, z1 - z0), verts=bm.verts)
        bmesh.ops.translate(bm, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=bm.verts)
        me = bpy.data.meshes.new('cutter'); bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new('cutter', me)
        bpy.context.scene.collection.objects.link(ob)
        ob.hide_render = True
        self.cutters.append(ob)
        return ob

    def cutter_arch(self, cx, y0, y1, w, spring, axis='y'):
        """Opening with a round top through a wall that runs along X (axis='y' = cut through Y)."""
        r = w / 2
        parts = [self.cutter_box(cx - r, y0, -0.5, cx + r, y1, spring)]
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=r, radius2=r, depth=(y1 - y0))
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
        bmesh.ops.translate(bm, vec=(cx, (y0 + y1) / 2, spring), verts=bm.verts)
        me = bpy.data.meshes.new('cutter'); bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new('cutter', me)
        bpy.context.scene.collection.objects.link(ob)
        ob.hide_render = True
        self.cutters.append(ob)
        parts.append(ob)
        return parts

    # ------------------------------------------------------------------ architecture
    def building(self, x0, y0, x1, y1, h, mat='wall', cornice=True, plinth=True, collide=True, bg=False, cut=None, bands=()):
        """Solid block with plinth, string courses and a projecting cornice."""
        self.box(x0, y0, 0, x1, y1, h, mat, 0.04, collide, bg, 'bld', cut)
        if plinth:
            self.box(x0 - 0.08, y0 - 0.08, 0, x1 + 0.08, y1 + 0.08, 0.55, 'trim', 0.03, False, bg)
        for z in bands:
            self.box(x0 - 0.06, y0 - 0.06, z, x1 + 0.06, y1 + 0.06, z + 0.22, 'trim', 0.03, False, bg)
        if cornice:
            self.box(x0 - 0.12, y0 - 0.12, h - 0.45, x1 + 0.12, y1 + 0.12, h - 0.2, 'trim', 0.04, False, bg)
            self.box(x0 - 0.28, y0 - 0.28, h - 0.2, x1 + 0.28, y1 + 0.28, h + 0.08, 'trim', 0.05, False, bg)

    def window(self, face, u, z, w=1.2, h=1.8, depth=0.3, bars=False, bg=False):
        """Recessed window on a facade. face=(axis, coord, outward_sign, along_axis)."""
        axis, c, s = face
        cutters = []
        frame = 0.16
        if axis == 'y':   # facade plane y=c, runs along x
            cutters.append(self.cutter_box(u - w / 2, c - depth if s > 0 else c - 0.05, z, u + w / 2, c + 0.05 if s > 0 else c + depth, z + h))
            fy0, fy1 = (c, c + 0.1) if s > 0 else (c - 0.1, c)
            self.box(u - w / 2 - frame, fy0, z - frame, u + w / 2 + frame, fy1, z, 'trim', 0.02, False, bg)          # sill
            self.box(u - w / 2 - frame, fy0, z + h, u + w / 2 + frame, fy1, z + h + frame, 'trim', 0.02, False, bg)  # lintel
            self.box(u - w / 2 - frame, fy0, z, u - w / 2, fy1, z + h, 'trim', 0.02, False, bg)
            self.box(u + w / 2, fy0, z, u + w / 2 + frame, fy1, z + h, 'trim', 0.02, False, bg)
            back = c - depth if s > 0 else c + depth
            self.box(u - w / 2, back - 0.05 if s > 0 else back, z, u + w / 2, back if s > 0 else back + 0.05, z + h, 'dark', 0, False, bg)
            if bars:
                for i in range(1, 5):
                    xx = u - w / 2 + i * w / 5
                    self.cylinder(xx, back + (0.08 if s > 0 else -0.08), z, z + h, 0.018, 'rust', 6, False, 0, bg=bg)
        else:             # facade plane x=c, runs along y
            cutters.append(self.cutter_box(c - depth if s > 0 else c - 0.05, u - w / 2, z, c + 0.05 if s > 0 else c + depth, u + w / 2, z + h))
            fx0, fx1 = (c, c + 0.1) if s > 0 else (c - 0.1, c)
            self.box(fx0, u - w / 2 - frame, z - frame, fx1, u + w / 2 + frame, z, 'trim', 0.02, False, bg)
            self.box(fx0, u - w / 2 - frame, z + h, fx1, u + w / 2 + frame, z + h + frame, 'trim', 0.02, False, bg)
            self.box(fx0, u - w / 2 - frame, z, fx1, u - w / 2, z + h, 'trim', 0.02, False, bg)
            self.box(fx0, u + w / 2, z, fx1, u + w / 2 + frame, z + h, 'trim', 0.02, False, bg)
            back = c - depth if s > 0 else c + depth
            self.box(back - 0.05 if s > 0 else back, u - w / 2, z, back if s > 0 else back + 0.05, u + w / 2, z + h, 'dark', 0, False, bg)
            if bars:
                for i in range(1, 5):
                    yy = u - w / 2 + i * w / 5
                    self.cylinder(back + (0.08 if s > 0 else -0.08), yy, z, z + h, 0.018, 'rust', 6, False, 0, bg=bg)
        return cutters

    def stairs(self, x0, y0, x1, y1, z0, z1, rise, mat='trim', steps=None, collide=True):
        """Visual steps + one ramp collider (smooth to run and slide on)."""
        run = {'+x': x1 - x0, '-x': x1 - x0, '+y': y1 - y0, '-y': y1 - y0}[rise]
        n = steps or max(2, round((z1 - z0) / 0.22))
        for i in range(n):
            t0, t1 = i / n, (i + 1) / n
            top = z0 + (z1 - z0) * (i + 1) / n
            if rise == '+y':
                self.box(x0, y0 + run * t0, z0 - 0.3, x1, y1, top, mat, 0.02, False)
            elif rise == '-y':
                self.box(x0, y0, z0 - 0.3, x1, y1 - run * t0, top, mat, 0.02, False)
            elif rise == '+x':
                self.box(x0 + run * t0, y0, z0 - 0.3, x1, y1, top, mat, 0.02, False)
            else:
                self.box(x0, y0, z0 - 0.3, x1 - run * t0, y1, top, mat, 0.02, False)
            del t1
        if collide:
            self.col_ramp(x0, y0, x1, y1, z0, z1, rise)

    def ramp(self, x0, y0, x1, y1, z0, z1, rise, mat='cast'):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(x1 - x0, y1 - y0, z1 - z0), verts=bm.verts)
        bmesh.ops.translate(bm, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=bm.verts)
        for v in bm.verts:
            if v.co.z > z0 + 1e-4:
                if rise == '+x': t = (v.co.x - x0) / (x1 - x0)
                elif rise == '-x': t = (x1 - v.co.x) / (x1 - x0)
                elif rise == '+y': t = (v.co.y - y0) / (y1 - y0)
                else: t = (y1 - v.co.y) / (y1 - y0)
                v.co.z = z0 + max(0.02, (z1 - z0) * t)
        ob = self._obj_from_bm(bm, 'ramp', mat)
        self._bevel(ob, 0.02)
        self.col_ramp(x0, y0, x1, y1, z0, z1, rise)
        return ob

    def parapet(self, x0, y0, x1, y1, z, h=1.0, t=0.3, mat='wall', collide=True):
        self.box(x0, y0, z, x1, y1, z + h, mat, 0.03, collide)
        self.box(x0 - 0.06, y0 - 0.06, z + h, x1 + 0.06, y1 + 0.06, z + h + 0.12, 'trim', 0.03, False)

    def railing(self, x0, y0, x1, y1, z, h=1.0, collide=True):
        along_x = abs(x1 - x0) >= abs(y1 - y0)
        length = abs(x1 - x0) if along_x else abs(y1 - y0)
        for hh in (h, h * 0.5):
            if along_x:
                self.pipe_x(min(x0, x1), max(x0, x1), y0, z + hh, 0.03, flanges=False)
            else:
                self.pipe_y(min(y0, y1), max(y0, y1), x0, z + hh, 0.03, flanges=False)
        n = max(1, round(length / 1.5))
        for i in range(n + 1):
            t = i / n
            px, py = (x0 + (x1 - x0) * t, y0) if along_x else (x0, y0 + (y1 - y0) * t)
            self.cylinder(px, py, z, z + h, 0.04, 'rust', 8, False, 0, name='post')
        if collide:
            if along_x:
                self.col_box(min(x0, x1), y0 - 0.06, z, max(x0, x1), y0 + 0.06, z + h)
            else:
                self.col_box(x0 - 0.06, min(y0, y1), z, x0 + 0.06, max(y0, y1), z + h)

    def pipe_x(self, xa, xb, y, z, r=0.12, flanges=True, mat='rust'):
        self.cylinder(y, z, xa, xb, r, mat, 12, False, 0.0, axis='x', name='pipe')
        if flanges:
            n = max(1, int((xb - xa) / 3))
            for i in range(n + 1):
                xx = xa + (xb - xa) * i / n
                self.cylinder(y, z, xx - 0.04, xx + 0.04, r * 1.45, mat, 12, False, 0.0, axis='x', name='flange')

    def pipe_y(self, ya, yb, x, z, r=0.12, flanges=True, mat='rust'):
        self.cylinder(x, z, ya, yb, r, mat, 12, False, 0.0, axis='y', name='pipe')
        if flanges:
            n = max(1, int((yb - ya) / 3))
            for i in range(n + 1):
                yy = ya + (yb - ya) * i / n
                self.cylinder(x, z, yy - 0.04, yy + 0.04, r * 1.45, mat, 12, False, 0.0, axis='y', name='flange')

    def pipe_z(self, x, y, za, zb, r=0.1, mat='rust'):
        self.cylinder(x, y, za, zb, r, mat, 12, False, 0.0, name='pipe')
        n = max(1, int((zb - za) / 2.5))
        for i in range(n + 1):
            zz = za + (zb - za) * i / n
            self.cylinder(x, y, zz - 0.04, zz + 0.04, r * 1.45, mat, 12, False, 0.0, name='flange')

    def crate(self, x, y, z, s=1.0, rot=False):
        self.box(x - s / 2, y - s / 2, z, x + s / 2, y + s / 2, z + s, 'wood', 0.04, True, name='crate')
        # corner battens make it read as a crate
        b = 0.09
        for dx in (-1, 1):
            for dy in (-1, 1):
                cx, cy = x + dx * (s / 2 - b / 2 + 0.02), y + dy * (s / 2 - b / 2 + 0.02)
                self.box(cx - b / 2, cy - b / 2, z, cx + b / 2, cy + b / 2, z + s, 'wood', 0.015, False, name='batten')
        del rot

    def barrel(self, x, y, z=0.0):
        self.cylinder(x, y, z, z + 0.9, 0.3, 'rust', 20, True, 0.02, name='barrel')
        for hh in (0.18, 0.72):
            self.cylinder(x, y, z + hh - 0.025, z + hh + 0.025, 0.315, 'rust', 20, False, 0.0, name='hoop')

    def beam(self, a, b, w=0.25, mat='wood'):
        """Free wooden beam between two 3D points (decor)."""
        a, b = Vector(a), Vector(b)
        d = b - a
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(w, w, d.length), verts=bm.verts)
        rot = d.to_track_quat('Z', 'Y').to_matrix()
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot)
        bmesh.ops.translate(bm, vec=(a + b) / 2, verts=bm.verts)
        ob = self._obj_from_bm(bm, 'beam', mat)
        self._bevel(ob, 0.02)

    def lamp(self, x, y, z, facing):
        """Wall lamp: bracket + emissive lens."""
        dx, dy = facing
        self.box(x - 0.08, y - 0.08, z - 0.1, x + 0.08, y + 0.08, z + 0.1, 'rust', 0.01, False)
        lx, ly = x + dx * 0.25, y + dy * 0.25
        self.box(lx - 0.16, ly - 0.16, z - 0.12, lx + 0.16, ly + 0.16, z + 0.04, 'rust', 0.02, False)
        self.box(lx - 0.12, ly - 0.12, z - 0.16, lx + 0.12, ly + 0.12, z - 0.12, 'lamp', 0, False)
        light = bpy.data.lights.new('lampL', 'POINT')
        light.energy = 120
        light.color = (1.0, 0.85, 0.65)
        light.shadow_soft_size = 0.3
        lo = bpy.data.objects.new('lampL', light)
        lo.location = (lx, ly, z - 0.35)
        bpy.context.scene.collection.objects.link(lo)

    # ------------------------------------------------------------------ build steps
    def world_uvs(self, objs):
        for ob in objs:
            me = ob.data
            if not me.uv_layers:
                me.uv_layers.new(name='UVMap')
            bm = bmesh.new()
            bm.from_mesh(me)
            uv = bm.loops.layers.uv.active
            for f in bm.faces:
                tile = MATERIALS[MAT_KEYS[f.material_index]][1]
                n = f.normal
                ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
                for loop in f.loops:
                    co = ob.matrix_world @ loop.vert.co
                    if az >= ax and az >= ay:
                        u, v = co.x, co.y
                    elif ax >= ay:
                        u, v = co.y * (1 if n.x > 0 else -1), co.z
                    else:
                        u, v = co.x * (-1 if n.y > 0 else 1), co.z
                    loop[uv].uv = (u / tile, v / tile)
            bm.to_mesh(me)
            bm.free()

    def join(self, objs, name):
        bm = bmesh.new()
        for ob in objs:
            tmp = ob.data.copy()
            tmp.transform(ob.matrix_world)
            bm.from_mesh(tmp)
            bpy.data.meshes.remove(tmp)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(m)
        for ob in objs:
            bpy.data.objects.remove(ob)
        ob = bpy.data.objects.new(name, me)
        self.coll.objects.link(ob)
        for p in me.polygons:
            p.use_smooth = False
        return ob

    def finish_geometry(self):
        for c in self.cutters:
            bpy.data.objects.remove(c)
        self.world_uvs(self.objs + self.bg_objs)
        self.level = self.join(self.objs, 'level')
        self.background = self.join(self.bg_objs, 'background') if self.bg_objs else None

    def lighting(self, hdr_path, sun_dir=(0.5, -0.35, 0.8), sun_energy=3.0, sky=1.0, sun_color=(1.0, 0.96, 0.88)):
        world = bpy.data.worlds.new('world')
        bpy.context.scene.world = world
        world.use_nodes = True
        nt = world.node_tree
        env = nt.nodes.new('ShaderNodeTexEnvironment')
        env.image = bpy.data.images.load(hdr_path)
        bg = nt.nodes['Background']
        bg.inputs['Strength'].default_value = sky
        nt.links.new(env.outputs['Color'], bg.inputs['Color'])
        sun = bpy.data.lights.new('sun', 'SUN')
        sun.energy = sun_energy
        sun.angle = math.radians(6)
        sun.color = sun_color
        so = bpy.data.objects.new('sun', sun)
        so.rotation_euler = Vector(sun_dir).to_track_quat('Z', 'Y').to_euler()
        bpy.context.scene.collection.objects.link(so)

    def bake(self, ob, size, samples, out_path, scale=0.5):
        """Bake diffuse lighting (direct + indirect, no albedo) into UV channel 'lightmap'."""
        scene = bpy.context.scene
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = samples
        scene.cycles.use_denoising = False
        scene.cycles.max_bounces = 4
        scene.cycles.diffuse_bounces = 3
        scene.render.bake.margin = 6
        me = ob.data
        lm = me.uv_layers.new(name='lightmap')
        me.uv_layers.active = lm
        bpy.context.view_layer.update()
        for o in bpy.context.view_layer.objects:
            if o is None:
                continue
            o.select_set(False)
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0015, area_weight=0.0, scale_to_bounds=False)
        bpy.ops.uv.pack_islands(margin=0.002, rotate=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        img = bpy.data.images.new('LM_' + ob.name, size, size, float_buffer=True)
        added = []
        for m in self.mats:
            n = m.node_tree.nodes.new('ShaderNodeTexImage')
            n.image = img
            m.node_tree.nodes.active = n
            added.append((m, n))
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=6, use_clear=True)
        for m, n in added:
            m.node_tree.nodes.remove(n)
        px = np.empty(size * size * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(size, size, 4)[:, :, :3]
        px = denoise(px)
        enc = np.clip(px * scale, 0, 1) ** (1 / 2.2)
        out = bpy.data.images.new('LMout', size, size)
        rgba = np.concatenate([enc, np.ones((size, size, 1), np.float32)], axis=2)
        out.pixels.foreach_set(rgba.ravel())
        out.filepath_raw = out_path
        out.file_format = 'PNG'
        out.save()
        me.uv_layers.active = me.uv_layers['UVMap']
        return out_path

    def export(self, glb_path, json_path, meta):
        bpy.context.view_layer.update()
        for o in bpy.context.view_layer.objects:
            if o is None:
                continue
            o.select_set(False)
        self.level.select_set(True)
        if self.background:
            self.background.select_set(True)
        bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB', use_selection=True, export_image_format='NONE',
                                  export_materials='EXPORT', export_texcoords=True, export_normals=True, export_yup=True,
                                  export_apply=False, export_cameras=False, export_lights=False)
        meta = dict(meta)
        meta.update({'colliders': self.colliders, 'spawns': self.spawns, 'weapons': self.weapons,
                     'materials': {k: MATERIALS[k][0] for k in MAT_KEYS}})
        with open(json_path, 'w') as f:
            json.dump(meta, f, separators=(',', ':'))


def denoise(px):
    """Edge-aware smoothing of the lightmap (bake noise), cheap separable bilateral-ish blur."""
    out = px.copy()
    lum = px.mean(axis=2, keepdims=True)
    for _ in range(2):
        acc = out.copy(); wsum = np.ones_like(lum)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (2, 0), (-2, 0), (0, 2), (0, -2)):
            sh = np.roll(np.roll(out, dx, axis=1), dy, axis=0)
            shl = np.roll(np.roll(lum, dx, axis=1), dy, axis=0)
            w = np.exp(-((shl - lum) ** 2) / (2 * 0.04 ** 2)) * (0.6 if abs(dx) + abs(dy) > 1 else 1.0)
            acc += sh * w; wsum += w
        out = acc / wsum
    return out
