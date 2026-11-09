"""Finalise a geo.Builder into a baked, exported GLB: unwrap -> bake colour + normal -> single-material export."""
import json
import math
import os
import struct
import sys
import time

import bpy  # noqa: F401  (must come before bmesh)
import bmesh  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wpn_geo as geo  # noqa: E402
import wpn_mats as mats  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT_WEAPONS = os.path.join(ROOT, 'public', 'assets', 'models', 'weapons')
OUT_MODELS = os.path.join(ROOT, 'public', 'assets', 'models')
BAKE_DIR = '/tmp/blender_cache/bakes'


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats._img_cache.clear()
    # bake / texture images from earlier scenes are gone after the factory reset
    mats._tex_cache.clear()


def log(*a):
    print('[build]', *a, flush=True)


def make_object(B, name, pat_uv=None):
    bm = B.bm
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    for e in bm.edges:
        e.smooth = True
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(40):
            e.smooth = False
    for f in bm.faces:
        f.smooth = True
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def unwrap(ob, margin=0.005, angle=66):
    me = ob.data
    if 'UVMap' not in me.uv_layers:
        me.uv_layers.new(name='UVMap')
    me.uv_layers.active = me.uv_layers['UVMap']
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.6, correct_aspect=True,
                             scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')


def _assign(ob, matmap, used):
    """One slot per zone (slot index == zone id). Never call materials.clear() here: it resets face indices."""
    first = matmap[used[0]]
    if len(ob.data.materials) == 0:
        for z in geo.ZONES:
            ob.data.materials.append(matmap.get(z, first))
    else:
        for i, z in enumerate(geo.ZONES):
            ob.material_slots[i].material = matmap.get(z, first)


def bake_maps(ob, P, res, samples, tag, do_normal=True):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    used = sorted({geo.ZONES[p.material_index] for p in ob.data.polygons}, key=geo.ZONES.index)
    os.makedirs(BAKE_DIR, exist_ok=True)
    out = {}
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    for mode in (['color', 'normal'] if do_normal else ['color']):
        t0 = time.time()
        img = bpy.data.images.new(f'{tag}_{mode}', res, res, alpha=False)
        img.colorspace_settings.name = 'sRGB' if mode == 'color' else 'Non-Color'
        mm = mats.make_materials(P, used, img, mode)
        _assign(ob, mm, used)
        if mode == 'color':
            bpy.ops.object.bake(type='EMIT', margin=8, margin_type='EXTEND', use_clear=True)
        else:
            bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=8, margin_type='EXTEND', use_clear=True)
        path = os.path.join(BAKE_DIR, f'{tag}_{mode}.png')
        img.filepath_raw = path
        img.file_format = 'PNG'
        img.save()
        out[mode] = path
        log(f'{tag}: baked {mode} {res}px @ {samples}spp in {time.time() - t0:.0f}s')
    return out


def final_material(name, maps, rough=0.9, metal=0.1):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    ct = nt.nodes.new('ShaderNodeTexImage')
    ci = bpy.data.images.load(maps['color'])
    ci.colorspace_settings.name = 'sRGB'
    ct.image = ci
    nt.links.new(ct.outputs[0], bsdf.inputs['Base Color'])
    if 'normal' in maps:
        nti = nt.nodes.new('ShaderNodeTexImage')
        ni = bpy.data.images.load(maps['normal'])
        ni.colorspace_settings.name = 'Non-Color'
        nti.image = ni
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs[0].default_value = 1.0
        nt.links.new(nti.outputs[0], nm.inputs[1])
        nt.links.new(nm.outputs[0], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    return mat


def export_glb(ob, empties, path, quality=88):
    for k, v in empties.items():
        e = bpy.data.objects.new(k, None)
        e.empty_display_type = 'PLAIN_AXES'
        e.empty_display_size = 0.02
        e.location = v
        bpy.context.scene.collection.objects.link(e)
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = ob
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
                              use_selection=True, export_image_format='JPEG', export_jpeg_quality=quality,
                              export_materials='EXPORT', export_cameras=False, export_lights=False,
                              export_vertex_color='NONE', export_extras=False, export_texcoords=True,
                              export_normals=True, export_tangents=False, export_animations=False)


def glb_info(path):
    """Pure-python GLB inspection: triangles, bounds (glTF space), nodes."""
    with open(path, 'rb') as f:
        data = f.read()
    _, _, _ = struct.unpack('<III', data[:12])
    ln, typ = struct.unpack('<II', data[12:20])
    js = json.loads(data[20:20 + ln])
    tris = 0
    bmin = [1e9] * 3
    bmax = [-1e9] * 3
    for m in js.get('meshes', []):
        for p in m['primitives']:
            tris += js['accessors'][p['indices']]['count'] // 3
            a = js['accessors'][p['attributes']['POSITION']]
            for i in range(3):
                bmin[i] = min(bmin[i], a['min'][i])
                bmax[i] = max(bmax[i], a['max'][i])
    nodes = {n.get('name'): n.get('translation') for n in js['nodes']}
    imgs = len(js.get('images', []))
    mats_n = len(js.get('materials', []))
    return {'size': os.path.getsize(path), 'tris': tris, 'min': bmin, 'max': bmax, 'nodes': nodes, 'images': imgs,
            'materials': mats_n}


def finish(name, B, palette, glb_path, res=1024, samples=32, normal=True, quality=88, rough=0.9, metal=0.1,
           unwrap_margin=0.005):
    """Complete pipeline for one asset. B: geo.Builder with geometry + empties."""
    t0 = time.time()
    tris = B.tris()
    ob = make_object(B, name)
    unwrap(ob, unwrap_margin)
    maps = bake_maps(ob, palette, res, samples, name, normal)
    mat = final_material('mat_' + name, maps, rough, metal)
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    if 'pat' in ob.data.uv_layers:
        ob.data.uv_layers.remove(ob.data.uv_layers['pat'])
    export_glb(ob, B.empties, glb_path, quality)
    info = glb_info(glb_path)
    log(f'{name}: {tris} tris built, GLB {info["size"] / 1024:.0f} KB, {info["tris"]} tris, {time.time() - t0:.0f}s total')
    return info
