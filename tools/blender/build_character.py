"""SCHANDTAT / Кривострел - build "The Worker" character GLB from scratch.

    /opt/blenv/bin/python tools/blender/build_character.py [--no-ao] [--out DIR] [--blend FILE]

Generates public/assets/models/character.glb + character_albedo.png + character_mask.png.
Fabric / leather detail comes from CC0 Poly Haven textures cached in /tmp/blender_cache.
Everything else (geometry, UVs, weights, rig, painted face / clothes, AO bake, animations) is procedural.
"""
import os
import sys
import math
import json
import time

import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))

import char_common as cc
from char_common import *
import char_geo as geo
import char_tex as tex
import char_paint as paint
import char_rig as rigmod
import char_anim as anim

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]


def arg(name, default=None, flag=False):
    if name in ARGS:
        if flag:
            return True
        return ARGS[ARGS.index(name) + 1]
    return False if flag else default


OUT = arg('--out', os.path.join(REPO, 'public', 'assets', 'models'))
BLEND = arg('--blend', '/tmp/work/character_build.blend')
DO_AO = not arg('--no-ao', flag=True)
T0 = time.time()


def log(*a):
    print('[%5.1fs]' % (time.time() - T0), *a, flush=True)


# ------------------------------------------------------------------ geometry
def build_geometry():
    reg = {}
    body = geo.Builder(reg, 'body')
    hats = {n: geo.Builder(reg, n) for n in ('hat_beanie', 'hat_cap', 'hat_helmet')}
    geo.build_head(body)
    geo.build_face_details(body)
    geo.build_neck(body)
    geo.build_collar(body)
    geo.build_torso(body)
    geo.build_pelvis(body)
    for sd in (+1, -1):
        geo.build_leg(body, sd)
        geo.build_boot(body, sd)
        geo.build_sleeve(body, sd)
        geo.build_glove(body, sd)
    geo.build_hats(hats)
    builders = [body] + list(hats.values())
    for b in builders:
        b.finish()
    reg['head']['fixed'] = True
    reg['head']['margin'] = 4
    return builders, reg


def remap_uvs(builders, reg):
    for b in builders:
        for f in b.bm.faces:
            info = reg[b.order[f[b.pl]]]
            for lp in f.loops:
                u, v = lp[b.uv].uv
                lp[b.uv].uv = ((info['x'] + u * info['w']) / tex.ATLAS, (info['y'] + v * info['h']) / tex.ATLAS)


def mark_sharp(bm, deg=58):
    lim = math.radians(deg)
    for e in bm.edges:
        e.smooth = True
        if len(e.link_faces) == 2:
            try:
                if e.calc_face_angle() > lim:
                    e.smooth = False
            except ValueError:
                pass
    for f in bm.faces:
        f.smooth = True


def make_object(b, name=None):
    mark_sharp(b.bm)
    me = bpy.data.meshes.new(name or b.objname)
    b.bm.to_mesh(me)
    ob = bpy.data.objects.new(name or b.objname, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ------------------------------------------------------------------ materials
def make_material(img, name='character'):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    tn = nt.nodes.new('ShaderNodeTexImage')
    tn.image = img
    tn.interpolation = 'Linear'
    nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Roughness'].default_value = 0.92
    bsdf.inputs['Metallic'].default_value = 0.0
    for k in ('Specular IOR Level', 'Specular'):
        if k in bsdf.inputs:
            bsdf.inputs[k].default_value = 0.15
            break
    mat.diffuse_color = (0.8, 0.8, 0.8, 1)
    return mat, tn


def bake_ao(objs_targets, other_hidden, size, samples=48, dist=0.28):
    """Bake ambient occlusion for `objs_targets` into a float image; returns HxW array (row0 = bottom)."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.world = bpy.data.worlds.new('aoworld')
    sc.world.light_settings.distance = dist
    sc.world.light_settings.use_ambient_occlusion = True if hasattr(sc.world.light_settings, 'use_ambient_occlusion') else None
    img = bpy.data.images.new('ao_bake', size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = 'Non-Color'
    mats = []
    for ob in objs_targets:
        mat = bpy.data.materials.new('aomat_' + ob.name)
        mat.use_nodes = True
        tn = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tn.image = img
        mat.node_tree.nodes.active = tn
        tn.select = True
        ob.data.materials.clear()
        ob.data.materials.append(mat)
        mats.append(mat)
    for ob in bpy.context.scene.objects:
        ob.select_set(False)
    for ob in objs_targets:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs_targets[0]
    for ob in other_hidden:
        ob.hide_render = True
    bpy.ops.object.bake(type='AO', margin=10, margin_type='EXTEND', use_clear=True)
    for ob in other_hidden:
        ob.hide_render = False
    a = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)[:, :, 0]
    bpy.data.images.remove(img)
    return a


# ------------------------------------------------------------------ main
def main():
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = 30
    sc.unit_settings.system = 'METRIC'
    log('geometry')
    builders, reg = build_geometry()
    scale = tex.layout(reg)
    log('atlas layout scale %.2f' % scale)
    remap_uvs(builders, reg)
    alb, mask = paint.paint_all(reg)
    tex.save_atlas(os.path.join(OUT, 'character_albedo.png'), alb)
    tex.save_atlas(os.path.join(OUT, 'character_mask.png'), mask)

    objs = [make_object(b) for b in builders]
    body, hat_objs = objs[0], objs[1:]
    for ob, b in zip(objs, builders):
        for n in BONES:
            ob.vertex_groups.new(name=n)
    arm = rigmod.build_armature()
    # drop vertex groups from hats (they are rigid children of the head bone)
    for h in hat_objs:
        h.vertex_groups.clear()

    # parenting
    body.parent = arm
    mod = body.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    bpy.context.view_layer.update()

    def bone_parent(ob, bone, world):
        ob.parent = arm
        ob.parent_type = 'BONE'
        ob.parent_bone = bone
        b = arm.data.bones[bone]
        pm = arm.matrix_world @ b.matrix_local @ Matrix.Translation((0, b.length, 0))
        ob.matrix_parent_inverse = pm.inverted()
        ob.matrix_basis = world

    for h in hat_objs:
        bone_parent(h, 'head', Matrix.Identity(4))
    for side in (-1, +1):
        nm = 'L' if side > 0 else 'R'
        grip = GRIP_L if side > 0 else GRIP_R
        e = bpy.data.objects.new('socket_' + nm, None)
        e.empty_display_type = 'ARROWS'
        e.empty_display_size = 0.06
        bpy.context.scene.collection.objects.link(e)
        bone_parent(e, 'hand.' + nm, Matrix.Translation(grip) @ Matrix.Rotation(math.pi, 4, 'Z'))

    # textures: AO bake
    alb_path = os.path.join(OUT, 'character_albedo.png')
    if DO_AO:
        log('baking AO')
        # materials with a dummy image are required for baking
        ao = np.ones((tex.ATLAS, tex.ATLAS), np.float32)
        hat_set = set(hat_objs)
        for h in hat_objs:
            h.hide_render = True
        a1 = bake_ao([body], [], tex.ATLAS)
        for h in hat_objs:
            h.hide_render = False
        a2 = bake_ao(hat_objs, [], tex.ATLAS)
        # merge: hats occupy their own atlas rects
        hm = np.zeros((tex.ATLAS, tex.ATLAS), bool)
        for k, p in reg.items():
            if p['builder'].objname != 'body':
                m = p['margin'] + 6
                hm[max(0, p['y'] - m):p['y'] + p['h'] + m, max(0, p['x'] - m):p['x'] + p['w'] + m] = True
        ao = np.where(hm, a2, a1)
        np.save('/tmp/work/ao.npy', ao)
        lin = np.power(np.clip(alb, 0, 1), 2.2)
        k = paint.AO_STRENGTH
        lin = lin * (1 - k * (1 - ao[:, :, None]))
        alb = np.power(np.clip(lin, 0, 1), 1 / 2.2)
        tex.save_atlas(alb_path, alb)
    for ob in objs:
        ob.data.materials.clear()
    img = bpy.data.images.load(alb_path)
    img.name = 'character_albedo'
    img.colorspace_settings.name = 'sRGB'
    mat, _ = make_material(img)
    for ob in objs:
        ob.data.materials.append(mat)

    log('animations')
    anim.build_all(arm)

    # --- export
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.update()
    glb = os.path.join(OUT, 'character.glb')
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format='GLB', export_animations=True, export_yup=True, export_apply=True,
        export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_step=1,
        export_image_format='JPEG', export_jpeg_quality=90, export_materials='EXPORT',
        export_skins=True, export_def_bones=False, export_cameras=False, export_lights=False,
        export_normals=True, export_texcoords=True, export_tangents=False, export_extras=False,
        export_optimize_animation_size=True, export_rest_position_armature=True)
    log('exported', glb, os.path.getsize(glb))
    if BLEND:
        bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    log('body triangles', tris, 'hats', [sum(len(p.vertices) - 2 for p in h.data.polygons) for h in hat_objs])


if __name__ == '__main__':
    main()
