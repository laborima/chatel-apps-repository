import bpy, sys, math
from mathutils import Vector
out = sys.argv[sys.argv.index("--") + 1]
sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE_NEXT"; sc.eevee.taa_render_samples = 16; sc.view_settings.view_transform = "Standard"
w = sc.world or bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.65, 0.78, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.8
sun = bpy.data.lights.new("s", "SUN"); sun.energy = 3; so = bpy.data.objects.new("s", sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(30))
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0.03)); water = bpy.context.active_object
wm = bpy.data.materials.new("water"); wm.use_nodes = True; wm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.35, 0.3, 0.22, 1); water.data.materials.append(wm)
cd = bpy.data.cameras.new("c"); cd.lens = 35; cam = bpy.data.objects.new("c", cd); sc.collection.objects.link(cam); sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y = 640, 720
tgt = Vector((-0.3, -0.3, 1.5))
import os
VIEWS = (("front", (6, -1.5, 2.2), 1), ("side", (1.0, -7.0, 2.0), 30), ("back", (-6.5, -1.0, 2.4), 60))
if os.environ.get("ONLY"): VIEWS = [v for v in VIEWS if v[0] == os.environ["ONLY"]]
for name, pos, fr in VIEWS:
    sc.frame_set(fr); cam.location = pos; cam.rotation_euler = (tgt - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = f"{out}_{name}.png"; bpy.ops.render.render(write_still=True)
