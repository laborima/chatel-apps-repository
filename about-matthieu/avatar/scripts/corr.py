import numpy as np, cv2, json
from geom import *
m = np.load("base_mesh.npz"); V, F = m["V"], m["F"]
body = set(m["g_body"].tolist())
Fb = F[np.all(np.isin(F, list(body)), 1)]
meta = json.load(open("corr/corr_meta.json"))
pts = []
for name, c in meta.items():
    img = cv2.imread(f"corr/{name}.png")
    lm = detect(img)
    print(name, None if lm is None else lm.shape)
    if lm is None: continue
    vis = img.copy()
    for x, y in lm: cv2.circle(vis, (int(x), int(y)), 2, (0, 0, 255), -1)
    cv2.imwrite(f"corr/lm_{name}.jpg", vis)
    C, d = blender_cam_rays(c["M"], c["f"], c["W"], c["H"], lm)
    t, tri, b = ray_mesh(C, d, V, Fb)
    P = C + d * t[:, None]
    P[~np.isfinite(t)] = np.nan
    pts.append(P)
pts = np.array(pts)
P = np.nanmedian(pts, 0)
spread = np.nanmax(np.linalg.norm(pts - P[None], axis=2), 0)
print("spread mm median/max", np.nanmedian(spread) * 1000, np.nanmax(spread) * 1000)
# snap to closest surface point via closest vertex then re-ray along normal-ish: use closest vertex + local tri
from scipy.spatial import cKDTree
kd = cKDTree(V[list(body)]); bl = np.array(list(body))
_, i = kd.query(P)
vid = bl[i]
np.savez("corr.npz", P=P, vid=vid, spread=spread)
print("snap err mm", np.median(np.linalg.norm(V[vid] - P, axis=1)) * 1000)
