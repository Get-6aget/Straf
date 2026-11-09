"""Procedural animations (30 fps) for the Worker, authored with FK + 2-bone IK on the real armature.

All locomotion clips keep both arms on a two-handed weapon (carried by the `chest` bone, so pitching
`chest` at runtime aims).  No root motion: `hips` only moves up/down (and, for `death`, backwards).
"""
import math
import bpy
from mathutils import Vector, Matrix, Euler
from char_common import *
import char_rig as rigmod

FPS = 30
TAU = math.pi * 2
V3 = lambda x=0.0, y=0.0, z=0.0: Vector((x, y, z))


def ease(u):
    return u * u * (3 - 2 * u)


def lerp3(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def Rw(rx=0.0, ry=0.0, rz=0.0):
    return Euler((math.radians(rx), math.radians(ry), math.radians(rz)), 'XYZ').to_matrix()


# ------------------------------------------------------------------ pose application
def arm_hold(rig, side, off=V3(), rot=None):
    nm = 'L' if side > 0 else 'R'
    C = rig.M['chest'] @ rig.rest['chest'].inverted()
    D = C.to_3x3()
    tgt = C @ wrist_pos(side) + D @ Vector(off)
    rig.ik2('upperarm.' + nm, 'forearm.' + nm, tgt, D @ ARM_POLE[side])
    Rh = D @ rig.Rrest('hand.' + nm)
    if rot is not None:
        Rh = rot @ Rh
    rig.set_abs('hand.' + nm, Rh)


def arm_world(rig, side, pos, rot=None, pole=None):
    """Hand (wrist) target in armature space; rot rotates the rest hand orientation about world axes."""
    nm = 'L' if side > 0 else 'R'
    rig.ik2('upperarm.' + nm, 'forearm.' + nm, Vector(pos), Vector(pole) if pole is not None else ARM_POLE[side])
    Rh = rig.Rrest('hand.' + nm)
    if rot is not None:
        Rh = rot @ Rh
    rig.set_abs('hand.' + nm, Rh)


def leg(rig, side, ankle, pitch=0.0, roll=0.0, yaw=0.0, pole=None):
    nm = 'L' if side > 0 else 'R'
    rig.ik2('thigh.' + nm, 'shin.' + nm, Vector(ankle), Vector(pole) if pole is not None else LEG_POLE[side])
    R = Rw(pitch, roll, yaw) @ rig.Rrest('foot.' + nm)
    rig.set_abs('foot.' + nm, R)


def body(rig, hips=(0, 0, 0), hips_rot=(0, 0, 0), spine=(0, 0, 0), chest=(0, 0, 0), neck=(0, 0, 0), head=(0, 0, 0)):
    rig.reset()
    rig.set_euler('hips', *hips_rot)
    rig.set_loc('hips', hips)
    rig.set_euler('spine', *spine)
    rig.set_euler('chest', *chest)
    rig.set_euler('neck', *neck)
    rig.set_euler('head', *head)


ANKLE_REST = {+1: V3(HIP_X, 0, ANKLE_Z), -1: V3(-HIP_X, 0, ANKLE_Z)}


def ground_adj(p):
    """ankle height needed for a foot pitched by p degrees (+ toes down) to keep touching the floor."""
    r = math.radians(p)
    if r >= 0:
        return 0.16 * math.sin(r) - 0.045 * (1 - math.cos(r))
    return 0.10 * math.sin(-r) - 0.03 * (1 - math.cos(r))


def foot_traj(ph, A, s, h, p_land=-16.0, p_off=30.0):
    ph = ph % 1.0
    if ph < s:
        u = ph / s
        fwd = A - 2 * A * u
        lift = 0.0
        pitch = p_land * (1 - ease(min(1, u / 0.35))) + p_off * ease(max(0, (u - 0.55) / 0.45))
    else:
        u = (ph - s) / (1 - s)
        e = 0.5 - 0.5 * math.cos(math.pi * u)
        fwd = -A + 2 * A * e
        lift = h * math.sin(math.pi * u) ** 0.85
        pitch = p_off * (1 - ease(min(1, u / 0.45))) * 1.0 + p_land * ease(max(0, (u - 0.35) / 0.65))
        pitch = p_off * (1 - ease(min(1, u / 0.5))) + (p_land * ease(max(0, (u - 0.4) / 0.6)))
    return fwd, lift, pitch


# ------------------------------------------------------------------ clips
def clip_idle(rig, t):
    br = math.sin(TAU * t)
    body(rig, hips=(0.006 * math.sin(TAU * t), 0.0, -0.015 + 0.006 * br), hips_rot=(0, 1.2 * math.sin(TAU * t), 0),
         spine=(0.8 * br, 0, 0), chest=(1.4 * br, 0, 0.6 * math.sin(TAU * t)), neck=(-0.8 * br, 0, 0),
         head=(-0.6 * br, 0, 2.0 * math.sin(TAU * t + 0.6)))
    leg(rig, +1, V3(0.125, 0.01, ANKLE_Z), yaw=6)
    leg(rig, -1, V3(-0.125, -0.07, ANKLE_Z), yaw=-8)
    arm_hold(rig, +1, V3(0, 0, 0.004 * br))
    arm_hold(rig, -1, V3(0, 0, 0.004 * br))


def gait_clip(rig, t, A, s, h, drop, bounce, lean, yaw, hip_roll=2.0, stance_w=0.115, arm_bob=0.012, base_drop_dz=0.0,
              lat_in=0.0):
    sw = math.sin(TAU * t)
    cw = math.cos(TAU * t)
    bob = -bounce * (0.5 - 0.5 * math.cos(2 * TAU * t + 0.5))     # lowest at foot plant
    body(rig, hips=(0.0, 0.0, -drop + bob + 0.0),
         hips_rot=(0, hip_roll * sw, -yaw * cw), spine=(lean * 0.55, 0, 0.5 * yaw * cw),
         chest=(lean * 0.45, 0, 0.6 * yaw * cw), neck=(-lean * 0.5, 0, 0), head=(-lean * 0.35, 0, 0))
    for side in (+1, -1):
        ph = t + (0.0 if side > 0 else 0.5)
        fwd, lift, pitch = foot_traj(ph, A, s, h)
        x = side * (stance_w - lat_in * lift)
        leg(rig, side, V3(x, -fwd, ANKLE_Z + lift + ground_adj(pitch)), pitch=pitch)
    bobz = arm_bob * math.sin(2 * TAU * t + 0.8)
    arm_hold(rig, +1, V3(0, 0.004 * cw, bobz))
    arm_hold(rig, -1, V3(0, -0.004 * cw, bobz))


def clip_run(rig, t):
    gait_clip(rig, t, A=0.27, s=0.42, h=0.14, drop=0.10, bounce=0.035, lean=9, yaw=5)


def clip_sprint(rig, t):
    gait_clip(rig, t, A=0.33, s=0.36, h=0.19, drop=0.15, bounce=0.045, lean=21, yaw=8, arm_bob=0.018)


def crouch_base(rig, t, drop=0.40, dy=0.0):
    br = math.sin(TAU * t)
    body(rig, hips=(0.0, -dy, -drop + 0.004 * br), hips_rot=(10, 0, 0), spine=(14 + 1.0 * br, 0, 0),
         chest=(8 + 1.2 * br, 0, 0), neck=(-14, 0, 0), head=(-8, 0, 1.5 * math.sin(TAU * t + 0.5)))


def clip_crouch(rig, t):
    crouch_base(rig, t)
    leg(rig, +1, V3(0.135, 0.05, ANKLE_Z), yaw=6)
    leg(rig, -1, V3(-0.135, -0.12, ANKLE_Z), yaw=-8)
    br = math.sin(TAU * t)
    arm_hold(rig, +1, V3(0, 0, 0.004 * br))
    arm_hold(rig, -1, V3(0, 0, 0.004 * br))


def clip_crouch_walk(rig, t):
    sw, cw = math.sin(TAU * t), math.cos(TAU * t)
    body(rig, hips=(0.0, -0.02, -0.38 - 0.012 * (0.5 - 0.5 * math.cos(2 * TAU * t))),
         hips_rot=(10, 2 * sw, -4 * cw), spine=(14, 0, 2 * cw), chest=(8, 0, 3 * cw), neck=(-14, 0, 0), head=(-8, 0, 0))
    for side in (+1, -1):
        ph = t + (0.0 if side > 0 else 0.5)
        fwd, lift, pitch = foot_traj(ph, 0.17, 0.55, 0.07, p_land=-8, p_off=18)
        leg(rig, side, V3(side * 0.135, -fwd, ANKLE_Z + lift + ground_adj(pitch)), pitch=pitch)
    bobz = 0.006 * math.sin(2 * TAU * t)
    arm_hold(rig, +1, V3(0, 0, bobz))
    arm_hold(rig, -1, V3(0, 0, bobz))


def clip_jump(rig, t):
    # 0: push-off (legs loaded) -> 0.3: take-off extension -> 1: tucked legs
    if t < 0.3:
        u = ease(t / 0.3)
        drop = lerp3((0.13,), (0.0,), u)[0]
        ank = [V3(0.12, 0.02 - 0.05 * u, ANKLE_Z + 0.02 * u), V3(-0.12, -0.04, ANKLE_Z + 0.02 * u)]
        pitch = 40 * u
        lean = lerp3((14,), (4,), u)[0]
        pos = [lerp3((0.12, 0.02, ANKLE_Z), (0.12, 0.06, ANKLE_Z + 0.08), u), lerp3((-0.12, -0.04, ANKLE_Z), (-0.12, 0.02, ANKLE_Z + 0.08), u)]
        body(rig, hips=(0, 0, -drop), hips_rot=(0, 0, 0), spine=(lean * 0.5, 0, 0), chest=(lean * 0.5, 0, 0), neck=(-lean * 0.4, 0, 0))
        leg(rig, +1, V3(*pos[0]), pitch=pitch)
        leg(rig, -1, V3(*pos[1]), pitch=pitch)
    else:
        u = ease((t - 0.3) / 0.7)
        body(rig, hips=(0, 0, 0.0), spine=(3 + 4 * u, 0, 0), chest=(2 + 3 * u, 0, 0), neck=(-4, 0, 0))
        a = lerp3((0.12, 0.06, ANKLE_Z + 0.08), (0.13, -0.20, 0.45), u)
        b = lerp3((-0.12, 0.02, ANKLE_Z + 0.08), (-0.13, -0.10, 0.36), u)
        leg(rig, +1, V3(*a), pitch=lerp3((40,), (-5,), u)[0])
        leg(rig, -1, V3(*b), pitch=lerp3((40,), (5,), u)[0])
    arm_hold(rig, +1)
    arm_hold(rig, -1)


def clip_fall(rig, t):
    sw, cw = math.sin(TAU * t), math.cos(TAU * t)
    body(rig, hips=(0.0, 0.0, 0.0), hips_rot=(-3 + 2 * sw, 3 * cw, 2 * sw), spine=(-2, 0, 0), chest=(-3 + 1.5 * cw, 0, 2 * sw),
         neck=(3, 0, 0), head=(2 + sw, 0, 3 * cw))
    a = V3(0.15 + 0.03 * cw, -0.14 + 0.09 * sw, 0.30 + 0.05 * cw)
    b = V3(-0.15 - 0.03 * cw, -0.14 - 0.09 * sw, 0.30 - 0.05 * cw)
    leg(rig, +1, a, pitch=22 + 14 * sw, yaw=8)
    leg(rig, -1, b, pitch=22 - 14 * sw, yaw=-8)
    arm_hold(rig, +1, V3(0.012 * cw, 0.012 * sw, 0.02 * sw))
    arm_hold(rig, -1, V3(0.012 * sw, 0.010 * cw, -0.015 * sw))


def clip_slide(rig, t):
    sw, cw = math.sin(TAU * t), math.cos(TAU * t)
    hz = 0.35 - HIPS_Z + 0.006 * sw
    body(rig, hips=(0, 0.20, hz), hips_rot=(-52, 0, 0), spine=(-7, 0, 0), chest=(-6 + 1.0 * sw, 0, 0),
         neck=(30, 0, 0), head=(14, 0, 2 * cw))
    leg(rig, -1, V3(-0.11, -0.78, 0.17), pitch=-52, pole=V3(-0.1, 0.3, 1.0))
    leg(rig, +1, V3(0.19, 0.30, 0.13 + 0.01 * sw), pitch=60, roll=0, yaw=18, pole=V3(0.25, -1.0, 0.6))
    rig.fk()
    sR = rig.pos('upperarm.R')
    arm_world(rig, -1, sR + V3(0.0, -0.40, -0.06 + 0.006 * cw), rot=None, pole=V3(-0.5, 0.3, -1.0))
    sL = rig.pos('upperarm.L')
    arm_world(rig, +1, V3(0.45 + 0.02 * sw, sL.y + 0.10 + 0.03 * cw, 0.075), rot=Rw(0, -90, 0), pole=V3(0.6, 0.6, 0.0))


def clip_wallrun(rig, t, side):
    """side=+1: wall on the character's left (+X); -1: wall on the right."""
    sw, cw = math.sin(TAU * t), math.cos(TAU * t)
    bob = -0.03 * (0.5 - 0.5 * math.cos(2 * TAU * t + 0.5))
    tilt = -side * 1.0
    body(rig, hips=(-side * 0.05, 0, -0.10 + bob), hips_rot=(0, tilt * 22 + 2 * sw, -side * 0 - 5 * cw),
         spine=(6, tilt * -4, 3 * cw), chest=(4, tilt * -6, 3 * cw), neck=(-6, side * 6, 0), head=(-4, side * 10, 0))
    for sd in (+1, -1):
        ph = t + (0.0 if sd > 0 else 0.5)
        fwd, lift, pitch = foot_traj(ph, 0.22, 0.45, 0.16, p_land=-6, p_off=20)
        # feet run on the wall: lateral offset towards the wall, sole facing the wall
        wall_x = side * (0.40 - 0.07 * lift / 0.16)
        x = wall_x + (sd * side - 1) * 0.0 + (0.0 if sd == side else -side * 0.10)
        roll = -side * 82
        leg(rig, sd, V3(x, -fwd, 0.10 + 0.20 + lift * 0.0 + 0.0), pitch=pitch * 0.5, roll=roll,
            pole=V3(0.0 + side * 0.4, -1.0, 0.2))
    arm_hold(rig, +1, V3(0, 0, 0.005 * math.sin(2 * TAU * t)))
    arm_hold(rig, -1, V3(0, 0, 0.005 * math.sin(2 * TAU * t)))


def clip_mantle(rig, t):
    u = ease(t)
    hz = lerp3((-0.16,), (-0.02,), u)[0]
    hy = lerp3((-0.12,), (-0.28,), u)[0]
    body(rig, hips=(0, hy, hz), hips_rot=(20 - 8 * u, 0, 0), spine=(18 - 6 * u, 0, 0), chest=(14 - 4 * u, 0, 0), neck=(-18, 0, 0),
         head=(-12, 0, 0))
    ledge = lerp3((1.04, -0.50), (0.96, -0.40), u)
    arm_world(rig, +1, V3(0.17, ledge[1], ledge[0]), rot=Rw(0, -90, 0), pole=V3(0.7, 0.8, -0.2))
    arm_world(rig, -1, V3(-0.17, ledge[1], ledge[0]), rot=Rw(0, 90, 0), pole=V3(-0.7, 0.8, -0.2))
    # right knee comes up onto the ledge, left leg trails
    k = lerp3((0.30, -0.10, 0.50), (0.22, -0.30, 0.78), u)
    leg(rig, -1, V3(-0.13, hy + k[1] * 0.0 - 0.18 * u, 0.22 + 0.48 * u * 0.8 + 0.0), pitch=10, pole=V3(-0.2, -1.0, 0.4))
    leg(rig, +1, V3(0.12, 0.28 - 0.1 * u, 0.12 + 0.3 * (1 - u) + 0.0), pitch=45, pole=V3(0.2, -1.0, 0.0))


def clip_death(rig, t):
    # keyed poses: 0 standing hold, .22 hit-stagger, .55 falling, 1 lying on the back
    def mix(key):
        ks = [0.0, 0.22, 0.55, 1.0]
        for i in range(3):
            if t <= ks[i + 1]:
                u = ease((t - ks[i]) / (ks[i + 1] - ks[i]))
                return [a + (b - a) * u for a, b in zip(key[i], key[i + 1])]
        return list(key[3])
    # params: hips y, hips z, hips pitch, spine, chest, neck, head pitch
    P = mix([
        [0.00, -0.015, 0, 0, 0, 0, 0],
        [0.10, -0.05, -14, -6, -10, 12, 8],
        [0.36, -0.42, -48, -10, -8, 20, 14],
        [0.50, 0.17 - HIPS_Z, -90, -2, -2, 8, 6],
    ])
    body(rig, hips=(0, P[0], P[1]), hips_rot=(P[2], 0, 0), spine=(P[3], 0, 0), chest=(P[4], 0, 0), neck=(P[5], 0, 0),
         head=(P[6], 0, 0))
    w = ease(clamp(t / 0.9, 0, 1))
    leg(rig, +1, lerp3((HIP_X, 0, ANKLE_Z), (0.22, -0.28, 0.13), w) if False else V3(*lerp3((HIP_X, 0, ANKLE_Z), (0.20, -0.30 + P[0], 0.12), w)), pitch=-60 * w,
        pole=V3(0.4, -0.4, 1.0))
    leg(rig, -1, V3(*lerp3((-HIP_X, 0, ANKLE_Z), (-0.10, -0.46 + P[0], 0.14), w)), pitch=-40 * w, pole=V3(-0.2, -0.4, 1.0))
    rig.fk()
    # arms: weapon drops, arms fling out
    sL = rig.pos('upperarm.L')
    sR = rig.pos('upperarm.R')
    aw = ease(clamp((t - 0.05) / 0.85, 0, 1))
    if aw < 1e-3:
        arm_hold(rig, +1)
        arm_hold(rig, -1)
    else:
        tl = lerp3(tuple(wrist_pos(+1)), (0.55, P[0] + 0.28, 0.10), aw)
        tr = lerp3(tuple(wrist_pos(-1)), (-0.50, P[0] + 0.40, 0.10), aw)
        arm_world(rig, +1, V3(*tl), rot=Rw(0, -90 * aw, 0), pole=V3(0.6, 0.5, 0.2))
        arm_world(rig, -1, V3(*tr), rot=Rw(0, 90 * aw, 0), pole=V3(-0.6, 0.5, 0.2))


# ------------------------------------------------------------------ driver
CLIPS = [
    # name, frames, loop, fn
    ('idle', 60, True, clip_idle),
    ('run', 21, True, clip_run),
    ('sprint', 17, True, clip_sprint),
    ('crouch', 60, True, clip_crouch),
    ('crouch_walk', 27, True, clip_crouch_walk),
    ('jump', 9, False, clip_jump),
    ('fall', 30, True, clip_fall),
    ('slide', 30, True, clip_slide),
    ('wallrun_L', 21, True, lambda r, t: clip_wallrun(r, t, +1)),
    ('wallrun_R', 21, True, lambda r, t: clip_wallrun(r, t, -1)),
    ('mantle', 9, False, clip_mantle),
    ('death', 24, False, clip_death),
]


def build_all(arm, only=None):
    rig = rigmod.Rig(arm)
    arm.animation_data_create()
    for name, nframes, loop, fn in CLIPS:
        if only and name not in only:
            continue
        act = bpy.data.actions.new(name)
        arm.animation_data.action = act
        prev = {}
        for f in range(nframes + 1):
            t = f / nframes
            rig.reset()
            fn(rig, t)
            rigmod.key_pose(arm, rig, f, prev)
        act.use_frame_range = True
        act.frame_start = 0
        act.frame_end = nframes
        act.use_cyclic = bool(loop)
        for fc in act.fcurves if hasattr(act, 'fcurves') else []:
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
    # park the armature in the first clip
    arm.animation_data.action = bpy.data.actions['idle'] if 'idle' in bpy.data.actions else None
