"""Render diagnostic variants through the fitted photo camera.
Run: blender -b avatar.blend --python variant_render.py -- fit.npz view outprefix variant[,variant...]
variants: base, flat (emission-only skin), nohair, noglass, nobrow, all_off"""
import bpy, sys, numpy as np, math
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index("--") + 1:]
fit = np.load(a[0]); view = a[1]; prefix = a[2]; variants = a[3].split(",")
cams = dict(zip(fit["vnames"], fit["cams"])); F_PX = float(fit["F_PX"])
def rod(r):
    th = np.linalg.norm(r)
    if th < 1e-12: return np.eye(3)
    k = r / th; K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + math.sin(th) * K + (1 - math.cos(th)) * K @ K
sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE_NEXT"; sc.view_settings.view_transform = "Standard"
w = sc.world or bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.9, 0.9, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.9
for n, loc, e in (("k", (0.6, -1.6, 2.0), 140), ("f", (-1.4, -1.2, 1.7), 90), ("r", (0.0, 1.5, 2.0), 60)):
    ld = bpy.data.lights.new(n, "AREA"); ld.energy = e; ld.size = 2.5
    o = bpy.data.objects.new("_L" + n, ld); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 1.6)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
cd = bpy.data.cameras.new("pc"); cd.sensor_fit = "HORIZONTAL"; cd.sensor_width = 36; cd.lens = F_PX / 3472 * 36; cd.clip_start = 0.05
cam = bpy.data.objects.new("_pc", cd); sc.collection.objects.link(cam); sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y = 868, 1156
c = cams[view]; R = rod(c[:3]); t = c[3:]
M = np.eye(4); M[:3, :3] = R.T @ np.diag([1, -1, -1]); M[:3, 3] = -R.T @ t; cam.matrix_world = Matrix(M.tolist())
def find(k): return [o for o in bpy.data.objects if o.type == "MESH" and k in o.name]
skin = bpy.data.materials["Skin"]
orig_links = None
for v in variants:
    for o in bpy.data.objects:
        if o.type == "MESH": o.hide_render = False
    nt = skin.node_tree; p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE"); out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    em = nt.nodes.get("_em") or nt.nodes.new("ShaderNodeEmission"); em.name = "_em"
    nt.links.new(tex.outputs["Color"], em.inputs["Color"])
    nt.links.new((em if v in ("flat", "all_off") else p).outputs[0], out.inputs["Surface"])
    if v in ("nohair", "all_off"):
        for o in find("hair"): o.hide_render = True
    if v in ("noglass", "all_off"):
        for o in find("glasses"): o.hide_render = True
    if v in ("nobrow", "all_off"):
        for o in find("eyebrow"): o.hide_render = True
    sc.render.filepath = f"{prefix}_{v}.png"; bpy.ops.render.render(write_still=True); print("WROTE", sc.render.filepath)
