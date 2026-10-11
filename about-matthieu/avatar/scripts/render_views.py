"""Render the avatar through several fitted photo cameras (photo-like soft light).
Run: blender -b avatar.blend --python render_views.py -- fit.npz outprefix v1,v2,... [scale]"""
import bpy, sys, numpy as np, math
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index("--") + 1:]
fit = np.load(a[0]); prefix = a[1]; views = a[2].split(","); S = float(a[3]) if len(a) > 3 else 0.25
cams = dict(zip(fit["vnames"], fit["cams"])); F_PX = float(fit["F_PX"])
fs = dict(zip(fit["vnames"], fit["fs"])) if "fs" in fit.files else {}
def rod(r):
    th = np.linalg.norm(r)
    if th < 1e-12: return np.eye(3)
    k = r / th; K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + math.sin(th) * K + (1 - math.cos(th)) * K @ K
sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE_NEXT"; sc.view_settings.view_transform = "Standard"
sc.eevee.taa_render_samples = 16
w = sc.world or bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.9, 0.9, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.9
for n, loc, e in (("k", (0.6, -1.6, 2.0), 140), ("f", (-1.4, -1.2, 1.7), 90), ("r", (0.0, 1.5, 2.0), 60)):
    ld = bpy.data.lights.new(n, "AREA"); ld.energy = e; ld.size = 2.5
    o = bpy.data.objects.new("_L" + n, ld); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 1.6)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
cd = bpy.data.cameras.new("pc"); cd.sensor_fit = "HORIZONTAL"; cd.sensor_width = 36; cd.clip_start = 0.05
cam = bpy.data.objects.new("_pc", cd); sc.collection.objects.link(cam); sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y = int(3472 * S), int(4624 * S)
import os
def clay_skin():
    """uniform skin-tone material on the body: shape only, no photo texture"""
    nt = bpy.data.materials["Skin"].node_tree; pr = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    for l in list(pr.inputs["Base Color"].links): nt.links.remove(l)
    pr.inputs["Base Color"].default_value = (0.13, 0.07, 0.05, 1); pr.inputs["Roughness"].default_value = 0.6
if os.environ.get("CLAY"):
    clay_skin()
if os.environ.get("GENERIC"):
    # geometry-only analysis renders: generic MakeHuman skin instead of the photo-projected texture, no hair
    gen = bpy.data.images.load(os.path.expanduser("~/.config/blender/4.5/extensions/.user/user_default/mpfb/data/skins/middleage_caucasian_male/middleage_lightskinned_male_diffuse.png"))
    for n in bpy.data.materials["Skin"].node_tree.nodes:
        if n.type == "TEX_IMAGE": n.image = gen
    for o in bpy.data.objects:
        if o.type == "MESH" and "hair" in o.name: o.hide_render = True
for v in views:
    c = cams[v]; R = rod(c[:3]); t = c[3:]; cd.lens = fs.get(v, F_PX) / 3472 * 36
    M = np.eye(4); M[:3, :3] = R.T @ np.diag([1, -1, -1]); M[:3, 3] = -R.T @ t; cam.matrix_world = Matrix(M.tolist())
    sc.render.filepath = f"{prefix}_{v}.png"; bpy.ops.render.render(write_still=True); print("WROTE", v)
