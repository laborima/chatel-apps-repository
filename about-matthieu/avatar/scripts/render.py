"""Render turnaround shots of an avatar .blend.
Run: blender -b file.blend --python render.py -- outprefix [engine] [views]
views: comma list of body_front,body_side,body_34,head_front,head_left,head_right,head_34,head_back
"""
import bpy, sys, math
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
prefix = args[0]
engine = args[1] if len(args) > 1 else "EEVEE"
views = args[2].split(",") if len(args) > 2 else ["body_front", "body_34", "head_front", "head_34", "head_left", "head_right"]
res = int(args[3]) if len(args) > 3 else 900

sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE_NEXT" if engine == "EEVEE" else "CYCLES"
if engine != "EEVEE":
    sc.cycles.device = "CPU"
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
sc.render.film_transparent = False
sc.view_settings.view_transform = "Standard"
sc.view_settings.look = "AgX - Medium High Contrast" if False else "None"

world = bpy.data.worlds.new("W") if not sc.world else sc.world
sc.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (0.85, 0.85, 0.85, 1)
bg.inputs[1].default_value = 0.25

for o in list(bpy.data.objects):
    if o.name.startswith("_R_"):
        bpy.data.objects.remove(o)

def light(name, loc, energy, size=2.0):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy
    ld.size = size
    o = bpy.data.objects.new("_R_" + name, ld)
    sc.collection.objects.link(o)
    o.location = loc
    d = Vector((0, 0, 1.55)) - Vector(loc)
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

light("key", (1.5, -2.5, 2.4), 170)
light("fill", (-2.2, -1.8, 1.8), 70)
light("rim", (0.5, 2.5, 2.2), 110)

body = next(o for o in bpy.data.objects if o.name.endswith(".body"))
zs = [ (body.matrix_world @ v.co).z for v in body.data.vertices ]
top = max(zs)
import numpy as _np
_hv = _np.array([(body.matrix_world @ v.co)[:] for v in body.data.vertices if (body.matrix_world @ v.co).z > top - 0.27])
head_c = Vector(((_hv.min(0) + _hv.max(0)) / 2).tolist()); head_c.z = top - 0.105
cam_d = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("_R_cam", cam_d)
sc.collection.objects.link(cam)
sc.camera = cam

def shoot(name, az_deg, target, dist, lens, w, h):
    az = math.radians(az_deg)
    cam.location = target + Vector((math.sin(az) * dist, -math.cos(az) * dist, 0.02 * dist))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam_d.lens = lens
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.filepath = f"{prefix}_{name}.png"
    bpy.ops.render.render(write_still=True)
    print("WROTE", sc.render.filepath)

body_c = Vector((0, 0, top / 2))
for v in views:
    kind, ang = v.split("_")
    az = {"front": 0, "34": 35, "side": 90, "left": 90, "right": -90, "back": 180}[ang]
    if kind == "body":
        shoot(v, az, body_c, 4.2, 50, int(res * 0.6), res)
    else:
        shoot(v, az, head_c, 1.25, 85, int(res * 0.8), res)
