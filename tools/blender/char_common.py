"""Shared constants and small helpers for the SCHANDTAT / Кривострел character builder.

Blender convention: Z up, character faces -Y, character's left = +X.
All lengths in metres.  Rest pose = "weapon forward" hold pose (arms already holding
a two-handed weapon), legs straight.
"""
import math
import numpy as np
from mathutils import Vector, Matrix, Quaternion

# ---------------------------------------------------------------- key heights
CHIN_Z = 1.42
HEAD_H = 0.38
HEAD_TOP = CHIN_Z + HEAD_H          # 1.80
FLOOR = 0.0

HIP_X = 0.100
HIP_Z = 0.90
KNEE_Z = 0.50
ANKLE_Z = 0.105
THIGH_LEN = HIP_Z - KNEE_Z
SHIN_LEN = KNEE_Z - ANKLE_Z

SHOULDER_X = 0.200
SHOULDER_Z = 1.305
UPPER_LEN = 0.325
FORE_LEN = 0.305          # elbow -> wrist

# hold pose (right = -X side)
GRIP_R = Vector((-0.06, -0.37, 1.15))
GRIP_L = Vector((-0.06, -0.58, 1.12))
# hand frame: origin at the wrist, L = along the fingers, W = index->pinky, N = palm normal
HAND_L_AXIS = Vector((0, -1, 0))
HAND_W_AXIS = Vector((0, 0, -1))
GRIP_OFF_L = 0.050       # wrist -> grip centre along L
GRIP_OFF_N = 0.036       # wrist -> grip centre along N (towards the palm side)

BONES = ['hips', 'spine', 'chest', 'neck', 'head',
         'upperarm.L', 'forearm.L', 'hand.L', 'upperarm.R', 'forearm.R', 'hand.R',
         'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R']

# ---------------------------------------------------------------- math helpers
def V(*a):
    return Vector(a)


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def clamp(x, a, b):
    return max(a, min(b, x))


def hand_frame(side):
    """(L, W, N) unit vectors of the hand in the rest pose.
    L along the fingers, W index->pinky (down), N from the back of the hand towards the grip.
    side: +1 left hand (+X), -1 right hand."""
    L = HAND_L_AXIS.normalized()
    W = HAND_W_AXIS.normalized()
    N = L.cross(W) if side < 0 else -L.cross(W)
    return L, W, N.normalized()


def wrist_pos(side):
    grip = GRIP_L if side > 0 else GRIP_R
    L, W, N = hand_frame(side)
    return grip - L * GRIP_OFF_L - N * GRIP_OFF_N


def solve_two_bone(root, target, l1, l2, pole):
    """Return (mid, end) of a two-bone chain reaching toward target, bending toward pole dir."""
    d = target - root
    dist = d.length
    dist = clamp(dist, abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4)
    dirn = d.normalized()
    a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    perp = pole - dirn * pole.dot(dirn)
    if perp.length < 1e-6:
        perp = Vector((0, 0, 1)).cross(dirn)
    perp.normalize()
    mid = root + dirn * a + perp * h
    end = root + dirn * dist
    return mid, end, perp


ARM_POLE = {+1: Vector((0.55, 0.35, -1.0)), -1: Vector((-0.55, 0.35, -1.0))}
LEG_POLE = {+1: Vector((0.12, -1.0, 0.0)), -1: Vector((-0.12, -1.0, 0.0))}
