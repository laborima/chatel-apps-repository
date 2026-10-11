"""Stage 3: glTF-friendly materials (photo skin, white shirt, eye colour).
Run: blender -b in.blend --python materials.py -- out.blend
"""
import bpy, sys, os
out = sys.argv[sys.argv.index("--") + 1]
B = os.path.dirname(os.path.abspath(out))
DATA = os.path.expanduser("~/.config/blender/4.5/extensions/.user/user_default/mpfb/data")

def img(path, colour=True):
    im = bpy.data.images.load(path, check_existing=True)
    if not colour: im.colorspace_settings.name = "Non-Color"
    return im

def principled(name, base_img, rough=0.5, sss=0.0, normal_img=None, spec=0.5, alpha=False):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial"); o.location = (400, 0)
    p = nt.nodes.new("ShaderNodeBsdfPrincipled"); p.location = (100, 0)
    t = nt.nodes.new("ShaderNodeTexImage"); t.location = (-300, 0); t.image = base_img
    nt.links.new(t.outputs["Color"], p.inputs["Base Color"])
    if alpha:
        nt.links.new(t.outputs["Alpha"], p.inputs["Alpha"])
        m.blend_method = "HASHED" if hasattr(m, "blend_method") else None
    p.inputs["Roughness"].default_value = rough
    p.inputs["Specular IOR Level"].default_value = spec
    if sss > 0:
        p.inputs["Subsurface Weight"].default_value = sss
        p.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.2)
        p.inputs["Subsurface Scale"].default_value = 0.006
    if normal_img is not None:
        n = nt.nodes.new("ShaderNodeNormalMap"); n.location = (-100, -300)
        tn = nt.nodes.new("ShaderNodeTexImage"); tn.location = (-400, -300); tn.image = normal_img
        nt.links.new(tn.outputs["Color"], n.inputs["Color"]); nt.links.new(n.outputs["Normal"], p.inputs["Normal"])
    nt.links.new(p.outputs["BSDF"], o.inputs["Surface"])
    return m, p

def assign(obj, mat):
    obj.data.materials.clear(); obj.data.materials.append(mat)

objs = {o.name.split(".", 1)[1] if "." in o.name else o.name: o for o in bpy.data.objects if o.type == "MESH"}
skin, _ = principled("Skin", img(f"{B}/skin_4k.png"), rough=0.66, sss=0.0, spec=0.2)
# tone (saturation 0.8, value 0.92) is baked into skin_4k.png by bake.py so it survives glTF export
assign(objs["body"], skin)
suit = objs.get("male_casualsuit01")
if suit:
    m, _ = principled("Clothes", img(f"{B}/shirt_white.png"), rough=0.8, spec=0.3,
                      normal_img=img(f"{DATA}/clothes/male_casualsuit01/male_casualsuit01_normal.png", False))
    assign(suit, m)
eyes = objs.get("high-poly")
if eyes:
    for mat in eyes.data.materials:
        for n in mat.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.name == "diffuseTexture":
                n.image = img(f"{B}/eye_custom.png")
        print("EYE MAT", mat.name, mat.blend_method, [n.type for n in mat.node_tree.nodes])
for key in ("eyebrow001", "eyebrow012", "eyelashes01"):
    o = objs.get(key)
    if not o: continue
    for mat in o.data.materials:
        nt = mat.node_tree
        p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        t = next(n for n in nt.nodes if n.name == "diffuseTexture")
        if key.startswith("eyebrow"):
            t.image = img(f"{B}/brow_custom.png"); t.image.alpha_mode = "CHANNEL_PACKED"
            for n_ in list(nt.nodes):
                if n_.type == "BUMP": nt.nodes.remove(n_)
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs["B"].default_value = (1, 1, 1, 1) if key.startswith("eyebrow") else (0.1, 0.07, 0.05, 1)
        nt.links.new(t.outputs["Color"], mix.inputs["A"]); nt.links.new(mix.outputs["Result"], p.inputs["Base Color"])
# keep the neck/upper chest skin under the open collar (otherwise the collar inside shows through)
import numpy as _np
_vid = _np.load(f"{B}/corr.npz")["vid"]; _V = _np.load(f"{B}/fit2_result.npz")["Vfit"]
_zc = _V[_vid[152], 2]
bo = objs["body"]
for vg in bo.vertex_groups:
    if vg.name.startswith("Delete."):
        ids = [v.index for v in bo.data.vertices if _V[v.index, 2] > _zc - 0.17]
        vg.remove(ids); print("kept neck verts", vg.name, len(ids))
bpy.ops.wm.save_as_mainfile(filepath=out)
print("SAVED", out)
