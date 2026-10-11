import bpy, sys, math
from mathutils import Vector
out = sys.argv[sys.argv.index("--") + 1]
sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE_NEXT"; sc.view_settings.view_transform = "Standard"
w = sc.world or bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
ld = bpy.data.lights.new("k", "AREA"); ld.energy = 120; ld.size = 2; o = bpy.data.objects.new("k", ld); sc.collection.objects.link(o); o.location = (0.3, -1.5, 1.8)
o.rotation_euler = (Vector((0, 0, 1.6)) - o.location).to_track_quat("-Z", "Y").to_euler()
for ob in bpy.data.objects:
    if ob.type == "MESH" and "glasses" in ob.name: ob.hide_render = True
body = bpy.data.objects["Avatar.body"]; kb = body.data.shape_keys.key_blocks
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
hd = arm.matrix_world @ arm.data.bones["Head"].head_local
cd = bpy.data.cameras.new("c"); cd.lens = 120; cam = bpy.data.objects.new("c", cd); sc.collection.objects.link(cam); sc.camera = cam
mouth = Vector((0, -0.10, hd.z - 0.0)) ; 
vs = [body.matrix_world @ v.co for v in body.data.vertices]
import numpy as np
P = np.array([v[:] for v in vs]); front = P[(np.abs(P[:, 0]) < 0.01) & (P[:, 2] > hd.z - 0.06) & (P[:, 2] < hd.z + 0.02)]
mz = front[front[:, 1].argmin()]  # most forward point near mouth level -> lips
dg = bpy.context.evaluated_depsgraph_get(); eb = body.evaluated_get(dg); me_ = eb.to_mesh()
target = body.matrix_world @ me_.vertices[455].co; target.x = 0
cam.location = target + Vector((0.0, -0.45, 0.0)); cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
sc.render.resolution_x, sc.render.resolution_y = 500, 300
for i, v in enumerate([0.0, 0.25, 0.5, 0.75]):
    for k in kb:
        if k.name in ("mouthClose", "mouthPressLeft", "mouthPressRight"): k.value = 0
    kb["mouthClose"].value = v
    sc.render.filepath = f"{out}_{i}.png"; bpy.ops.render.render(write_still=True)
kb["mouthClose"].value = 0.5; kb["mouthPressLeft"].value = kb["mouthPressRight"].value = 0.3
sc.render.filepath = f"{out}_4.png"; bpy.ops.render.render(write_still=True)
print("DONE")
