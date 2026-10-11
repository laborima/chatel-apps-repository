"""Blender: import a head scan, orbit renders around the head, dump mesh + cameras.
Run: blender -b --python scan_prep.py -- scan.(obj|glb|gltf|ply|fbx) outdir"""
import bpy, sys, os, math, json, numpy as np
from mathutils import Vector, Matrix
scan, out = sys.argv[sys.argv.index("--") + 1:][:2]; os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
ext = os.path.splitext(scan)[1].lower()
if ext == ".obj": bpy.ops.wm.obj_import(filepath=scan)
elif ext in (".glb", ".gltf"): bpy.ops.import_scene.gltf(filepath=scan)
elif ext == ".ply": bpy.ops.wm.ply_import(filepath=scan)
elif ext == ".fbx": bpy.ops.import_scene.fbx(filepath=scan)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
dg = bpy.context.evaluated_depsgraph_get()
Vs, Fs, off = [], [], 0
for o in meshes:
    me = o.evaluated_get(dg).to_mesh(); me.calc_loop_triangles()
    V = np.array([o.matrix_world @ v.co for v in me.vertices]); F = np.array([t.vertices[:] for t in me.loop_triangles])
    Vs.append(V); Fs.append(F + off); off += len(V)
V = np.concatenate(Vs); F = np.concatenate(Fs)
lo, hi = V.min(0), V.max(0); H = hi[2] - lo[2]
# head centre: top part of the scan (scans usually include shoulders)
top = V[V[:, 2] > hi[2] - min(H, 0.3) * 0.7]
c = Vector(((top[:, 0].min() + top[:, 0].max()) / 2, (top[:, 1].min() + top[:, 1].max()) / 2, top[:, 2].mean()))
size = max(np.ptp(top[:, 0]), np.ptp(top[:, 1]), 0.05)
sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE_NEXT"; sc.view_settings.view_transform = "Standard"
w = bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
for o in meshes:   # make sure vertex colours / textures show even without lights
    pass
cd = bpy.data.cameras.new("c"); cd.lens = 50; cam = bpy.data.objects.new("c", cd); sc.collection.objects.link(cam); sc.camera = cam
ld = bpy.data.lights.new("k", "AREA"); ld.energy = 50 * (size / 0.2) ** 2; ld.size = size * 4
lo_ = bpy.data.objects.new("k", ld); sc.collection.objects.link(lo_)
sc.render.resolution_x = sc.render.resolution_y = 768
meta = {}
for i in range(36):
    az = math.radians(10 * i); d = size * 3.2
    cam.location = c + Vector((math.sin(az) * d, -math.cos(az) * d, 0)); cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    lo_.location = cam.location + Vector((0, 0, size)); lo_.rotation_euler = cam.rotation_euler
    bpy.context.view_layer.update()
    sc.render.filepath = f"{out}/orbit_{i:02d}.png"; bpy.ops.render.render(write_still=True)
    meta[f"orbit_{i:02d}"] = dict(M=[list(r) for r in cam.matrix_world], f=cd.lens / cd.sensor_width * 768, W=768, H=768)
json.dump(meta, open(f"{out}/cams.json", "w")); np.savez(f"{out}/scan_mesh.npz", V=V, F=F)
print("SCAN", len(V), "verts", len(F), "tris, height", round(H, 3), "head size", round(size, 3))
