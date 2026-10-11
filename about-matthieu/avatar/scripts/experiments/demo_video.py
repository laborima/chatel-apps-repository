"""Talking demo: keyframe Oculus visemes from a French phrase + blinks + head/eye motion, render with EEVEE.
Run: blender -b export/avatar.blend --python demo_video.py -- outdir
"""
import bpy, sys, os, math, random
from mathutils import Vector
out = sys.argv[sys.argv.index("--") + 1]; os.makedirs(out, exist_ok=True)
random.seed(2)
sc = bpy.context.scene; FPS = 25; sc.render.fps = FPS
sc.render.engine = "BLENDER_EEVEE_NEXT"; sc.view_settings.view_transform = "Standard"
w = sc.world or bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.66, 0.70, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.35
for n, loc, e in (("k", (1.0, -1.8, 2.1), 160), ("f", (-1.6, -1.3, 1.8), 70), ("r", (0.3, 1.6, 2.1), 110)):
    ld = bpy.data.lights.new(n, "AREA"); ld.energy = e; ld.size = 2.0
    o = bpy.data.objects.new("_L" + n, ld); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 1.55)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
arm = bpy.data.objects["Armature"]
meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.data.shape_keys]

# --- French text -> Oculus visemes (rough grapheme rules) ---
text = "bonjour, je suis ton avatar en trois dimensions, et je peux parler !"
rules = [("ou", "U"), ("on", "O"), ("en", "aa"), ("an", "aa"), ("oi", "U"), ("eu", "E"), ("ch", "CH"), ("j", "CH"), ("g", "kk"),
         ("b", "PP"), ("p", "PP"), ("m", "PP"), ("f", "FF"), ("v", "FF"), ("d", "DD"), ("t", "DD"), ("n", "nn"), ("l", "nn"),
         ("s", "SS"), ("z", "SS"), ("r", "RR"), ("k", "kk"), ("c", "kk"), ("q", "kk"), ("x", "kk"),
         ("a", "aa"), ("e", "E"), ("i", "I"), ("y", "I"), ("o", "O"), ("u", "U")]
seq = []
i = 0
while i < len(text):
    ch = text[i]
    if ch in " ,!":
        seq.append(("sil", 0.16 if ch == " " else 0.32)); i += 1; continue
    for g, v in rules:
        if text.startswith(g, i):
            seq.append((v, 0.075 if v in ("PP", "FF", "DD", "kk", "nn", "SS", "RR", "CH") else 0.10)); i += len(g); break
    else:
        i += 1
start = 0.5
def key_shape(name, frame, value):
    for o in meshes:
        kb = o.data.shape_keys.key_blocks
        if name in kb:
            kb[name].value = value; kb[name].keyframe_insert("value", frame=frame)
VIS = ["viseme_" + v for v in ("aa", "E", "I", "O", "U", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "nn", "RR")]
t = start
for o in meshes:
    for k in o.data.shape_keys.key_blocks[1:]:
        k.value = 0; k.keyframe_insert("value", frame=1)
for v, d in seq:
    f = 1 + int(t * FPS)
    for name in VIS:
        key_shape(name, f, (0.85 if name.endswith(v) else 0.0) if v != "sil" else 0.0)
    t += d
end_t = t + 0.6
for name in VIS: key_shape(name, 1 + int(t * FPS), 0.0)
# blinks + slight smile at the end
for bt in (0.3, 2.1, 3.9, end_t - 0.2):
    f = int(bt * FPS); key_shape("eyesClosed", f, 0); key_shape("eyesClosed", f + 2, 1); key_shape("eyesClosed", f + 5, 0)
key_shape("mouthSmile", int((end_t - 1.0) * FPS), 0); key_shape("mouthSmile", int(end_t * FPS), 0.45)
key_shape("browInnerUp", int(1.0 * FPS), 0); key_shape("browInnerUp", int(1.4 * FPS), 0.35); key_shape("browInnerUp", int(2.2 * FPS), 0)
# head + eyes motion
head = arm.pose.bones["Head"]; neck = arm.pose.bones["Neck"]
for pb in (head, neck, arm.pose.bones["LeftEye"], arm.pose.bones["RightEye"]): pb.rotation_mode = "XYZ"
nkey = int(end_t * 2)
for j in range(nkey + 1):
    f = 1 + int(j * FPS / 2)
    head.rotation_euler = (random.uniform(-0.05, 0.06), 0, random.uniform(-0.12, 0.12)); head.keyframe_insert("rotation_euler", frame=f)
    neck.rotation_euler = (random.uniform(-0.03, 0.03), 0, random.uniform(-0.05, 0.05)); neck.keyframe_insert("rotation_euler", frame=f)
for j in range(int(end_t * 1.5) + 1):
    f = 1 + int(j * FPS / 1.5); g = (random.uniform(-0.06, 0.06), 0, random.uniform(-0.12, 0.12))
    for eb in ("LeftEye", "RightEye"):
        pb = arm.pose.bones[eb]; pb.rotation_euler = g; pb.keyframe_insert("rotation_euler", frame=f); pb.keyframe_insert("rotation_euler", frame=f + 3)
sc.frame_start, sc.frame_end = 1, int(end_t * FPS) + 1
bpy.context.view_layer.update()
hc = arm.matrix_world @ head.head + Vector((0, 0, 0.06))
cd = bpy.data.cameras.new("c"); cd.lens = 70; cam = bpy.data.objects.new("cam", cd); sc.collection.objects.link(cam); sc.camera = cam
cam.location = hc + Vector((0.18, -0.95, 0.02)); cam.rotation_euler = (hc - cam.location).to_track_quat("-Z", "Y").to_euler()
sc.render.resolution_x, sc.render.resolution_y = 480, 600
sc.eevee.taa_render_samples = 16
sc.render.image_settings.file_format = "PNG"; sc.render.filepath = f"{out}/f_"
print("frames", sc.frame_end, "visemes", len(seq))
bpy.ops.render.render(animation=True)
print("DONE")
