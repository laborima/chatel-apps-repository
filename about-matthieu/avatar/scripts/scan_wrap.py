"""Wrap the MakeHuman head onto a scan. Usage: scan_wrap.py scandir base_fit.npz out_fit.npz
1. landmarks on the most frontal orbit render -> 3D on the scan; 2. similarity scan->model frame;
3. non-rigid: landmark RBF, then iterated closest-point projection (head/face/ears) with smoothing and neck fade."""
import sys, json, numpy as np, cv2, trimesh
from geom import detect, ray_mesh, blender_cam_rays
sd, fin, fout = sys.argv[1:4]
S = np.load(f"{sd}/scan_mesh.npz"); SV, SF = S["V"], S["F"]; meta = json.load(open(f"{sd}/cams.json"))
best = None
for n, c in meta.items():
    lm = detect(cv2.imread(f"{sd}/{n}.png"))
    if lm is None: continue
    yaw = abs((lm[1, 0] - lm[234, 0]) - (lm[454, 0] - lm[1, 0])) / (lm[454, 0] - lm[234, 0] + 1e-6)
    if best is None or yaw < best[0]: best = (yaw, n, lm, c)
if best is None: sys.exit("no face found on the scan renders")
_, n, lm, c = best; print("frontal view", n, "asym %.2f" % best[0])
C, d = blender_cam_rays(c["M"], c["f"], c["W"], c["H"], lm[:468])
t, tri, b = ray_mesh(C, d, SV, SF, chunk=16)
ok = np.isfinite(t); Ps = C + d * np.where(ok, t, 0)[:, None]
B = np.load(fin); V = B["Vfit"].copy(); m = np.load("base_mesh.npz"); body = m["g_body"]; vid = np.load("corr.npz")["vid"]; sp = np.load("corr.npz")["spread"]
INNER = [33, 133, 159, 145, 362, 263, 386, 374, 1, 2, 4, 5, 6, 168, 197, 195, 98, 327, 61, 291, 0, 17, 13, 14, 70, 105, 107, 336, 334, 300, 152, 199, 175]
use = np.array([i for i in INNER if ok[i]])
Pm = V[vid[use]]
# similarity (Umeyama) scan -> model
mu_s, mu_m = Ps[use].mean(0), Pm.mean(0); X, Y = Ps[use] - mu_s, Pm - mu_m
U, Sg, Vt = np.linalg.svd(Y.T @ X); D = np.eye(3); D[2, 2] = np.sign(np.linalg.det(U @ Vt)); R = U @ D @ Vt
s = (Sg * np.diag(D)).sum() / (X ** 2).sum(); T = mu_m - s * R @ mu_s
SVm = (s * SV @ R.T) + T
res = np.linalg.norm((s * Ps[use] @ R.T + T) - Pm, axis=1)
print("similarity scale %.4f  landmark residual after rigid: median %.1f mm" % (s, np.median(res) * 1000))
scanT = trimesh.Trimesh(SVm, SF, process=False)
# region to wrap: head above the neck (fade over 4 cm), skip inner mouth / eyeball helper (not in body group)
chin_z = V[vid[152], 2]
inb = np.zeros(len(V), bool); inb[body] = True
w_reg = np.clip((V[:, 2] - (chin_z - 0.07)) / 0.04, 0, 1) * inb
Fm = m["F"]; nb = [[] for _ in range(len(V))]
for f in Fm[inb[Fm].all(1)]:
    for a_ in f: nb[a_].extend(f)
nb = [np.unique(x) for x in nb]
def smooth(D, it=3):
    for _ in range(it): D = np.array([D[x].mean(0) if len(x) else D[i] for i, x in enumerate(nb)])
    return D
# landmark RBF
tgt = s * Ps[use] @ R.T + T; dl = tgt - Pm
Cc = Pm; sig = 0.02
K = np.exp(-((Cc[:, None] - Cc[None]) ** 2).sum(-1) / (2 * sig ** 2)) + 1e-3 * np.eye(len(Cc))
coef = np.linalg.solve(K, dl)
reg = np.where(w_reg > 0)[0]
Phi = np.exp(-((V[reg][:, None] - Cc[None]) ** 2).sum(-1) / (2 * sig ** 2))
V[reg] += (Phi @ coef) * w_reg[reg, None]
# closest-point iterations
for it in range(6):
    cp, dist, _ = trimesh.proximity.closest_point(scanT, V[reg])
    good = dist < 0.02   # ignore far points (hair volume, holes)
    Dl = np.zeros_like(V); Dl[reg[good]] = (cp[good] - V[reg[good]]) * w_reg[reg[good], None]
    Dl = smooth(Dl, 2)
    V += 0.7 * Dl
    print(f"  ICP {it}: median dist {np.median(dist) * 1000:.2f} mm, p90 {np.percentile(dist, 90) * 1000:.2f} mm, used {good.mean() * 100:.0f} %")
out = {k: B[k] for k in B.files}; out["Vfit"] = V; np.savez(fout, **out); print("SAVED", fout)
