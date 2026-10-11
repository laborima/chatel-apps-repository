"""Render the bare head from a few yaw angles and dump camera params, for landmark->mesh correspondence.
Run: blender -b file.blend --python render_corr.py -- outdir
"""
import bpy, sys, math, json
from mathutils import Vector

outdir = sys.argv[sys.argv.index("--") + 1]
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE_NEXT"
for o in bpy.data.objects:
    if o.type == "MESH" and not o.name.endswith((".body", ".high-poly", ".eyebrow001", ".eyelashes01")):
        o.hide_render = True
world = sc.world or bpy.data.worlds.new("W")
sc.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.5
ld = bpy.data.lights.new("k", "AREA"); ld.energy = 300; ld.size = 3
lo = bpy.data.objects.new("k", ld); sc.collection.objects.link(lo)
body = next(o for o in bpy.data.objects if o.name.endswith(".body"))
top = max((body.matrix_world @ v.co).z for v in body.data.vertices)
tgt = Vector((0, 0, top - 0.11))
cd = bpy.data.cameras.new("c"); cd.lens = 85; cd.sensor_width = 36; cd.sensor_fit = "HORIZONTAL"
cam = bpy.data.objects.new("c", cd); sc.collection.objects.link(cam); sc.camera = cam
W, H = 1200, 1500
sc.render.resolution_x, sc.render.resolution_y = W, H
meta = {}
for az in [0, 22, -22, 0.1]:
    pitch = -12 if az == 0.1 else 0
    a, p = math.radians(az), math.radians(pitch)
    d = 1.1
    cam.location = tgt + Vector((math.sin(a) * math.cos(p) * d, -math.cos(a) * math.cos(p) * d, math.sin(p) * d))
    cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    lo.location = cam.location + Vector((0.3, -0.3, 0.5))
    lo.rotation_euler = cam.rotation_euler
    bpy.context.view_layer.update()
    name = f"corr_{az:+.1f}"
    sc.render.filepath = f"{outdir}/{name}.png"
    bpy.ops.render.render(write_still=True)
    f_px = cd.lens / cd.sensor_width * W
    meta[name] = dict(M=[list(r) for r in cam.matrix_world], f=f_px, W=W, H=H)
json.dump(meta, open(f"{outdir}/corr_meta.json", "w"))
print("DONE")
