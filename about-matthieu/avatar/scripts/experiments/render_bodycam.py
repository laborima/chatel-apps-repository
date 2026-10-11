"""Render avatar with arms down through photo cameras. Run: blender -b x.blend --python render_bodycam.py -- fit.npz outprefix view1,view2"""
import bpy, sys, numpy as np, math
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index("--") + 1:]
fit = np.load(a[0]); prefix = a[1]; views = a[2].split(",")
cams = dict(zip(fit["vnames"], fit["cams"])); fs = dict(zip(fit["vnames"], fit["fs"])) if "fs" in fit else {}
F_PX = float(fit["F_PX"])
def rod(r):
    th = np.linalg.norm(r)
    if th < 1e-12: return np.eye(3)
    k = r / th; K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + math.sin(th) * K + (1 - math.cos(th)) * K @ K
sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE_NEXT"; sc.view_settings.view_transform = "Standard"
w = sc.world or bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.92, 0.92, 0.92, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
ld = bpy.data.lights.new("k", "AREA"); ld.energy = 150; ld.size = 3; o = bpy.data.objects.new("k", ld); sc.collection.objects.link(o)
o.location = (0.5, -2.0, 2.0); o.rotation_euler = (Vector((0, 0, 1.4)) - o.location).to_track_quat("-Z", "Y").to_euler()
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode="POSE")
def point(bname, direction):
    pb = arm.pose.bones[bname]; bpy.context.view_layer.update()
    h = pb.head.copy(); cur = (pb.tail - pb.head).normalized()
    q = cur.rotation_difference(Vector(direction).normalized())
    pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix
    bpy.context.view_layer.update()
for side, s in (("Left", 1), ("Right", -1)):
    point(f"{side}Arm", (0.17 * s, 0.02, -1)); point(f"{side}ForeArm", (0.05 * s, -0.08, -1))
bpy.ops.object.mode_set(mode="OBJECT")
cd = bpy.data.cameras.new("pc"); cd.sensor_fit = "HORIZONTAL"; cd.sensor_width = 36; cd.clip_start = 0.05
cam = bpy.data.objects.new("_pc", cd); sc.collection.objects.link(cam); sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y = 868, 1156
for v in views:
    c = cams[v]; R = rod(c[:3]); t = c[3:]; cd.lens = fs.get(v, F_PX) / 3472 * 36
    M = np.eye(4); M[:3, :3] = R.T @ np.diag([1, -1, -1]); M[:3, 3] = -R.T @ t; cam.matrix_world = Matrix(M.tolist())
    sc.render.filepath = f"{prefix}_{v}.png"; bpy.ops.render.render(write_still=True); print("WROTE", v)
