"""Render clay variants of the avatar, one MakeHuman face target at a time (+amount), through photo cameras.
Run: blender -b avatar.blend --python sweep.py -- fit.npz outdir amount [targets.json]"""
import bpy, sys, os, glob, gzip, json, math, numpy as np
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index("--") + 1:]; fit = np.load(a[0]); out = a[1]; AMT = float(a[2]); os.makedirs(out, exist_ok=True)
VIEWS = ["front_close", "three_quarter", "p09"]
TD = os.path.expanduser("~/.config/blender/4.5/extensions/user_default/mpfb/data/targets")
cams = dict(zip(fit["vnames"], fit["cams"])); fs = dict(zip(fit["vnames"], fit["fs"])); F_PX = float(fit["F_PX"])
def rod(r):
    th = np.linalg.norm(r)
    if th < 1e-12: return np.eye(3)
    k = r / th; K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]]); return np.eye(3) + math.sin(th) * K + (1 - math.cos(th)) * K @ K
sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE_NEXT"; sc.view_settings.view_transform = "Standard"; sc.eevee.taa_render_samples = 8
sc.render.image_settings.file_format = "JPEG"; sc.render.image_settings.quality = 92
w = sc.world or bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.9, 0.9, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.9
for n, loc, e in (("k", (0.6, -1.6, 2.0), 140), ("f", (-1.4, -1.2, 1.7), 90), ("r", (0.0, 1.5, 2.0), 60)):
    ld = bpy.data.lights.new(n, "AREA"); ld.energy = e; ld.size = 2.5
    o = bpy.data.objects.new("_L" + n, ld); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 1.6)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
nt = bpy.data.materials["Skin"].node_tree; pr = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
for l in list(pr.inputs["Base Color"].links): nt.links.remove(l)
pr.inputs["Base Color"].default_value = (0.13, 0.07, 0.05, 1); pr.inputs["Roughness"].default_value = 0.6
cd = bpy.data.cameras.new("pc"); cd.sensor_fit = "HORIZONTAL"; cd.sensor_width = 36; cd.clip_start = 0.05
cam = bpy.data.objects.new("_pc", cd); sc.collection.objects.link(cam); sc.camera = cam
S = 0.16; sc.render.resolution_x, sc.render.resolution_y = int(3472 * S), int(4624 * S)
body = bpy.data.objects["Avatar.body"]; me = body.data
inv3 = np.array(body.matrix_world.inverted().to_3x3())
basis = np.array([v.co for v in me.shape_keys.key_blocks[0].data])
def load_t(p):
    a_ = np.loadtxt(gzip.open(p), ndmin=2); return a_[:, 0].astype(int), np.stack([a_[:, 1], -a_[:, 3], a_[:, 2]], 1) * 0.1
cats = os.environ.get("CATS", "nose,mouth,chin,cheek,head").split(",")
groups = {}
for c in cats:
    for p in sorted(glob.glob(f"{TD}/{c}/*.target.gz")):
        n = os.path.basename(p)[:-10]; key = n[2:] if n[:2] in ("l-", "r-") else n
        if key.startswith(("head-age", "head-fat", "head-angle", "head-trans", "head-scale-vert")): continue
        groups.setdefault(key, []).append(p)
names = sorted(groups) if len(a) < 4 else json.load(open(a[3]))
sk = body.shape_key_add(name="_sweep", from_mix=False); sk.value = 1.0
# followers: eyes (rigid per side, follow the eye-socket helper), brows/lashes (nearest body vertex)
B0 = np.load(os.path.join(os.path.dirname(os.path.abspath(a[0])), "base_mesh.npz"))
from mathutils.kdtree import KDTree
bw = [body.matrix_world @ v.co for v in me.vertices]; kd = KDTree(len(bw))
for i_, p_ in enumerate(bw): kd.insert(p_, i_)
kd.balance()
followers = []
for o in bpy.data.objects:
    if o.type != "MESH" or not any(k in o.name for k in ("high-poly", "eyebrow", "eyelash")): continue
    if not o.data.shape_keys: o.shape_key_add(name="Basis")
    fk = o.shape_key_add(name="_sweep", from_mix=False); fk.value = 1.0
    ow = np.array([o.matrix_world @ v.co for v in o.data.vertices]); oinv = np.array(o.matrix_world.inverted().to_3x3())
    fb = np.array([v.co for v in o.data.shape_keys.key_blocks[0].data])
    if "high-poly" in o.name:
        side = np.sign(ow[:, 0]); src = {1: B0["g_helper-l-eye"], -1: B0["g_helper-r-eye"]}
        followers.append((fk, fb, oinv, "eye", side, src))
    else:
        nn = np.array([kd.find(Vector(p_))[1] for p_ in ow]); followers.append((fk, fb, oinv, "near", nn, None))
def follow(dworld):
    for fk, fb, oinv, kind, arg, src in followers:
        if kind == "eye":
            dd = np.zeros((len(fb), 3))
            for sgn, idx in src.items(): dd[arg == sgn] = dworld[idx].mean(0)
        else:
            dd = dworld[arg]
        fk.data.foreach_set("co", (fb + dd @ oinv.T).astype(np.float32).ravel())
def render_all(tag):
    for v in VIEWS:
        c = cams[v]; R = rod(c[:3]); t = c[3:]; cd.lens = fs.get(v, F_PX) / 3472 * 36
        M = np.eye(4); M[:3, :3] = R.T @ np.diag([1, -1, -1]); M[:3, 3] = -R.T @ t; cam.matrix_world = Matrix(M.tolist())
        sc.render.filepath = f"{out}/{tag}__{v}.jpg"; bpy.ops.render.render(write_still=True)
sk.data.foreach_set("co", basis.astype(np.float32).ravel()); follow(np.zeros_like(basis)); render_all("BASE")
def delta(n):
    d = np.zeros_like(basis)
    for p in groups[n]:
        idx, dd = load_t(p); d[idx] += dd @ inv3.T
    return d
tags = []
for i, n in enumerate(names):
    if isinstance(n, dict):   # combo: {"tag": ..., "w": {target: amount}}
        d = sum(amt * delta(t) for t, amt in n["w"].items()); tag = n["tag"]
    else:
        d = AMT * delta(n); tag = n
    sk.data.foreach_set("co", (basis + d).astype(np.float32).ravel()); body.data.update()
    follow(d @ np.array(body.matrix_world.to_3x3()).T)
    render_all(tag); tags.append(tag); print("DONE", i, tag, flush=True)
json.dump(tags, open(f"{out}/names.json", "w")); print("ALLDONE")
