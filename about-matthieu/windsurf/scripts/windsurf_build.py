"""Windsurfer: JP Australia Magic Ride 119 board + Duotone E_Pace 6.2 rig + avatar in a wetsuit, animated loop "Ride".
Run: blender -b avatar.blend --python windsurf_build.py -- out.glb [preview_prefix]
Blender frame: board along +Y (bow), up +Z, rider faces +X, wind from -X (rider on the windward/-X rail).
glTF export converts to three.js (Y up, bow towards -Z)."""
import bpy, bmesh, sys, math, os, numpy as np
from mathutils import Quaternion, Vector, Matrix, Euler

args = sys.argv[sys.argv.index("--") + 1:]
OUT = args[0]; PREV = args[1] if len(args) > 1 else None
WS = os.path.dirname(os.path.abspath(__file__))
FR = 96; FPS = 24
sc = bpy.context.scene; sc.render.fps = FPS; sc.frame_start, sc.frame_end = 1, FR

# ---------------------------------------------------------------- avatar: strip clothes, wetsuit skin
AVATAR_GLB = os.environ.get("AVATAR_GLB")

def paint_wetsuit(obj, keep_groups, color=(0.085, 0.09, 0.095)):
    """Paint the wetsuit into the base-colour texture of obj: every face not mostly weighted to keep_groups."""
    me = obj.data; me.calc_loop_triangles()
    mt = me.materials[0]; p = next(n for n in mt.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    src = p.inputs["Base Color"].links[0].from_node
    img = src.image; W, H = img.size
    px = np.array(img.pixels[:], np.float32).reshape(H, W, 4)
    gi = {g.index: g.name for g in obj.vertex_groups}
    keep = np.zeros(len(me.vertices))
    for v in me.vertices:
        keep[v.index] = sum(g.weight for g in v.groups if any(k in gi.get(g.group, "") for k in keep_groups))
    uv = np.array([d.uv[:] for d in me.uv_layers.active.data])
    mask = np.zeros((H, W), bool)
    for t in me.loop_triangles:
        if keep[list(t.vertices)].mean() > 0.5: continue
        q = uv[list(t.loops)] * [W, H]
        x0, y0 = np.floor(q.min(0)).astype(int); x1, y1 = np.ceil(q.max(0)).astype(int)
        xs, ys = np.meshgrid(np.arange(max(x0 - 1, 0), min(x1 + 2, W)), np.arange(max(y0 - 1, 0), min(y1 + 2, H)))
        a, b, c = q; d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-9: continue
        l1 = ((b[1] - c[1]) * (xs + .5 - c[0]) + (c[0] - b[0]) * (ys + .5 - c[1])) / d
        l2 = ((c[1] - a[1]) * (xs + .5 - c[0]) + (a[0] - c[0]) * (ys + .5 - c[1])) / d
        ok = (l1 > -0.02) & (l2 > -0.02) & (1 - l1 - l2 > -0.02)
        mask[ys[ok], xs[ok]] = True
    rng = np.random.default_rng(0)
    neo = np.array(color + (1.0,), np.float32) * (1 + 0.08 * rng.normal(0, 1, (H, W, 1))).astype(np.float32); neo[..., 3] = 1
    px[mask] = neo[mask]
    new = bpy.data.images.new(obj.name + "_wetsuit", W, H); new.pixels[:] = px.ravel(); new.pack()
    src.image = new
    print("wetsuit texels", int(mask.sum()), "of", W * H)

if AVATAR_GLB:
    # Avaturn (or any Mixamo-named glTF) avatar
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene; sc.render.fps = FPS; sc.frame_start, sc.frame_end = 1, FR
    bpy.ops.import_scene.gltf(filepath=AVATAR_GLB)
    for o in list(bpy.data.objects):
        if o.type == "MESH" and o.parent is None:
            bpy.data.objects.remove(o)                       # stray helper meshes
        elif o.type == "MESH" and "glasses" in o.name and os.environ.get("NOGLASSES") == "1":
            bpy.data.objects.remove(o)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    if arm.animation_data: arm.animation_data_clear()
    for pb_ in arm.pose.bones: pb_.matrix_basis.identity()
    exec(open(f"{WS}/rider_shape.py").read())         # 1.78 m, a windsurfer's build
    bm_ = bpy.data.objects["Body_Mesh"]
    for mt_ in bm_.data.materials:   # Avaturn hides the body under the clothes with an alpha mask: make it opaque
        pr_ = next(n for n in mt_.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        for l_ in list(pr_.inputs["Alpha"].links): mt_.node_tree.links.remove(l_)
        pr_.inputs["Alpha"].default_value = 1.0; mt_.surface_render_method = "DITHERED"; mt_.blend_method = "OPAQUE" if hasattr(mt_, "blend_method") else None
    paint_wetsuit(bm_, ("Hand", "Head", "Neck"))
    # Avaturn removes the body under the clothes: the outfit becomes the wetsuit (black neoprene, original folds kept)
    for o in bpy.data.objects:
        if o.type == "MESH" and any(k in o.name for k in ("_look_", "_shoes_")):
            for mt_ in o.data.materials:
                pr_ = next(n for n in mt_.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
                for l_ in list(pr_.inputs["Base Color"].links): mt_.node_tree.links.remove(l_)
                pr_.inputs["Base Color"].default_value = (0.02, 0.022, 0.025, 1)
                pr_.inputs["Roughness"].default_value = 0.55
                for l_ in list(pr_.inputs["Alpha"].links): mt_.node_tree.links.remove(l_)
                pr_.inputs["Alpha"].default_value = 1.0
else:
    for o in list(bpy.data.objects):
        if o.type == "MESH" and any(k in o.name for k in ("casualsuit", "shoes", "glasses")):
            bpy.data.objects.remove(o)
    body = bpy.data.objects["Avatar.body"]
    for md in list(body.modifiers):
        if md.type == "MASK" and md.name.startswith("Delete."): body.modifiers.remove(md)
    for n in bpy.data.materials["Skin"].node_tree.nodes:
        if n.type == "TEX_IMAGE": n.image = bpy.data.images.load(f"{WS}/skin_wetsuit.png")
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
arm.name = "Rider"; arm.data.name = "Rider"

def mat(name, rgba, rough=0.5, metal=0.0, alpha=1.0, emit=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = rgba; p.inputs["Roughness"].default_value = rough; p.inputs["Metallic"].default_value = metal
    if alpha < 1: p.inputs["Alpha"].default_value = alpha; m.surface_render_method = "BLENDED"; m.use_backface_culling = False
    return m
M_ORANGE = mat("BoardOrange", (0.85, 0.12, 0.03, 1), 0.35)
M_BLACK = mat("BoardBlack", (0.02, 0.02, 0.02, 1), 0.45)
M_WHITE = mat("BoardBottom", (0.85, 0.85, 0.85, 1), 0.4)
M_PAD = mat("DeckPad", (0.05, 0.05, 0.05, 1), 0.9)
M_FIN = mat("Fin", (0.08, 0.08, 0.09, 1), 0.3)
M_MAST = mat("Mast", (0.05, 0.05, 0.06, 1), 0.35)
M_BOOM = mat("Boom", (0.75, 0.76, 0.78, 1), 0.3, metal=0.8)
M_GRIP = mat("BoomGrip", (0.03, 0.03, 0.03, 1), 0.8)
M_FILM = mat("SailTurquoise", (0.0, 0.50, 0.62, 1), 0.35, alpha=0.88)
M_XPLY = mat("SailWindow", (0.86, 0.88, 0.90, 1), 0.25, alpha=0.55)
M_DARK = mat("SailPurple", (0.16, 0.05, 0.42, 1), 0.4, alpha=0.92)
M_TAPE = mat("SailYellow", (0.72, 0.85, 0.02, 1), 0.4)
M_LUFF = mat("SailLuffSleeve", (0.0, 0.42, 0.55, 1), 0.5)
M_BATTEN = mat("SailBatten", (0.18, 0.07, 0.45, 1), 0.4)

def mesh_obj(name, verts, faces, mats, face_mat=None, smooth=True):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    for m_ in mats: me.materials.append(m_)
    if face_mat is not None: me.polygons.foreach_set("material_index", np.asarray(face_mat, np.int32))
    me.polygons.foreach_set("use_smooth", np.full(len(me.polygons), smooth))
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); return o

MODE = os.environ.get("MODE", "windsurf")          # windsurf | wing
exec(open(f"{WS}/gear_{MODE}.py").read())         # board, rig/wing, grip_local(), rig_pose_matrix()

# ---------------------------------------------------------------- rider placement with IK
bpy.context.view_layer.update()
pb = arm.pose.bones; bones = arm.data.bones
arm.rotation_mode = "XYZ"
def place_rider(yaw, lean_body, hips_world):
    """yaw: facing direction (90 = +X, the port-tack stance; 0 = aft; 180 = bow). lean_body: lean in the rider's own frame."""
    R = Matrix.Rotation(math.radians(yaw - 90), 4, "Z") @ Matrix.Rotation(math.radians(lean_body), 4, "Y") @ Matrix.Rotation(math.radians(90), 4, "Z")
    arm.matrix_world = R
    bpy.context.view_layer.update()
    h = arm.matrix_world @ bones["Hips"].head_local
    arm.matrix_world = Matrix.Translation(hips_world - h) @ R
def empty(name, loc):
    e = bpy.data.objects.new(name, None); sc.collection.objects.link(e); e.location = loc; e.empty_display_size = 0.05; return e
T = {k: empty("IK_" + k, (0, 0, 0)) for k in ("LeftFoot", "RightFoot", "LeftHand", "RightHand", "pLeftLeg", "pRightLeg", "pLeftArm", "pRightArm")}
def ik(bone, target, pole, chain=2):
    c = pb[bone].constraints.new("IK"); c.target = T[target]; c.pole_target = T[pole]; c.chain_count = chain; c.pole_angle = math.radians(float(os.environ.get("POLE_LEG" if "Leg" in bone else "POLE_ARM", "90" if "Leg" in bone else "-90")))
ik("LeftLeg", "LeftFoot", "pLeftLeg"); ik("RightLeg", "RightFoot", "pRightLeg")
ik("LeftForeArm", "LeftHand", "pLeftArm"); ik("RightForeArm", "RightHand", "pRightArm")
# hands: orientation from an empty (palm on the tube), fingers closed round it
HR = {sd: empty("HR_" + sd, (0, 0, 0)) for sd in ("Left", "Right")}
HAND = {}
for sd in ("Left", "Right"):
    c = pb[sd + "Hand"].constraints.new("COPY_ROTATION"); c.target = HR[sd]
    Rl = bones[sd + "Hand"].matrix_local.to_3x3().inverted()     # rest T-pose: palms down (-Z), thumbs forward (-Y)
    HAND[sd] = dict(palm=(Rl @ Vector((0, 0, -1))).normalized(), thumb=(Rl @ Vector((0, -1, 0))).normalized())
# feet: flat on the deck, pointing where the pose says (LFa / RFa: degrees from the rider's facing, + to his left)
FROT = {sd: empty("FR_" + sd, (0, 0, 0)) for sd in ("Left", "Right")}
for sd in ("Left", "Right"):
    c = pb[sd + "Foot"].constraints.new("COPY_ROTATION"); c.target = FROT[sd]; FROT[sd].rotation_mode = "QUATERNION"
_inv = arm.matrix_world.inverted()
_minz = min((_inv @ o.matrix_world @ v.co).z for o in bpy.data.objects if o.type == "MESH" and o.parent == arm for v in o.data.vertices)
ANKLE = bones["LeftFoot"].head_local.z - _minz                 # ankle height above the sole
FOOTREST = {}
for sd in ("Left", "Right"):
    tr = bones[sd + "ToeBase"].head_local - bones[sd + "Foot"].head_local
    FOOTREST[sd] = (tr, bones[sd + "Foot"].matrix_local.to_3x3())
def foot_quat(sd, theta_board, BW):
    """World rotation of the foot bone: sole on the deck, toes along theta (radians, board frame, from +X)."""
    tr, Rb = FOOTREST[sd]
    n = (BW.to_3x3() @ Vector((0, 0, 1))).normalized()
    d = (BW.to_3x3() @ Vector((math.cos(theta_board), math.sin(theta_board), 0))).normalized()
    h = Vector((tr.x, tr.y, 0)).length
    td = (d * h + n * tr.z).normalized()
    def frame(x, up):
        x = x.normalized(); y = (up - x * up.dot(x)).normalized(); return Matrix((x, y, x.cross(y))).transposed()
    return (frame(td, n) @ frame(tr, Vector((0, 0, 1))).transposed() @ Rb).to_quaternion()
FEET = {}
for sd, nm in (("Left", "FootL"), ("Right", "FootR")):
    e = bpy.data.objects.new(nm, None); sc.collection.objects.link(e); e.rotation_mode = "QUATERNION"; e.empty_display_size = 0.04
    FEET[sd] = e
print("ankle height", round(ANKLE, 3))

REACH = {sd: (bones[sd + "Arm"].head_local - bones[sd + "ForeArm"].head_local).length
              + (bones[sd + "ForeArm"].head_local - bones[sd + "Hand"].head_local).length for sd in ("Left", "Right")}
# grips: where each hand holds the gear (wrist position + hand orientation), as empties on the rig, animated with
# every clip. The game runs a two-bone arm IK onto them each frame, so the hands stay on the wishbone / wing handles
# even while it blends two clips (e.g. riding -> tucked jump).
GRIP = {}
for sd, nm in (("Left", "GripL"), ("Right", "GripR")):
    e = bpy.data.objects.new(nm, None); sc.collection.objects.link(e); e.parent = rig; e.rotation_mode = "QUATERNION"; e.empty_display_size = 0.04
    GRIP[sd] = e

def build_harness():
    """Waist harness (band, spreader bar, hook) skinned to the hips, sized on the avatar's waist in the rest pose."""
    inv = arm.matrix_world.inverted()
    hip = bones["Hips"].head_local
    zw = hip.z + 0.07
    pts = []
    for o in bpy.data.objects:
        if o.type == "MESH" and o.parent == arm and not o.name.startswith(("Harness",)):
            M = inv @ o.matrix_world
            for v in o.data.vertices:
                q = M @ v.co
                if abs(q.z - zw) < 0.025 and abs(q.x - hip.x) < 0.3: pts.append(q)
    xs = [q.x for q in pts]; ys = [q.y for q in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    rx, ry = (max(xs) - min(xs)) / 2 + 0.014, (max(ys) - min(ys)) / 2 + 0.014
    v, f = [], []
    N = 32
    for i in range(N):
        a = 2 * math.pi * i / N; x, y = cx + rx * math.sin(a), cy - ry * math.cos(a)       # a = 0: front (-Y)
        back = max(0.0, math.cos(a + math.pi)) ** 2                                          # taller at the back
        v += [(x, y, zw - 0.055), (x, y, zw + 0.06 + 0.07 * back)]
    for i in range(N): j = (i + 1) % N; f.append((2 * i, 2 * j, 2 * j + 1, 2 * i + 1))
    front = cy - ry
    # spreader bar across the front, and the hook
    bar = [(cx - 0.11, front - 0.012, zw - 0.035), (cx + 0.11, front - 0.012, zw - 0.035)]
    me = bpy.data.meshes.new("Harness"); me.from_pydata(v, [], f)
    hm = mat("HarnessBand", (0.12, 0.16, 0.20, 1), 0.6); me.materials.append(hm)
    ob = bpy.data.objects.new("Harness", me); sc.collection.objects.link(ob)
    ob.matrix_world = arm.matrix_world.copy()
    sol = ob.modifiers.new("t", "SOLIDIFY"); sol.thickness = 0.012
    bpy.context.view_layer.update()
    hk = mat("HarnessHook", (0.75, 0.76, 0.78, 1), 0.3, metal=0.9)
    parts = [ob]
    for nm, a_, b_, r_ in (("HarnessBar", Vector(bar[0]), Vector(bar[1]), 0.011),
                           ("HarnessHookArm", Vector((cx, front - 0.012, zw - 0.035)), Vector((cx, front - 0.07, zw - 0.02)), 0.008),
                           ("HarnessHookTip", Vector((cx, front - 0.07, zw - 0.02)), Vector((cx, front - 0.075, zw + 0.025)), 0.008)):
        o = tube(nm, arm.matrix_world @ a_, arm.matrix_world @ b_, r_, hk); parts.append(o)
    for o in parts:
        bpy.context.view_layer.update()
        mw = o.matrix_world.copy(); o.parent = arm; o.matrix_world = mw
        vg = o.vertex_groups.new(name="Hips"); vg.add(list(range(len(o.data.vertices))), 1.0, "REPLACE")
        md = o.modifiers.new("Armature", "ARMATURE"); md.object = arm
    hook = bpy.data.objects.new("HarnessHook", None); sc.collection.objects.link(hook)
    hook.parent = arm; hook.parent_type = "BONE"; hook.parent_bone = "Hips"
    bpy.context.view_layer.update()
    hook.matrix_world = arm.matrix_world @ Matrix.Translation(Vector((cx, front - 0.075, zw + 0.02)))
    print("harness: waist", round(2 * rx, 3), "x", round(2 * ry, 3), "at z", round(zw, 3))
if globals().get("HARNESS"): build_harness()

def close_fingers(open_=()):
    for sd in ("Left", "Right"):
        k_ = 0.15 if sd in open_ else 1.0          # a released hand stays relaxed, slightly curled
        for fg, angs in (("Index", (70, 80, 45)), ("Middle", (72, 82, 45)), ("Ring", (74, 84, 45)), ("Pinky", (76, 86, 45)), ("Thumb", (18, 30, 25))):
            for i, a_ in enumerate(angs, 1):
                bn = f"{sd}Hand{fg}{i}"
                if bn not in pb: continue
                P_ = (bones[bn].matrix_local.to_3x3().inverted() @ Vector((0, 0, -1))).normalized()
                ax = Vector((0, 1, 0)).cross(P_)
                if ax.length < 1e-4: continue
                pb[bn].rotation_mode = "QUATERNION"; pb[bn].rotation_quaternion = Quaternion(ax.normalized(), math.radians(a_ * k_))

# root group: board parts + rig
root = bpy.data.objects.new("Windsurfer", None); sc.collection.objects.link(root)
for o in list(sc.objects):
    if o.parent is None and o is not root and not o.name.startswith("IK_") and o.type in ("MESH", "EMPTY"):
        if o.name.startswith(("Board", "DeckPad", "Fin", "Strap", "Rig", "Foil")): o.parent = root
arm.parent = root   # the rider rides with the board (transforms set through matrix_world)

# ---------------------------------------------------------------- key poses
# A pose is a dict in the board (root) frame. Hands: ("boom", t, side) on the wishbone, ("mast", z) on the mast,
# or ("free", (x, y, z)). Port-tack stance: rider on the -X rail facing +X, left foot forward.
D = lambda y: deck_z(y) + ANKLE - 0.06          # poses give the ankle as D(y) + 0.06: put the sole on the deck
def mirror(p, sheet_turns=0, yaw_turns=None):
    """Same pose on the other tack (x -> -x, left <-> right): the last key of a tack or jibe."""
    mx = lambda v: (-v[0], v[1], v[2])
    mh = lambda h: (h[0], h[1], -h[2]) if h[0] in ("boom", "hdl") else (("free", mx(h[1])) if h[0] == "free" else h)
    yt = sheet_turns if yaw_turns is None else yaw_turns
    q = dict(p)
    if "rigpos" in p: q["rigpos"] = mx(p["rigpos"])
    q.update(heel=-p["heel"], rlean=-p["rlean"], sheet=-p["sheet"] + 360 * sheet_turns, flip=1 - p["flip"],
             hips=mx(p["hips"]), yaw=-p["yaw"] + 360 * yt, neck=-p["neck"], head=-p["head"],
             LF=mx(p["RF"]), RF=mx(p["LF"]), LH=mh(p["RH"]), RH=mh(p["LH"]),
             pLL=mx(p["pRL"]), pRL=mx(p["pLL"]), pLA=mx(p["pRA"]), pRA=mx(p["pLA"]), LFa=-p["RFa"], RFa=-p["LFa"])
    return q

def rot(v, deg):   # rotate an offset about Z (poles follow the rider's facing)
    c, s_ = math.cos(math.radians(deg)), math.sin(math.radians(deg)); return (c * v[0] - s_ * v[1], s_ * v[0] + c * v[1], v[2])
def poles(yaw):
    d = yaw - 90; r = RIDE0
    return dict(pLL=rot(r["pLL"], d), pRL=rot(r["pRL"], d), pLA=rot(r["pLA"], d), pRA=rot(r["pRA"], d))

def hand_pos(h, RW):
    if h[0] == "free": return root.matrix_world @ Vector(h[1])
    return RW @ grip_local(h)[0]

def grip(h, RW, sd, shoulder):
    """Wrist target and hand orientation (world): on a bar (wishbone, wing handle: overhand, palm on top) or a pole (mast: thumb up)."""
    p = hand_pos(h, RW)
    if h[0] == "free":                            # released hand: arm stretched out, palm down
        F = (p - shoulder).normalized(); Pw = Vector((0, 0, -1)); Pw = (Pw - F * Pw.dot(F)).normalized()
        y = Vector((0, 1, 0)); pl = HAND[sd]["palm"]; pl = (pl - y * pl.dot(y)).normalized()
        M = Matrix((F, Pw, F.cross(Pw))).transposed() @ Matrix((y, pl, y.cross(pl)))   # W @ L^T
        return p, M.to_quaternion()
    _, tl, kind = grip_local(h)
    T_ = (RW.to_3x3() @ tl).normalized()
    if kind == "bar":
        Pw = Vector((0, 0, -1)); Pw = (Pw - T_ * Pw.dot(T_)).normalized()
    else:
        d = p - shoulder; Pw = (d - T_ * d.dot(T_)).normalized()
    best = None
    for sgn in (1, -1):
        F = T_.cross(Pw) * sgn
        W = Matrix((F, Pw, F.cross(Pw))).transposed()
        y = Vector((0, 1, 0)); pl = HAND[sd]["palm"]; pl = (pl - y * pl.dot(y)).normalized()
        L = Matrix((y, pl, y.cross(pl))).transposed()
        M = W @ L.transposed()
        thumb = M @ HAND[sd]["thumb"]
        score = F.dot((p - shoulder).normalized()) if kind == "bar" else thumb.z
        if best is None or score > best[0]: best = (score, F, Pw, M)
    _, F, Pw, M = best
    wrist = p - F * (0.07 if kind == "bar" else 0.05) - Pw * 0.03
    return wrist, M.to_quaternion()

def smooth(w): return w * w * (3 - 2 * w)
def lerp(a, b, w): return a + (b - a) * w
def lerpv(a, b, w): return tuple(lerp(x, y, w) for x, y in zip(a, b))

def apply_pose(a, b, w, extra=None):
    """Pose between keys a and b (w in 0..1, already eased). extra: per-frame additions (chop, sway)."""
    e = extra or {}
    g = lambda k: lerp(a[k], b[k], w) + e.get(k, 0.0)
    root.rotation_euler = Euler((math.radians(g("pitch")), math.radians(g("heel")), math.radians(g("spin")))); root.location = (0, 0, g("heave"))
    # spins (freestyle): the board turns under the rig, which keeps its orientation to the wind
    rig.matrix_basis = Matrix.Translation(MAST_FOOT) @ Matrix.Rotation(-math.radians(g("spin")), 4, "Z") @ Matrix.Translation(-MAST_FOOT) @ \
        rig_pose_matrix(a, b, w, g)
    bpy.context.view_layer.update()
    RW, BW = rig.matrix_world, root.matrix_world
    for fk_, tk in (("LF", "LeftFoot"), ("RF", "RightFoot")):
        pa, pb_ = Vector(a[fk_]), Vector(b[fk_])
        # step: the foot leaves the deck heel first, travels low and lands flat (lift peaks early, settles late)
        lift = 0.13 * math.sin(math.pi * w) ** 1.5 * (1.15 - 0.3 * w) if (pa - pb_).length > 0.08 and pa.z < 0.4 and pb_.z < 0.4 else 0.0
        p = pa.lerp(pb_, w)
        if p.z < 0.4: p.z = max(p.z, D(p.y) + 0.06)                 # the spline never pushes a foot into the deck
        T[tk].location = BW @ (p + Vector((0, 0, lift)))
    hp = Vector(lerpv(a["hips"], b["hips"], w)) + Vector(e.get("hips", (0, 0, 0)))
    hips = BW @ hp
    # hand targets first (they are on the gear, not on the rider)
    def hand_targets():
        RW = rig.matrix_world; shoulder = hips + Vector((0, 0, 0.45))
        for hk, sd in (("LH", "Left"), ("RH", "Right")):
            pa_, qa = grip(a[hk], RW, sd, shoulder); pb2, qb = grip(b[hk], RW, sd, shoulder)
            T[sd + "Hand"].location = pa_.lerp(pb2, w)
            HR[sd].rotation_mode = "QUATERNION"; HR[sd].rotation_quaternion = qa.slerp(qb, w)
    hand_targets()
    # place the rider; if a grip is out of reach, the gear comes to the hands (RIG_GIVE: the wing is held freely,
    # a windsurf rig is pulled to windward round the mast foot) and the body moves the rest of the way
    held = [sd for hk, sd in (("LH", "Left"), ("RH", "Right")) if a[hk][0] != "free" and b[hk][0] != "free"]
    for _ in range(6):
        place_rider(g("yaw") + g("spin"), g("blean"), hips)
        bpy.context.view_layer.update()
        worst, pull = 0.0, Vector()
        for sd in held:
            sh = arm.matrix_world @ pb[sd + "Arm"].head
            d = T[sd + "Hand"].location - sh
            short = d.length - REACH[sd] * 0.93          # keep a slight bend in the elbows
            if short > worst: worst, pull = short, d.normalized()
        if worst <= 0.002: break
        hips = hips + pull * worst * (1 - RIG_GIVE)
        give_rig(BW.inverted().to_3x3() @ (-pull * worst * RIG_GIVE))
        bpy.context.view_layer.update(); hand_targets()
    for sd in ("Left", "Right"):
        bpy.context.view_layer.update()
        GRIP[sd].matrix_world = Matrix.LocRotScale(T[sd + "Hand"].location, HR[sd].rotation_quaternion, None)
    for sd, k in (("Left", "LFa"), ("Right", "RFa")):
        q = foot_quat(sd, math.radians(g("yaw") - 90 + g(k)), BW)
        FROT[sd].rotation_quaternion = q
        FEET[sd].matrix_world = Matrix.LocRotScale(T[sd + "Foot"].location, q, None)
    for k, tk in (("pLL", "pLeftLeg"), ("pRL", "pRightLeg"), ("pLA", "pLeftArm"), ("pRA", "pRightArm")):
        T[tk].location = hips + Vector(lerpv(a[k], b[k], w))
    kb = sail.data.shape_keys.key_blocks
    kb["flutter"].value = g("flutter"); kb["flip"].value = min(1, max(0, g("flip")))
    for bn, k in (("Neck", "neck"), ("Head", "head")):
        p_ = pb[bn]; p_.rotation_mode = "XYZ"; p_.rotation_euler = Euler((0, math.radians(g(k)), 0))

NUMERIC = lambda v: isinstance(v, (int, float)) or (isinstance(v, tuple) and all(isinstance(x, (int, float)) for x in v))
def spline(p0, p1, p2, p3, u, t0, t1, t2, t3):
    """Catmull-Rom through key values (numbers or tuples) at non-uniform key times: the motion flows through each key
    instead of stopping on it (velocity continuous from one segment to the next)."""
    def one(x0, x1, x2, x3):
        m1 = (x2 - x0) / (t2 - t0) * (t2 - t1); m2 = (x3 - x1) / (t3 - t1) * (t2 - t1)
        u2, u3 = u * u, u * u * u
        return (2 * u3 - 3 * u2 + 1) * x1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * x2 + (u3 - u2) * m2
    if isinstance(p1, tuple): return tuple(one(*xs) for xs in zip(p0, p1, p2, p3))
    return one(p0, p1, p2, p3)

def keyed(keys, cyclic=False):
    """keys: [(frame, pose)] -> frame function. Numeric channels follow a Catmull-Rom spline through the keys (ease in
    at the first key and out at the last one, unless cyclic); the grips and the steps go key to key."""
    if cyclic:
        period = keys[-1][0] - keys[0][0]
        ext = [(keys[-2][0] - period, keys[-2][1])] + keys + [(keys[1][0] + period, keys[1][1])]
    else:
        ext = [(2 * keys[0][0] - keys[1][0], keys[0][1])] + keys + [(2 * keys[-1][0] - keys[-2][0], keys[-1][1])]
    def fn(f, n):
        for i in range(1, len(ext) - 2):
            (t0, p0), (t1, a), (t2, b), (t3, p3) = ext[i - 1:i + 3]
            if t1 <= f <= t2:
                u = (f - t1) / (t2 - t1)
                # a cut (two keys one frame apart, e.g. the wing swapping tack overhead) is not a curve to follow
                if t1 - t0 <= 1: p0, t0 = a, t1 - (t2 - t1)
                if t3 - t2 <= 1: p3, t3 = b, t2 + (t2 - t1)
                first, last = i == 1 and not cyclic, i == len(ext) - 3 and not cyclic
                # start and end at rest: ease the spline's parameter on the end segments
                us = smooth(u) if first and last else (u * u * (2 - u) if first else (u * (1 + u - u * u) if last else u))
                q = {k: (spline(p0[k], a[k], b[k], p3[k], us, t0, t1, t2, t3) if NUMERIC(a[k]) and k in b and NUMERIC(b[k]) else a[k]) for k in a}
                # feet step from key to key (a planted foot must not slide), the hands change grip the same way
                A = dict(q, LH=a["LH"], RH=a["RH"], LF=a["LF"], RF=a["RF"]); B = dict(q, LH=b["LH"], RH=b["RH"], LF=b["LF"], RF=b["RF"])
                return apply_pose(A, B, smooth(u), dict(flutter=0.25 * math.sin(f * 0.9)))
    return fn

exec(open(f"{WS}/poses_{MODE}.py").read())        # P(), RIDE0, ride_frame(), key poses, CLIPS, OPEN_HANDS

# ---------------------------------------------------------------- bake every clip into its own NLA track
sk = sail.data.shape_keys
for e in FEET.values(): e.parent = root
ANIMATED = (root, rig, arm, sk, GRIP["Left"], GRIP["Right"], FEET["Left"], FEET["Right"])
for idb in ANIMATED: idb.animation_data_create()
tracks = []
for name, n, fn in CLIPS:
    for idb in ANIMATED: idb.animation_data.action = bpy.data.actions.new(f"{name}_{idb.name}")
    for tr in tracks: tr.mute = True
    bpy.context.view_layer.objects.active = arm; arm.select_set(True)
    close_fingers(OPEN_HANDS.get(name, ()))
    for f in range(1, n + 1):
        sc.frame_set(f); fn(f, n)
        for o in (root, rig, arm, *T.values()):
            o.keyframe_insert("location", frame=f); o.keyframe_insert("rotation_euler", frame=f)
        for o in HR.values(): o.keyframe_insert("rotation_quaternion", frame=f)
        for o in (*GRIP.values(), *FEET.values()): o.keyframe_insert("location", frame=f); o.keyframe_insert("rotation_quaternion", frame=f)
        for o in FROT.values(): o.keyframe_insert("rotation_quaternion", frame=f)
        for kn in ("flutter", "flip"): sk.key_blocks[kn].keyframe_insert("value", frame=f)
        for bn in ("Neck", "Head"): pb[bn].keyframe_insert("rotation_euler", frame=f)
    bpy.ops.object.mode_set(mode="POSE"); bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.nla.bake(frame_start=1, frame_end=n, step=1, only_selected=True, visual_keying=True, clear_constraints=False,
                     use_current_action=True, bake_types={"POSE"})
    bpy.ops.object.mode_set(mode="OBJECT")
    for idb in ANIMATED:
        ad = idb.animation_data; tr = ad.nla_tracks.new(); tr.name = name
        tr.strips.new(name, 1, ad.action); ad.action = None; tracks.append(tr)
    print("BAKED", name, n)
for p_ in pb:
    for c in list(p_.constraints): p_.constraints.remove(c)
for e in (*T.values(), *HR.values(), *FROT.values()): bpy.data.objects.remove(e)
for tr in tracks: tr.mute = False

sc.frame_set(1)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_animations=True, export_animation_mode="NLA_TRACKS",
                          export_skins=True, export_morph=True, export_morph_normal=False, export_image_format="WEBP", export_yup=True,
                          export_frame_range=False, export_force_sampling=True,
                          # keep every channel, even constant ones: the held poses (Tuck, OneHand...) must still move the rig, grips and feet
                          export_optimize_animation_size=False, export_optimize_animation_keep_anim_armature=True,
                          export_optimize_animation_keep_anim_object=True)
print("EXPORTED", OUT, round(os.path.getsize(OUT) / 1e6, 1), "MB")
bpy.ops.wm.save_as_mainfile(filepath=OUT.replace(".glb", ".blend"))
