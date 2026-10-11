"""Render the avatar through the fitted camera of each photo (for pixel-level comparison).
Run: blender -b file.blend --python render_photo_cam.py -- fit.npz outprefix view1,view2 [scale]
"""
import bpy, sys, numpy as np, math
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1:]
fit = np.load(args[0]); prefix = args[1]; views = args[2].split(","); scale = float(args[3]) if len(args) > 3 else 0.25
cams = dict(zip(fit["vnames"], fit["cams"])); F_PX = float(fit["F_PX"])
try:
    cams["back"] = np.load(args[0].replace("fit2_result.npz", "cam_back.npy"))
except Exception:
    pass

def rod(r):
    th = np.linalg.norm(r)
    if th < 1e-12: return np.eye(3)
    k = r / th; K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + math.sin(th) * K + (1 - math.cos(th)) * K @ K

sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE_NEXT"
sc.view_settings.view_transform = "Standard"
world = sc.world or bpy.data.worlds.new("W"); sc.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.9, 0.9, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
# soft frontal studio light similar to the photos (window light, white walls)
for n, loc, e in (("k", (0.6, -1.6, 2.0), 140), ("f", (-1.4, -1.2, 1.7), 90), ("r", (0.0, 1.5, 2.0), 60)):
    ld = bpy.data.lights.new(n, "AREA"); ld.energy = e; ld.size = 2.5
    o = bpy.data.objects.new("_L" + n, ld); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 1.6)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
cd = bpy.data.cameras.new("pc"); cd.sensor_fit = "HORIZONTAL"; cd.sensor_width = 36; cd.lens = F_PX / 3472 * 36
cd.clip_start = 0.05
cam = bpy.data.objects.new("_pc", cd); sc.collection.objects.link(cam); sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y = int(3472 * scale), int(4624 * scale)
for v in views:
    c = cams[v]; R = rod(c[:3]); t = c[3:]
    C = -R.T @ t
    Rw = R.T @ np.diag([1, -1, -1])
    M = np.eye(4); M[:3, :3] = Rw; M[:3, 3] = C
    cam.matrix_world = Matrix(M.tolist())
    sc.render.filepath = f"{prefix}_{v}.png"
    bpy.ops.render.render(write_still=True)
    print("WROTE", sc.render.filepath)
