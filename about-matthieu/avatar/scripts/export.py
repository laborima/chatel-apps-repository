"""Final export: bake modelling shape keys, reload visemes/ARKit relative to the fitted shape,
add TalkingHead combo shapes, fix bone axes, glTF-friendly alpha modes, export GLB + FBX + clean .blend.
Run: blender -b avatar.blend --python export.py -- outdir
"""
import bpy, sys, os, numpy as np
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.services.faceservice import FaceService
from bl_ext.user_default.mpfb.services.exportservice import ExportService

outdir = sys.argv[sys.argv.index("--") + 1]
os.makedirs(outdir, exist_ok=True)
TH = "/home/claude/workspace/avatar-3d/tools/talkinghead/talkinghead-addon.py"

body = next(o for o in bpy.data.objects if o.name.endswith(".body"))
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")

# 1. bake macros + likeness into the base, reload face units relative to the new base
TargetService.bake_targets(body)
FaceService.load_targets(body, load_microsoft_visemes=False, load_meta_visemes=True, load_arkit_faceunits=True)
FaceService.interpolate_targets(body)
ExportService.bake_modifiers_remove_helpers(body, bake_masks=True, bake_subdiv=False, remove_helpers=True, also_proxy=False)
for md in list(body.modifiers):
    if md.type == "MASK": body.modifiers.remove(md)

# 2. TalkingHead combined shapes
COMBOS = {"mouthOpen": {"jawOpen": 1.0}, "mouthSmile": {"mouthSmileLeft": 1.0, "mouthSmileRight": 1.0},
          "eyesClosed": {"eyeBlinkLeft": 1.0, "eyeBlinkRight": 1.0},
          "eyesLookUp": {"eyeLookUpLeft": 1.0, "eyeLookUpRight": 1.0},
          "eyesLookDown": {"eyeLookDownLeft": 1.0, "eyeLookDownRight": 1.0}}
for o in bpy.data.objects:
    if o.type != "MESH" or not o.data.shape_keys: continue
    kb = o.data.shape_keys.key_blocks
    base = np.array([v.co for v in kb[0].data])
    for name, parts in COMBOS.items():
        if name in kb or not any(p in kb for p in parts): continue
        co = base.copy()
        for p, w in parts.items():
            if p in kb: co += w * (np.array([v.co for v in kb[p].data]) - base)
        sk = o.shape_key_add(name=name, from_mix=False); sk.data.foreach_set("co", co.astype(np.float32).ravel())
    # drop leftover fitting keys on proxies (keep Basis + face keys only)
    keep = set(["Basis"]) | set(COMBOS) | set(FaceService.__dict__.get("x", []))
    for k in list(kb):
        if k.name.startswith("temporary_fitting_key"): o.shape_key_remove(k)

# 3. TalkingHead bone-axis fix (A-pose) and naming
src = open(TH).read()
ns = {}
exec(compile(src.split("# Operator:")[0], TH, "exec"), ns)   # helper functions + data only
bpy.ops.object.select_all(action="DESELECT"); rig.select_set(True); bpy.context.view_layer.objects.active = rig
ns["fix_bone_axes"]([rig], ns["BONE_AXES_DATA_A"])
rig.name = "Armature"; rig.data.name = "Armature"
for o in bpy.data.objects:
    if o.type == "MESH" and o.name.startswith("Avatar."):
        o.name = "Avatar_" + o.name.split(".", 1)[1]

# 4. feet back on the ground (apply_fit may have shifted the character to keep the head on the photo cameras)
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get(); zmin = 1e9
for ob in bpy.data.objects:
    if ob.type != "MESH" or ob.hide_render: continue
    oe = ob.evaluated_get(dg); me_ = oe.to_mesh()
    if len(me_.vertices): zmin = min(zmin, min((oe.matrix_world @ v.co).z for v in me_.vertices))
    oe.to_mesh_clear()
rig.location.z -= zmin; print("grounded by mm", round(zmin * 1000, 1))
# apply transforms
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# 5. glTF alpha modes: MASK (alpha > 0.5) for hair/brows/lashes, BLEND for lenses/eyes, OPAQUE otherwise
def to_mask(mat, thr=0.5):
    nt = mat.node_tree; p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    if not p.inputs["Alpha"].is_linked: return
    link = p.inputs["Alpha"].links[0]
    if link.from_node.type == "MATH": return      # already an alpha-clip setup (hair shells)
    gt = nt.nodes.new("ShaderNodeMath"); gt.operation = "GREATER_THAN"; gt.inputs[1].default_value = thr
    nt.links.new(link.from_socket, gt.inputs[0]); nt.links.new(gt.outputs[0], p.inputs["Alpha"])
for mat in bpy.data.materials:
    if not mat.use_nodes: continue
    n = mat.name.lower()
    if "hair" in n: to_mask(mat, 0.4)   # brows / lashes stay BLEND (alpha-clip makes them dotted)
print("materials", [m.name for m in bpy.data.materials])

if os.environ.get("CLAY"):
    _nt = bpy.data.materials["Skin"].node_tree; _pr = next(n for n in _nt.nodes if n.type == "BSDF_PRINCIPLED")
    for _l in list(_pr.inputs["Base Color"].links): _nt.links.remove(_l)
    _pr.inputs["Base Color"].default_value = (0.13, 0.07, 0.05, 1); _pr.inputs["Roughness"].default_value = 0.6
# 6. pack + save, export GLB and FBX  (WEB=1: light GLB only, textures <= 2048 px, WebP)
if os.environ.get("WEB"):
    for im in bpy.data.images:
        if im.size[0] > 2048: im.scale(2048, 2048)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=f"{outdir}/avatar_web.glb", export_format="GLB", use_selection=True, export_animations=False,
                              export_skins=True, export_morph=True, export_morph_normal=False, export_image_format="WEBP",
                              export_image_quality=82, export_yup=True)
    print("EXPORTED WEB", os.path.getsize(f"{outdir}/avatar_web.glb") / 1e6, "MB"); sys.exit(0)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=f"{outdir}/avatar.blend")
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=f"{outdir}/avatar.glb", export_format="GLB", use_selection=True,
                          export_animations=False, export_skins=True, export_morph=True, export_morph_normal=False,
                          export_image_format="AUTO", export_yup=True)
bpy.ops.export_scene.fbx(filepath=f"{outdir}/avatar.fbx", use_selection=True, add_leaf_bones=False,
                         bake_anim=False, path_mode="COPY", embed_textures=True, mesh_smooth_type="FACE")
for o in bpy.data.objects:
    if o.type == "MESH":
        print("EXP", o.name, len(o.data.vertices), len(o.data.shape_keys.key_blocks) if o.data.shape_keys else 0)
print("BONES", len(rig.data.bones))
print("EXPORTED")
