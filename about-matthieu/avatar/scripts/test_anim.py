"""Re-import the exported GLB, pose it, drive expressions, render test frames.
Run: blender -b --python test_anim.py -- avatar.glb outprefix
"""
import bpy, sys, math
from mathutils import Vector, Euler
glb, prefix = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE_NEXT"; sc.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.75, 0.75, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.4
for n, loc, e in (("k", (1.2, -2.2, 2.3), 220), ("f", (-1.8, -1.5, 1.8), 110), ("r", (0, 2, 2.2), 120)):
    ld = bpy.data.lights.new(n, "AREA"); ld.energy = e; ld.size = 2.5
    o = bpy.data.objects.new(n, ld); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 1.4)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
print("ROOT", arm.name, [o.name for o in bpy.data.objects if o.parent is None])
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
def keys(vals):
    for o in meshes:
        if not o.data.shape_keys: continue
        for k in o.data.shape_keys.key_blocks[1:]:
            k.value = vals.get(k.name, 0.0)
def pose(rot):
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"; pb.rotation_euler = rot.get(pb.name, (0, 0, 0))
cd = bpy.data.cameras.new("c"); cam = bpy.data.objects.new("c", cd); sc.collection.objects.link(cam); sc.camera = cam
head = arm.pose.bones["Head"]
def shoot(name, target, dist, lens, az, w_, h_):
    a = math.radians(az)
    cam.location = target + Vector((math.sin(a) * dist, -math.cos(a) * dist, 0.05 * dist))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler(); cd.lens = lens
    sc.render.resolution_x, sc.render.resolution_y = w_, h_
    sc.render.filepath = f"{prefix}_{name}.png"; bpy.ops.render.render(write_still=True)
bpy.context.view_layer.update()
hc = arm.matrix_world @ head.head + Vector((0, 0, 0.08))
tests = [
    ("neutral", {}, {}),
    ("aa", {"viseme_aa": 1.0}, {}),
    ("smile", {"mouthSmile": 0.8, "eyeSquintLeft": 0.3, "eyeSquintRight": 0.3}, {}),
    ("O", {"viseme_O": 1.0, "browInnerUp": 0.6}, {}),
    ("blink", {"eyesClosed": 1.0}, {}),
    ("look", {"eyeLookOutLeft": 0.8, "eyeLookInRight": 0.8, "mouthSmileLeft": 0.4}, {"Head": (0.1, 0, 0.35), "LeftEye": (0, 0, 0.3), "RightEye": (0, 0, 0.3)}),
]
for name, k, r in tests:
    keys(k); pose(r); bpy.context.view_layer.update()
    shoot("face_" + name, hc, 0.75, 85, 0 if name != "look" else 20, 480, 560)
# body pose: wave + fist + step
keys({"mouthSmile": 0.5})
pose({"RightArm": (0, 0, -1.1), "RightForeArm": (0, 0, -1.2), "LeftArm": (0, 0, 0.5), "LeftForeArm": (0.3, -0.3, 0.6),
      "LeftHandIndex1": (0.9, 0, 0), "LeftHandIndex2": (1.1, 0, 0), "LeftHandMiddle1": (0.9, 0, 0), "LeftHandMiddle2": (1.1, 0, 0),
      "LeftHandRing1": (0.9, 0, 0), "LeftHandRing2": (1.1, 0, 0), "LeftHandPinky1": (0.9, 0, 0), "LeftHandPinky2": (1.1, 0, 0),
      "LeftUpLeg": (-0.4, 0, 0), "LeftLeg": (0.6, 0, 0), "Spine1": (0.05, 0.15, 0), "Head": (0, 0, -0.2)})
bpy.context.view_layer.update()
shoot("body_pose", Vector((0, 0, 0.9)), 4.3, 50, 20, 600, 900)
print("DONE")
