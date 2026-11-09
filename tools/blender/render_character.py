"""Verification renders of the exported character.glb (Cycles / CPU, soft overcast light, grey floor).

    /opt/blenv/bin/python tools/blender/render_character.py -- OUTDIR MODE [options]

MODE: beauty | sheet | head | hats | pose
  --glb PATH      (default public/assets/models/character.glb)
  --res N         base resolution, default 640
  --samples N     default 48
  --pose NAME:FRAME[,NAME:FRAME...] for MODE pose (e.g. run:5,slide:0)
"""
import os
import sys
import math
import numpy as np
import bpy
from mathutils import Vector, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTDIR = argv[0]
MODE = argv[1]


def opt(name, default):
    return argv[argv.index(name) + 1] if name in argv else default


GLB = opt('--glb', os.path.join(REPO, 'public', 'assets', 'models', 'character.glb'))
RES = int(opt('--res', 640))
SAMPLES = int(opt('--samples', 48))
os.makedirs(OUTDIR, exist_ok=True)


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.view_settings.view_transform = 'Standard'
    sc.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=GLB)
    # soft overcast sky + one huge soft light
    w = bpy.data.worlds.new('sky')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0.50, 0.52, 0.54, 1)
    ramp.color_ramp.elements[1].position = 0.95
    ramp.color_ramp.elements[1].color = (0.86, 0.89, 0.93, 1)
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.15
    ld = bpy.data.lights.new('softbox', 'AREA')
    ld.shape = 'DISK'
    ld.size = 7.0
    ld.energy = 900
    lo = bpy.data.objects.new('softbox', ld)
    sc.collection.objects.link(lo)
    lo.location = (-1.5, -2.5, 6.0)
    lo.rotation_euler = (math.radians(14), math.radians(-10), 0)
    fl = bpy.data.lights.new('fill', 'AREA')
    fl.shape = 'DISK'
    fl.size = 5.0
    fl.energy = 120
    fo = bpy.data.objects.new('fill', fl)
    sc.collection.objects.link(fo)
    fo.location = (3.0, -3.5, 1.6)
    fo.rotation_euler = (math.radians(80), 0, math.radians(40))
    # floor
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    fl_ = bpy.context.object
    fl_.name = 'floor'
    m = bpy.data.materials.new('floor')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.36, 0.37, 0.38, 1)
    b.inputs['Roughness'].default_value = 1.0
    fl_.data.materials.append(m)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    return sc, cam, arm


def hats_visible(which):
    for o in bpy.data.objects:
        if o.name.startswith('hat_'):
            vis = (o.name == which)
            o.hide_render = not vis
            o.hide_viewport = not vis


def set_pose(arm, name, frame):
    act = bpy.data.actions[name]
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = act
    if hasattr(ad, 'action_slot') and act.slots:
        ad.action_slot = act.slots[0]
    bpy.context.scene.frame_set(int(frame))
    bpy.context.view_layer.update()


def aim(cam, loc, target, lens=50):
    cam.location = loc
    cam.data.lens = lens
    cam.data.clip_start = 0.05
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def orbit(az, dist, zc, tgt_y=0.0):
    a = math.radians(az)
    return Vector((math.sin(a) * dist, -math.cos(a) * dist + tgt_y, zc))


def render(sc, path, w, h):
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def montage(paths, out):
    ims = []
    for p in paths:
        im = bpy.data.images.load(p)
        w, h = im.size
        ims.append(np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[:, :, :3])
    H = max(a.shape[0] for a in ims)
    ims = [np.pad(a, ((0, H - a.shape[0]), (0, 0), (0, 0)), constant_values=0.2) for a in ims]
    a = np.concatenate(ims, 1)
    h, w, _ = a.shape
    o = bpy.data.images.new('montage', w, h, alpha=False)
    o.pixels = np.concatenate([a, np.ones((h, w, 1), np.float32)], 2).ravel().tolist()
    o.filepath_raw = out
    o.file_format = 'PNG'
    o.save()


def main():
    sc, cam, arm = setup_scene()
    hat = opt('--hat', None)
    hats_visible('hat_' + hat if hat else '__none__')
    set_pose(arm, 'idle', 0)
    if MODE == 'beauty':
        paths = []
        for nm, az in (('front', 0), ('threequarter', 38), ('side', 90), ('back', 180)):
            aim(cam, orbit(az, 4.6, 1.0), (0, -0.15, 0.93), 55)
            p = os.path.join(OUTDIR, 'beauty_%s.png' % nm)
            render(sc, p, RES, int(RES * 1.25))
            paths.append(p)
        montage(paths, os.path.join(OUTDIR, 'beauty_all.png'))
    elif MODE == 'head':
        paths = []
        for nm, az in (('front', 0), ('q', 32), ('side', 80)):
            aim(cam, orbit(az, 1.15, 1.62, -0.0), (0, -0.05, 1.60), 85)
            p = os.path.join(OUTDIR, 'head_%s.png' % nm)
            render(sc, p, RES, RES)
            paths.append(p)
        montage(paths, os.path.join(OUTDIR, 'head_all.png'))
    elif MODE == 'hats':
        paths = []
        for nm in (None, 'beanie', 'cap', 'helmet'):
            hats_visible('hat_' + nm if nm else '__none__')
            aim(cam, orbit(30, 1.7, 1.66), (0, -0.03, 1.62), 85)
            p = os.path.join(OUTDIR, 'hat_%s.png' % (nm or 'none'))
            render(sc, p, RES, RES)
            paths.append(p)
        montage(paths, os.path.join(OUTDIR, 'hats_all.png'))
    elif MODE in ('pose', 'sheet'):
        poses = opt('--pose', 'run:3,slide:0,wallrun_L:4,fall:7,death:24')
        paths = []
        for item in poses.split(','):
            nm, fr = item.split(':')
            set_pose(arm, nm, fr)
            az = float(opt('--az', 40))
            hz = arm.pose.bones['hips'].head
            tgt = (0, 0.0 if nm != 'death' else 0.3, 0.95 if nm != 'death' else 0.3)
            dist = 4.6 if nm != 'death' else 5.0
            aim(cam, orbit(az, dist, 1.1 if nm != 'death' else 1.6, tgt[1]), tgt, 55)
            p = os.path.join(OUTDIR, 'pose_%s_%s.png' % (nm, fr))
            render(sc, p, RES, int(RES * 1.1))
            paths.append(p)
        montage(paths, os.path.join(OUTDIR, opt('--name', 'sheet') + '.png'))


main()
