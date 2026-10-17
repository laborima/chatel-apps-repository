"""Matthieu's head and shoulders (the rider's avatar, same build), alone: for the Tintin shark's hatch.
Run: AVATAR_GLB=avatar.glb blender -b --python head_build.py -- head.glb
Static mesh (rest pose), head up +Y in glTF, facing -Z; the cut is a little below the shoulders, wetsuit black."""
import bpy, sys, os, math
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1]
WS = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.environ["AVATAR_GLB"])
for o in list(bpy.data.objects):
    if o.type == "MESH" and (o.parent is None or "glasses" in o.name or "shoes" in o.name or "Teeth" in o.name or "Tongue" in o.name):
        bpy.data.objects.remove(o)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
if arm.animation_data: arm.animation_data_clear()
exec(open(f"{WS}/rider_shape.py").read())                # same height and build as the windsurfer
# arms down a little (the T-pose shoulders would stick out of the hatch)
pb = arm.pose.bones
for sd, sg in (("Left", 1), ("Right", -1)):
    b = pb[sd + "Arm"]; b.rotation_mode = "QUATERNION"
    M = arm.data.bones[sd + "Arm"].matrix_local
    from mathutils import Matrix
    b.rotation_quaternion = (M.inverted() @ Matrix.Rotation(math.radians(70 * sg), 4, "Y") @ M).to_quaternion()
bpy.context.view_layer.update()
neck = arm.data.bones["Neck"].head_local.z
CUT = neck - 0.22                                         # mid-chest
keep = []
for o in [o for o in bpy.data.objects if o.type == "MESH"]:
    # bake the pose, drop the rig
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    if o.data.shape_keys: o.shape_key_clear()                              # face expressions: not needed, and they block the bake
    for md in list(o.modifiers):
        if md.type == "ARMATURE": bpy.ops.object.modifier_apply(modifier=md.name)
    o.select_set(False)
    o.parent = None
    import bmesh
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < CUT], context="VERTS")
    bm.to_mesh(o.data); bm.free()
    if len(o.data.vertices) == 0: bpy.data.objects.remove(o); continue
    # the clothes become the wetsuit (black neoprene); the body skin under them is hidden anyway
    if o.name == "Head_Mesh":                             # the neck fades out by alpha into the body: keep it solid
        for mt in o.data.materials:
            pr = next(n for n in mt.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            for l in list(pr.inputs["Alpha"].links): mt.node_tree.links.remove(l)
            pr.inputs["Alpha"].default_value = 1.0
    if any(k in o.name for k in ("_look_",)) or o.name == "Body_Mesh":
        for mt in o.data.materials:
            pr = next(n for n in mt.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            for l in list(pr.inputs["Alpha"].links): mt.node_tree.links.remove(l)      # Avaturn hides the body with alpha
            pr.inputs["Alpha"].default_value = 1.0
            if o.name == "Body_Mesh": continue
            for l in list(pr.inputs["Base Color"].links): mt.node_tree.links.remove(l)
            pr.inputs["Base Color"].default_value = (0.02, 0.022, 0.025, 1); pr.inputs["Roughness"].default_value = 0.55
            for l in list(pr.inputs["Alpha"].links): mt.node_tree.links.remove(l)
            pr.inputs["Alpha"].default_value = 1.0
    keep.append(o)
# wetsuit collar: Avaturn leaves a gap between the head mesh and the shirt; a neoprene neck closes it
hm = bpy.data.objects.get("Head_Mesh")
nb = arm.data.bones["Neck"]; nc = arm.matrix_world @ nb.head_local
low = min(v.co.z for v in hm.data.vertices) if hm else nc.z
top_ = low + 0.035; bot = nc.z - 0.05
r0 = 0.5 * (max(v.co.x for v in hm.data.vertices if v.co.z < low + 0.02) - min(v.co.x for v in hm.data.vertices if v.co.z < low + 0.02)) if hm else 0.06
bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=r0 * 1.03, depth=top_ - bot, location=(nc.x, nc.y + 0.005, (top_ + bot) / 2))
col = bpy.context.active_object; col.name = "WetsuitCollar"
cm = bpy.data.materials.new("Neoprene"); cm.use_nodes = True
cm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.02, 0.022, 0.025, 1)
cm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.55
col.data.materials.append(cm); keep.append(col)
print("collar radius", round(r0, 3), "from", round(bot, 3), "to", round(top_, 3))
bpy.data.objects.remove(arm)
# origin at the cut, centred under the neck
for o in keep:
    o.data.transform(__import__("mathutils").Matrix.Translation(Vector((0, 0, -CUT))))
for o in keep: o.select_set(True)
# textures at 512 px: a head seen from a few metres
hair_imgs = {n.image.name for m in bpy.data.materials if "hair" in m.name.lower() and m.node_tree for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image}
for img in bpy.data.images:
    if img.size[0] > 512 and img.name not in hair_imgs: img.scale(512, 512 * img.size[1] // img.size[0])   # the hair keeps its alpha detail
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_animations=False, export_skins=False,
                          export_morph=False, export_image_format="WEBP", export_yup=True)
print("EXPORTED", OUT, round(os.path.getsize(OUT) / 1e6, 2), "MB", "height", round(neck + 0.25 - CUT, 2))
