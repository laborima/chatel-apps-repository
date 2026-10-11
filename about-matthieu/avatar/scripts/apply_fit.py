"""Stage 2: apply fitted head shape as a 'likeness' shape key, refit proxies + rig, load face shape keys.
Run: blender -b in.blend --python apply_fit.py -- fit.npz out.blend
"""
import bpy, sys, os, numpy as np
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.faceservice import FaceService

fitf, out = sys.argv[sys.argv.index("--") + 1:][:2]
Vfit = np.load(fitf)["Vfit"]
body = next(o for o in bpy.data.objects if o.name.endswith(".body"))
me = body.data
kb = me.shape_keys.key_blocks
basis = np.array([v.co for v in kb[0].data])
cur = basis.copy()
for k in kb[1:]:
    if k.value != 0 and not k.mute:
        cur += k.value * (np.array([v.co for v in k.data]) - basis)
inv = np.array(body.matrix_world.inverted())
Vloc = Vfit @ inv[:3, :3].T + inv[:3, 3]
if "likeness" in kb:
    body.shape_key_remove(kb["likeness"])
sk = body.shape_key_add(name="likeness", from_mix=False)
# head-only delta relative to the mesh the fit was done on, so body targets loaded in build_base survive
B = os.path.dirname(os.path.abspath(fitf))
V0w = np.load(os.path.join(B, "base_mesh.npz"))["V"]
V0loc = V0w @ inv[:3, :3].T + inv[:3, 3]
sk.data.foreach_set("co", (basis + (Vloc - V0loc)).astype(np.float32).ravel())
sk.value = 1.0
print("max displacement mm", np.abs(Vloc - V0loc).max() * 1000, "body-target drift mm", np.abs(cur - V0loc).max() * 1000)

# body targets (neck length...) move the head; shift the whole character back so the head sits where the
# photo cameras expect it (export.py puts the feet back on the ground)
vid_ = np.load(os.path.join(B, "corr.npz"))["vid"]
headm = V0loc[:, 2] > V0loc[vid_[152], 2]
drift = (cur - V0loc)[headm].mean(0)
rig_ = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
root_ = rig_ if rig_ is not None else body
root_.location = root_.location - __import__("mathutils").Vector((body.matrix_world.to_3x3() @ __import__("mathutils").Vector(drift.tolist())))
print("head drift compensated mm", np.round(drift * 1000, 1))
HumanService.refit(body)
FaceService.load_targets(body, load_microsoft_visemes=False, load_meta_visemes=True, load_arkit_faceunits=True)
FaceService.interpolate_targets(body)
# bake a slightly lowered upper lid into the neutral (he has heavier lids than the MakeHuman default)
kb = me.shape_keys.key_blocks
lk = kb["likeness"]
L = np.array([v.co for v in lk.data]); B0 = np.array([v.co for v in kb[0].data])
for nm, wgt in (("eyeBlinkLeft", 0.12), ("eyeBlinkRight", 0.12), ("mouthClose", 0.25)):
    if nm in kb:
        L += wgt * (np.array([v.co for v in kb[nm].data]) - B0)
lk.data.foreach_set("co", L.astype(np.float32).ravel())
HumanService.refit(body)
print("shape keys", len(me.shape_keys.key_blocks))
bpy.ops.wm.save_as_mainfile(filepath=out)
print("SAVED", out)
