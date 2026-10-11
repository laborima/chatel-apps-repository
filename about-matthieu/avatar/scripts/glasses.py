"""Procedural half-rim rectangular glasses fitted to the avatar, parented to the head bone.
Run: blender -b in.blend --python glasses.py -- fit.npz out.blend
"""
import bpy, bmesh, sys, os, math, gzip, numpy as np
from mathutils import Vector, Matrix

fitf, out = sys.argv[sys.argv.index("--") + 1:][:2]
if os.environ.get("NOGLASSES", "1") == "1":
    # glasses off for now (user request); keep the brow lift that goes with the fitted brow position
    for ob in bpy.data.objects:
        if ob.type == "MESH" and "eyebrow" in ob.name and ob.data.shape_keys:
            for kb in ob.data.shape_keys.key_blocks:
                co = np.array([v.co for v in kb.data]); co[:, 2] += 0.0025
                co[:, 1] -= 0.0013   # 1.3 mm in front of the skin: the brow card was partly sunk into the forehead
                kb.data.foreach_set("co", co.astype(np.float32).ravel())
    bpy.ops.wm.save_as_mainfile(filepath=out); print("SAVED (no glasses)", out); sys.exit(0)
B = os.path.dirname(os.path.abspath(out))
V = np.load(fitf)["Vfit"]
vid = np.load(f"{B}/corr.npz")["vid"]
TD = os.path.expanduser("~/.config/blender/4.5/extensions/user_default/mpfb/data/targets")
m = np.load(f"{B}/base_mesh.npz"); body_idx = m["g_body"]
P = lambda k: Vector(V[vid[k]].tolist())
iod = (P(33) - P(263)).length
eye_c = (P(33) + P(133) + P(362) + P(263)) / 4
eye_obj = next(o for o in bpy.data.objects if o.name.endswith(".high-poly"))
cornea_y = min((eye_obj.matrix_world @ v.co).y for v in eye_obj.data.vertices)
def ear_top(side, sgn):
    a = np.loadtxt(gzip.open(f"{TD}/ears/{side}-ear-scale-incr.target.gz"))
    i = np.intersect1d(a[:, 0].astype(int), body_idx); i = i[V[i, 0] * sgn > 0.072]
    j = i[V[i, 2].argmax()]; return Vector(V[j].tolist())
ear_r, ear_l = ear_top("r", -1), ear_top("l", 1)
head_half = max(abs(ear_r.x), abs(ear_l.x))
print("iod mm", iod * 1000, "cornea y", cornea_y)

LW, LH = 0.605 * iod, 0.40 * iod             # lens box
LC = 0.457 * iod                              # lens centre offset from midline
ZC = eye_c.z - 0.025 * iod                     # lens box centre height
YF = cornea_y - 0.013                         # lens plane (13 mm vertex distance)
TILT = math.radians(8); WRAP = math.radians(6)

def lens_outline(n=72, r=0.22):
    """rounded rectangle, slightly flatter at the bottom (rectangular frame)"""
    pts = []
    hw, hh = LW / 2, LH / 2; rr = r * LH
    corners = [(hw - rr, hh - rr, 0), (-hw + rr, hh - rr, 90), (-hw + rr * 1.2, -hh + rr * 1.2, 180), (hw - rr * 1.2, -hh + rr * 1.2, 270)]
    for i, (cx, cy, a0) in enumerate(corners):
        rad = rr * (1.2 if i >= 2 else 1.0)
        for k in range(n // 4 + 1):
            a = math.radians(a0 + 90 * k / (n // 4))
            pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    return pts

def place(side, x, y):
    """lens-local 2D -> world, with wrap (rotation about Z) and pantoscopic tilt (about X)"""
    s = 1 if side == "l" else -1
    p = Vector((x * s, 0, y))
    p = Matrix.Rotation(-TILT, 3, "X") @ p
    p = Matrix.Rotation(s * WRAP, 3, "Z") @ p
    return p + Vector((s * LC, YF, ZC))

col = bpy.data.collections.new("Glasses"); bpy.context.scene.collection.children.link(col)
def mat(name, rgba, rough, metal=0.0, transm=0.0, alpha=1.0):
    mt = bpy.data.materials.new(name); mt.use_nodes = True
    p = mt.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = rgba; p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if transm: p.inputs["Transmission Weight"].default_value = transm
    if alpha < 1:
        p.inputs["Alpha"].default_value = alpha
        mt.surface_render_method = "BLENDED"
    return mt
M_FRAME = mat("GlassesFrame", (0.006, 0.006, 0.007, 1), 0.7, metal=0.0)
M_FRAME.node_tree.nodes["Principled BSDF"].inputs["Specular IOR Level"].default_value = 0.15
M_LENS = mat("GlassesLens", (0.88, 0.88, 0.95, 1), 0.05, alpha=0.0)
M_LENS.node_tree.nodes["Principled BSDF"].inputs["Specular IOR Level"].default_value = 0.08
M_LENS.node_tree.nodes["Principled BSDF"].inputs["Coat Weight"].default_value = 0.0
M_LENS.node_tree.nodes["Principled BSDF"].inputs["Coat Tint"].default_value = (0.75, 0.6, 1.0, 1)
M_NYLON = mat("GlassesNylon", (0.15, 0.15, 0.16, 1), 0.4, alpha=0.12)
M_PAD = mat("GlassesPads", (0.5, 0.5, 0.5, 1), 0.3, alpha=0.0)

def curve_obj(name, pts, bevel_w, bevel_h, material, closed=False):
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"
    sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts): sp.points[i].co = (*p, 1)
    sp.use_cyclic_u = closed
    # rectangular profile via bevel object
    prof = bpy.data.curves.new(name + "_prof", "CURVE"); ps = prof.splines.new("POLY"); ps.points.add(3)
    for i, (a, b) in enumerate([(-bevel_w / 2, -bevel_h / 2), (bevel_w / 2, -bevel_h / 2), (bevel_w / 2, bevel_h / 2), (-bevel_w / 2, bevel_h / 2)]):
        ps.points[i].co = (a, b, 0, 1)
    ps.use_cyclic_u = True
    po = bpy.data.objects.new(name + "_prof", prof); col.objects.link(po)
    cu.bevel_mode = "OBJECT"; cu.bevel_object = po; cu.use_fill_caps = True
    o = bpy.data.objects.new(name, cu); col.objects.link(o)
    o.data.materials.append(material)
    return o, po

parts = []
outline = lens_outline()
for side in ("l", "r"):
    s = 1 if side == "l" else -1
    # lens: flat cap mesh, 1.8 mm thick
    bm = bmesh.new()
    front = [bm.verts.new(place(side, x, y)) for x, y in outline]
    off = Vector((0, 0.0018, 0))
    back = [bm.verts.new(v.co + off) for v in front]
    bm.faces.new(front); bm.faces.new(list(reversed(back)))
    for i in range(len(front)):
        j = (i + 1) % len(front); bm.faces.new([front[i], front[j], back[j], back[i]])
    me = bpy.data.meshes.new("Lens_" + side); bm.to_mesh(me); bm.free()
    lo = bpy.data.objects.new("Lens_" + side, me); col.objects.link(lo); me.materials.append(M_LENS); parts.append(lo)
    # top bar: upper half of the outline (from outer-bottom corner up and over to the inner side)
    top = [(x, y) for x, y in outline if y > -0.05 * LH]
    top.sort(key=lambda p: -p[0])
    pts = [tuple(place(side, x, y + 0.0004) - Vector((0, 0.0004, 0))) for x, y in top]
    bar, prof = curve_obj("FrameTop_" + side, pts, 0.0038, 0.0022, M_FRAME); parts += [bar, prof]
    # nylon thread: lower half
    bot = [(x, y) for x, y in outline if y < 0.05 * LH]
    bot.sort(key=lambda p: p[0])
    pts = [tuple(place(side, x, y) + Vector((0, 0.0009, 0))) for x, y in bot]
    ny, prof = curve_obj("Nylon_" + side, pts, 0.0005, 0.0009, M_NYLON); parts += [ny, prof]
    # endpiece + temple: from outer top corner back over the ear, then down behind it
    ep = place(side, LW / 2 + 0.002, LH / 2 - 0.004)
    over_ear = Vector((s * (head_half + 0.004), (ear_r.y + ear_l.y) / 2 - 0.004, (ear_r.z + ear_l.z) / 2 + 0.003))
    hinge = ep + Vector((s * 0.004, 0.006, 0))
    temple = [ep, hinge]
    for k in range(1, 9):
        t = k / 8; temple.append(hinge.lerp(over_ear, t))
    back_dir = Vector((0, 0.025, -0.017)); back_dir.x = -s * 0.004
    for k in range(1, 6):
        t = k / 5; ang = t * 0.5
        temple.append(over_ear + Vector((back_dir.x * t, back_dir.y * t, back_dir.z * t * t * 1.2)))
    tp, prof = curve_obj("Temple_" + side, [tuple(p) for p in temple], 0.0013, 0.0032, M_FRAME); parts += [tp, prof]
    # acetate tip
    tip = [tuple(p) for p in temple[-4:]]
    tt, prof = curve_obj("TempleTip_" + side, tip, 0.0028, 0.0045, M_FRAME); parts += [tt, prof]
    # nose pad (small ellipsoid) + pad arm
    nb = P(168)
    pad_c = Vector((s * 0.0075, nb.y + 0.006, ZC - 0.004))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1, location=pad_c)
    pad = bpy.context.active_object; pad.name = "NosePad_" + side
    pad.scale = (0.0012, 0.0028, 0.0045); pad.rotation_euler = (0, s * math.radians(-25), 0)
    for c in pad.users_collection: c.objects.unlink(pad)
    col.objects.link(pad); pad.data.materials.append(M_PAD); parts.append(pad)
    inner_top = place(side, -LW / 2 + 0.004, LH / 2 - 0.002)
    arm = [tuple(inner_top), tuple(inner_top.lerp(pad_c, 0.5) + Vector((0, -0.002, 0))), tuple(pad_c + Vector((0, 0, 0.002)))]
    pa, prof = curve_obj("PadArm_" + side, arm, 0.0007, 0.0007, M_FRAME); parts += [pa, prof]

# bridge: arched bar joining both inner top corners
li, ri = place("l", -LW / 2 + 0.001, LH / 2 - 0.001), place("r", -LW / 2 + 0.001, LH / 2 - 0.001)
bridge = [tuple(li.lerp(ri, t) + Vector((0, -0.002 * math.sin(math.pi * t), 0.0025 * math.sin(math.pi * t)))) for t in np.linspace(0, 1, 12)]
br, prof = curve_obj("Bridge", bridge, 0.0026, 0.0018, M_FRAME); parts += [br, prof]

# convert curves to meshes and join into one object
bpy.ops.object.select_all(action="DESELECT")
meshes = []
for o in list(col.objects):
    if o.type == "CURVE" and not o.name.endswith("_prof"):
        bpy.context.view_layer.objects.active = o; o.select_set(True)
for o in list(col.objects):
    if o.type == "CURVE" and not o.name.endswith("_prof"):
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.select_all(action="DESELECT"); o.select_set(True)
        bpy.ops.object.convert(target="MESH")
for o in list(col.objects):
    if o.name.endswith("_prof"): bpy.data.objects.remove(o)
bpy.ops.object.select_all(action="DESELECT")
objs = [o for o in col.objects if o.type == "MESH"]
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
g = bpy.context.active_object; g.name = "Avatar.glasses"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.shade_smooth()

# raise brows (MakeHuman places them lower than his brow hair; otherwise hidden by the frame bar)
for ob in bpy.data.objects:
    if ob.type == "MESH" and "eyebrow" in ob.name and ob.data.shape_keys:
        for kb in ob.data.shape_keys.key_blocks:
            co = np.array([v.co for v in kb.data]); co[:, 2] += 0.0025
            kb.data.foreach_set("co", co.astype(np.float32).ravel())
        print("raise brows", ob.name)
# parent to head bone (keep transform)
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
head_bone = next(b.name for b in rig.data.bones if b.name.lower().endswith("head"))
mw = g.matrix_world.copy()
g.parent = rig; g.parent_type = "BONE"; g.parent_bone = head_bone
g.matrix_world = mw
print("glasses parented to", head_bone, "faces", len(g.data.polygons))
bpy.ops.wm.save_as_mainfile(filepath=out)
print("SAVED", out)
