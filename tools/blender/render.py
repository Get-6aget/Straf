"""Cycles (CPU) preview renders of exported GLBs. Run:  /opt/blenv/bin/python render.py [ids...]"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import phtex  # noqa: E402
import pipeline  # noqa: E402

OUT = '/tmp/verify/weapons'
WEAPONS = os.path.join(pipeline.OUT_WEAPONS)


def setup_world(grey=0.32, hdri_strength=0.55, rot=0.0):
    sc = bpy.context.scene
    w = bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(phtex.hdri('kloofendal_overcast_puresky'))
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs[2].default_value[2] = rot
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nt.links.new(tc.outputs['Generated'], mp.inputs[0])
    nt.links.new(mp.outputs[0], env.inputs[0])
    bg1 = nt.nodes.new('ShaderNodeBackground')
    bg1.inputs[1].default_value = hdri_strength
    nt.links.new(env.outputs[0], bg1.inputs[0])
    bg2 = nt.nodes.new('ShaderNodeBackground')
    bg2.inputs[0].default_value = (grey, grey, grey, 1)
    lp = nt.nodes.new('ShaderNodeLightPath')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs[0])
    nt.links.new(bg1.outputs[0], mix.inputs[1])
    nt.links.new(bg2.outputs[0], mix.inputs[2])
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(mix.outputs[0], out.inputs[0])


def add_light(name, loc, energy, size, target=(0, 0, 0)):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy = energy
    ld.size = size
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return ob


def mesh_bounds(objs):
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    for o in objs:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo[i], w[i]) for i in range(3)))
            hi = Vector((max(hi[i], w[i]) for i in range(3)))
    return lo, hi


def render_setup(size, samples):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = -0.6
    sc.cycles.max_bounces = 6


def render_views(glb, name, views=('R', 'L', 'Q'), size=(900, 520), samples=40, outdir=OUT):
    os.makedirs(outdir, exist_ok=True)
    pipeline.reset_scene()
    bpy.ops.import_scene.gltf(filepath=glb)
    objs = [o for o in bpy.context.scene.objects]
    lo, hi = mesh_bounds(objs)
    ctr = (lo + hi) / 2
    ext = hi - lo
    setup_world()
    render_setup(size, samples)
    sc = bpy.context.scene
    cam_d = bpy.data.cameras.new('cam')
    cam = bpy.data.objects.new('cam', cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    aspect = size[0] / size[1]
    dmax = max(ext.x, ext.y, ext.z)
    paths = {}
    for v in views:
        if v in ('R', 'L'):
            cam_d.type = 'ORTHO'
            cam_d.ortho_scale = max(ext.y * 1.12, ext.z * 1.12 * aspect, 0.2)
            sgn = 1 if v == 'R' else -1
            cam.location = ctr + Vector((sgn * 3.0, 0, 0))
            tgt = ctr
        else:  # front-left 3/4, slightly above
            cam_d.type = 'PERSP'
            cam_d.lens = 70
            cam_d.sensor_width = 36
            dist = max(dmax * 1.5, 0.5) * 1.15
            cam.location = ctr + Vector((-0.55, 0.62, 0.38)).normalized() * dist
            tgt = ctr
        d = tgt - cam.location
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        # lights follow the camera side so that the lit side is the visible one
        for o in [o for o in sc.objects if o.type == 'LIGHT']:
            bpy.data.objects.remove(o)
        s = 1 if v == 'R' else (-1 if v == 'L' else -1)
        add_light('key', ctr + Vector((s * 1.5, -0.9, 1.4)), 330, 0.8, ctr)
        add_light('fill', ctr + Vector((s * 1.4, 1.2, 0.3)), 45, 1.5, ctr)
        add_light('rim', ctr + Vector((-s * 1.4, 0.2, 1.0)), 120, 1.0, ctr)
        p = os.path.join(outdir, f'{name}_{v}.png')
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True)
        paths[v] = p
    return paths


if __name__ == '__main__':
    ids = [a for a in sys.argv[1:] if not a.startswith('--')]
    views = ('R', 'L', 'Q')
    for a in sys.argv[1:]:
        if a.startswith('--views='):
            views = tuple(a.split('=')[1])
    for i in ids:
        glb = os.path.join(WEAPONS, i + '.glb')
        print('rendering', i, flush=True)
        render_views(glb, i, views)
