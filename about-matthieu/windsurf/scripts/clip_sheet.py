# Contact sheet of the baked clips: CLIPSHOTS="Tack:1,20,36,52,72;Jibe:..." renders each (clip, frame) from VIEW
import bpy, sys, math, os
from mathutils import Vector
out = sys.argv[sys.argv.index("--") + 1]
sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE_NEXT"; sc.eevee.taa_render_samples = 8; sc.view_settings.view_transform = "Standard"
w = sc.world or bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.65, 0.78, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.8
sun = bpy.data.lights.new("s", "SUN"); sun.energy = 3; so = bpy.data.objects.new("s", sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(30))
cd = bpy.data.cameras.new("c"); cd.lens = float(os.environ.get("LENS", "32")); cam = bpy.data.objects.new("c", cd); sc.collection.objects.link(cam); sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y = 420, 480
VIEW = {"aft": (-0.6, -4.2, 1.7), "front": (2.6, 0.4, 1.7), "game": (-4.5, -7.5, 2.6), "hands": (-1.7, 0.9, 2.3), "hands2": (-0.6, -2.0, 2.0), "bow": (-1.2, 4.6, 2.0), "wind": (-3.6, 3.0, 2.2), "three": (5.5, 3.5, 3.2), "side": (7.5, -0.6, 1.8), "top": (2.0, -1.0, 7.5), "aft": (-1.0, -7.0, 2.6), "lee": (9.0, -0.7, 2.6)}[os.environ.get("VIEW", "three")]
tgt = Vector(tuple(float(x) for x in os.environ.get("TGT", "0,-0.25,1.0").split(",")))
cam.location = VIEW; cam.rotation_euler = (tgt - Vector(VIEW)).to_track_quat("-Z", "Y").to_euler()
animated = [o for o in bpy.data.objects if o.animation_data] + [k for k in bpy.data.shape_keys if k.animation_data]
for spec in os.environ["CLIPSHOTS"].split(";"):
    clip, frames = spec.split(":")
    for idb in animated:
        for tr in idb.animation_data.nla_tracks: tr.mute = tr.name != clip
    for f in frames.split(","):
        sc.frame_set(int(f)); sc.render.filepath = f"{out}_{clip}_{int(f):03d}.png"; bpy.ops.render.render(write_still=True)
