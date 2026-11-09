"""Armature creation + a tiny numpy-free FK / two-bone IK solver used to author the animations."""
import math
import bpy
from mathutils import Vector, Matrix, Quaternion, Euler
from char_common import *
from char_geo import arm_solution


def frame(y, zhint):
    """Right-handed 3x3 with local Y = y and local Z as close to zhint as possible."""
    y = Vector(y).normalized()
    z = Vector(zhint) - y * Vector(zhint).dot(y)
    z.normalize()
    x = y.cross(z)
    return Matrix(((x.x, y.x, z.x), (x.y, y.y, z.y), (x.z, y.z, z.z)))


def build_armature():
    data = bpy.data.armatures.new('Armature')
    arm = bpy.data.objects.new('Armature', data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = data.edit_bones

    def mk(name, head, tail, zhint, parent=None, connect=False):
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        y = (Vector(tail) - Vector(head)).normalized()
        z = Vector(zhint) - y * Vector(zhint).dot(y)
        z.normalize()
        b.align_roll(z)
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        return b

    FWD = (0, -1, 0)
    mk('hips', (0, 0, 0.96), (0, 0, 1.03), FWD)
    mk('spine', (0, 0, 1.03), (0, 0, 1.17), FWD, 'hips', True)
    mk('chest', (0, 0, 1.17), (0, 0, 1.36), FWD, 'spine', True)
    mk('neck', (0, 0, 1.36), (0, 0, 1.43), FWD, 'chest', True)
    mk('head', (0, 0, 1.43), (0, 0, HEAD_TOP), FWD, 'neck', True)
    for side in (+1, -1):
        nm = 'L' if side > 0 else 'R'
        S, E, W, perp = arm_solution(side)
        L, Wv, N = hand_frame(side)
        mk('upperarm.' + nm, S, E, perp, 'chest', False)
        mk('forearm.' + nm, E, W, perp, 'upperarm.' + nm, True)
        mk('hand.' + nm, W, W + L * 0.11, N, 'forearm.' + nm, True)
        x = side * HIP_X
        mk('thigh.' + nm, (x, 0, HIP_Z), (x, 0, KNEE_Z), LEG_POLE[side], 'hips', False)
        mk('shin.' + nm, (x, 0, KNEE_Z), (x, 0, ANKLE_Z), LEG_POLE[side], 'thigh.' + nm, True)
        mk('foot.' + nm, (x, 0, ANKLE_Z), (x, -0.17, 0.05), (0, 0, 1), 'shin.' + nm, True)
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return arm


class Rig:
    """Forward kinematics + IK on the rest data of the armature (all in armature space)."""

    def __init__(self, arm):
        self.arm = arm
        self.rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in arm.data.bones}
        self.length = {b.name: b.length for b in arm.data.bones}
        self.reset()

    def reset(self):
        self.loc = {n: Vector((0, 0, 0)) for n in BONES}
        self.rot = {n: Quaternion((1, 0, 0, 0)) for n in BONES}
        self.fk()

    def basis(self, n):
        return Matrix.Translation(self.loc[n]) @ self.rot[n].to_matrix().to_4x4()

    def fk(self):
        self.M = {}
        for n in BONES:
            p = self.parent[n]
            if p is None:
                self.M[n] = self.rest[n] @ self.basis(n)
            else:
                self.M[n] = self.M[p] @ (self.rest[p].inverted() @ self.rest[n]) @ self.basis(n)

    def Rrest(self, n):
        return self.rest[n].to_3x3()

    def set_delta(self, n, D):
        """D: rotation about character axes applied in the parent's moving frame."""
        Rr = self.Rrest(n)
        self.rot[n] = (Rr.inverted() @ D @ Rr).to_quaternion()
        self.fk()

    def set_euler(self, n, rx=0.0, ry=0.0, rz=0.0):
        D = Euler((math.radians(rx), math.radians(ry), math.radians(rz)), 'XYZ').to_matrix()
        self.set_delta(n, D)

    def set_loc(self, n, world_off):
        self.loc[n] = self.Rrest(n).inverted() @ Vector(world_off)
        self.fk()

    def set_abs(self, n, Rdes):
        p = self.parent[n]
        Rr = self.Rrest(n)
        if p is None:
            B = Rr.inverted() @ Rdes
        else:
            Pp = self.M[p].to_3x3()
            Prest = self.rest[p].to_3x3()
            B = Rr.inverted() @ Prest @ Pp.inverted() @ Rdes
        self.rot[n] = B.to_quaternion()
        self.fk()

    def ik2(self, upper, lower, target, pole):
        l1 = self.length[upper]
        l2 = self.length[lower]
        root = self.M[upper].translation.copy()
        mid, end, perp = solve_two_bone(root, Vector(target), l1, l2, Vector(pole))
        self.set_abs(upper, frame(mid - root, perp))
        self.set_abs(lower, frame(end - mid, perp))
        return end

    def carried(self, n, ref):
        """3x3 that carries the rest orientation of bone n along with the pose rotation of bone ref."""
        return self.M[ref].to_3x3() @ self.Rrest(ref).inverted()

    def pos(self, n):
        return self.M[n].translation.copy()

    def tail(self, n):
        return (self.M[n] @ Vector((0, self.length[n], 0)))


def key_pose(arm, rig, frame_no, prev_q):
    """Write the rig's current pose into the armature and insert keyframes."""
    for n in BONES:
        pb = arm.pose.bones[n]
        q = rig.rot[n].copy()
        if n in prev_q:
            q.make_compatible(prev_q[n])
        prev_q[n] = q
        pb.rotation_quaternion = q
        pb.keyframe_insert('rotation_quaternion', frame=frame_no, group=n)
        if n == 'hips':
            pb.location = rig.loc[n]
            pb.keyframe_insert('location', frame=frame_no, group=n)
