"""Install shell hair (replaces MakeHuman hair, old cap and cards).
Run: blender -b in.blend --python hair_install_shells.py -- out.blend
"""
import bpy, sys, os, numpy as np
out = sys.argv[sys.argv.index("--") + 1]
B = os.path.dirname(os.path.abspath(out))
d = np.load(f"{B}/hair_shells.npz"); K = int(d["K"])
for o in list(bpy.data.objects):
    if o.type == "MESH" and (o.name.endswith(".short02") or o.name in ("Avatar.hair", "Avatar.hair_cards")):
        bpy.data.objects.remove(o)
body = next(o for o in bpy.data.objects if o.name.endswith(".body"))
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")

me = bpy.data.meshes.new("Avatar.hair")
me.from_pydata(d["V"].tolist(), [], d["F"].tolist())
uvl = me.uv_layers.new(name="UVMap"); uvl.data.foreach_set("uv", d["uv"].astype(np.float32).ravel())
me.polygons.foreach_set("material_index", d["mat"].astype(np.int32))
me.polygons.foreach_set("use_smooth", np.ones(len(me.polygons), bool))
hair = bpy.data.objects.new("Avatar.hair", me); body.users_collection[0].objects.link(hair)

src = d["src"]; bw = {}
for vi_new, vi in enumerate(src):
    for g in body.data.vertices[int(vi)].groups:
        name = body.vertex_groups[g.group].name
        if name in rig.data.bones: bw.setdefault(name, []).append((vi_new, g.weight))
for name, lst in bw.items():
    vg = hair.vertex_groups.new(name=name)
    for i, w in lst: vg.add([i], w, "REPLACE")

img = bpy.data.images.load(f"{B}/hair_shell.png"); img.alpha_mode = "CHANNEL_PACKED"
for k in range(K):
    mt = bpy.data.materials.new(f"Hair_shell{k}"); mt.use_nodes = True
    nt = mt.node_tree; p = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = img
    gt = nt.nodes.new("ShaderNodeMath"); gt.operation = "GREATER_THAN"; gt.inputs[1].default_value = 0.15 + 0.33 * k / (K - 1)
    nt.links.new(t.outputs["Color"], p.inputs["Base Color"]); nt.links.new(t.outputs["Alpha"], gt.inputs[0])
    nt.links.new(gt.outputs[0], p.inputs["Alpha"])
    p.inputs["Roughness"].default_value = 0.85; p.inputs["Specular IOR Level"].default_value = 0.05
    mt.surface_render_method = "DITHERED"; mt.use_backface_culling = False
    me.materials.append(mt)

sd = hair.modifiers.new("Subdiv", "SUBSURF"); sd.levels = 2; sd.render_levels = 2; sd.uv_smooth = "PRESERVE_CORNERS"
bpy.context.view_layer.objects.active = hair; hair.select_set(True)
bpy.ops.object.modifier_apply(modifier="Subdiv")
hair.parent = rig
md = hair.modifiers.new("Armature", "ARMATURE"); md.object = rig
print("hair shells", K, "verts", len(me.vertices))
bpy.ops.wm.save_as_mainfile(filepath=out)
print("SAVED", out)
