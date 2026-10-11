"""Render-based correspondences: detect landmarks on renders made through each photo camera,
ray-cast them onto the fitted mesh. Output rcorr.npz with per-view vertex ids + validity."""
import numpy as np, cv2, sys
from geom import detect, ray_mesh, rodrigues
pre = sys.argv[1]; fitf = sys.argv[2]; S = 4.0
r = np.load(fitf); V = r["Vfit"]; cams = dict(zip(r["vnames"], r["cams"])); F_PX = float(r["F_PX"])
m = np.load("base_mesh.npz"); F = m["F"]; body = m["g_body"]
inb = np.zeros(len(V), bool); inb[body] = True; Fb = F[inb[F].all(1)]
out = {}
for v in ["front", "front_close", "three_quarter", "front_torso"]:
    img = cv2.imread(f"../shots/{pre}_{v}.png")
    lm = detect(img)
    if lm is None: print(v, "no face"); continue
    lm = lm * S
    c = cams[v]; R = rodrigues(c[:3]); t = c[3:]
    C = -R.T @ t
    d = np.stack([(lm[:, 0] - 1736) / F_PX, (lm[:, 1] - 2312) / F_PX, np.ones(len(lm))], 1) @ R  # cam->world: R^T d
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    tt, tri, b = ray_mesh(C, d, V, Fb)
    ok = np.isfinite(tt)
    P = C + d * np.where(ok, tt, 0)[:, None]
    f = Fb[np.maximum(tri, 0)]
    # nearest vertex of the hit triangle
    dist = np.linalg.norm(V[f] - P[:, None], axis=2); vid = f[np.arange(len(f)), dist.argmin(1)]
    snap = dist.min(1)
    out[v] = vid; out[v + "_ok"] = ok & (snap < 0.004)
    print(v, "hits", ok.sum(), "valid", out[v + "_ok"].sum())
np.savez("rcorr.npz", **out)
