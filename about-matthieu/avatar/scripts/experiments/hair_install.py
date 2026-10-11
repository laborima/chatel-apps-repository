"""Replace the generic MakeHuman hair with the photo-textured hair shell.
Run: blender -b in.blend --python hair_install.py -- out.blend
"""
import bpy, sys, os, numpy as np
out = sys.argv[sys.argv.index("--") + 1]
B = os.path.dirname(os.path.abspath(out))
d = np.load(f"{B}/hair_cap.npz")

for o in list(bpy.data.objects):
    if o.type == "MESH" and (o.name.endswith(".short02") or o.name == "Avatar.hair"):
        bpy.data.objects.remove(o)

body = next(o for o in bpy.data.objects if o.name.endswith(".body"))
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
me = bpy.data.meshes.new("Avatar.hair")
me.from_pydata(d["V"].tolist(), [], d["F"].tolist())
uvl = me.uv_layers.new(name="UVMap")
uvl.data.foreach_set("uv", d["uv"].astype(np.float32).ravel())
me.shade_smooth() if hasattr(me, "shade_smooth") else None
for p in me.polygons: p.use_smooth = True
hair = bpy.data.objects.new("Avatar.hair", me)
body.users_collection[0].objects.link(hair)

# skin weights: copy from the source scalp vertices
src = d["src"]
bw = {}
for vi_new, vi in enumerate(src):
    for g in body.data.vertices[int(vi)].groups:
        name = body.vertex_groups[g.group].name
        if name in rig.data.bones:
            bw.setdefault(name, []).append((vi_new, g.weight))
for name, lst in bw.items():
    vg = hair.vertex_groups.new(name=name)
    for i, w in lst: vg.add([i], w, "REPLACE")
sd = hair.modifiers.new("Subdiv", "SUBSURF"); sd.levels = 2; sd.render_levels = 2; sd.uv_smooth = "PRESERVE_CORNERS"
bpy.context.view_layer.objects.active = hair; hair.select_set(True)
bpy.ops.object.modifier_apply(modifier="Subdiv")
hair.parent = rig
md = hair.modifiers.new("Armature", "ARMATURE"); md.object = rig

mt = bpy.data.materials.new("Hair"); mt.use_nodes = True
nt = mt.node_tree; p = nt.nodes["Principled BSDF"]
t = nt.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(f"{B}/hair_4k.png")
t.image.alpha_mode = "CHANNEL_PACKED"
nt.links.new(t.outputs["Color"], p.inputs["Base Color"]); nt.links.new(t.outputs["Alpha"], p.inputs["Alpha"])
p.inputs["Roughness"].default_value = 0.65; p.inputs["Specular IOR Level"].default_value = 0.22
mt.surface_render_method = "DITHERED"
mt.use_backface_culling = False
me.materials.append(mt)
print("hair verts", len(me.vertices), "groups", len(bw))

# --- top hair cards ---
for o in list(bpy.data.objects):
    if o.name == "Avatar.hair_cards": bpy.data.objects.remove(o)
c = np.load(f"{B}/hair_cards.npz")
cm = bpy.data.meshes.new("Avatar.hair_cards")
cm.from_pydata(c["V"].tolist(), [], c["F"].tolist())
cuv = cm.uv_layers.new(name="UVMap")
loops_uv = c["uv"][np.array([l.vertex_index for l in cm.loops])]
cuv.data.foreach_set("uv", loops_uv.astype(np.float32).ravel())
for p_ in cm.polygons: p_.use_smooth = True
cards = bpy.data.objects.new("Avatar.hair_cards", cm)
body.users_collection[0].objects.link(cards)
head_bone = next(b.name for b in rig.data.bones if b.name.lower().endswith("head"))
vg = cards.vertex_groups.new(name=head_bone); vg.add(list(range(len(cm.vertices))), 1.0, "REPLACE")
cards.parent = rig
cmod = cards.modifiers.new("Armature", "ARMATURE"); cmod.object = rig
sm = bpy.data.materials.new("HairStrands"); sm.use_nodes = True
snt = sm.node_tree; sp = snt.nodes["Principled BSDF"]
st = snt.nodes.new("ShaderNodeTexImage"); st.image = bpy.data.images.load(f"{B}/strands.png"); st.image.alpha_mode = "CHANNEL_PACKED"
snt.links.new(st.outputs["Color"], sp.inputs["Base Color"]); snt.links.new(st.outputs["Alpha"], sp.inputs["Alpha"])
sp.inputs["Roughness"].default_value = 0.6; sp.inputs["Specular IOR Level"].default_value = 0.22
sm.surface_render_method = "DITHERED"; sm.use_backface_culling = False
cm.materials.append(sm)
print("cards", len(cm.polygons))
bpy.ops.wm.save_as_mainfile(filepath=out)
print("SAVED", out)
