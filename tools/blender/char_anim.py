import bpy, math
from mathutils import Vector, Matrix, Euler
from char_common import *
import char_rig as rigmod

def build_all(arm):
    rig = rigmod.Rig(arm)
    arm.animation_data_create()
    act = bpy.data.actions.new('idle')
    arm.animation_data.action = act
    q = {}
    for f in (0, 30, 60):
        rig.reset()
        rig.set_euler('chest', rx=2.0 * math.sin(f / 60 * 2 * math.pi))
        rigmod.key_pose(arm, rig, f, q)
    act2 = bpy.data.actions.new('run')
    arm.animation_data.action = act2
    q = {}
    for f in (0, 10, 21):
        rig.reset()
        rig.set_euler('chest', rx=10.0 * math.sin(f / 21 * 2 * math.pi))
        rigmod.key_pose(arm, rig, f, q)
