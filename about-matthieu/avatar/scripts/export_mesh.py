"""Export basemesh geometry (with current shape-key mix), faces, UVs and vertex groups to npz.
Run: blender -b file.blend --python export_mesh.py -- out.npz
"""
import bpy, sys, numpy as np

out = sys.argv[sys.argv.index("--") + 1]
body = next(o for o in bpy.data.objects if o.name.endswith(".body"))
me = body.data
n = len(me.vertices)
V = np.zeros((n, 3))
kb = me.shape_keys.key_blocks if me.shape_keys else []
if kb:
    basis = np.array([v.co for v in kb[0].data])
    V = basis.copy()
    for k in kb[1:]:
        if k.value != 0 and not k.mute:
            V += k.value * (np.array([v.co for v in k.data]) - basis)
else:
    V = np.array([v.co for v in me.vertices])
V = np.array([body.matrix_world @ __import__("mathutils").Vector(p) for p in V])
me.calc_loop_triangles()
F = np.array([t.vertices[:] for t in me.loop_triangles])
FL = np.array([t.loops[:] for t in me.loop_triangles])
uv = np.array([d.uv[:] for d in me.uv_layers.active.data])
groups = {}
for g in body.vertex_groups:
    idx = [v.index for v in me.vertices if any(e.group == g.index and e.weight > 0.5 for e in v.groups)]
    groups[g.name] = np.array(idx, dtype=np.int32)
np.savez(out, V=V, F=F, FL=FL, uv=uv, gnames=np.array(list(groups.keys())), **{"g_" + k: v for k, v in groups.items()})
print("EXPORTED", n, len(F), list(groups.keys())[:80])
