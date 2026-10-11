"""Analysis-by-synthesis fine shape step.
For each view: landmarks detected on the render (through the photo camera) are ray-cast onto the mesh; a fine RBF
displacement field is solved (linearised projection) so those surface points move to the photo landmarks.
Usage: fine_fit.py in_fit.npz renderprefix out_fit.npz [lambda]"""
import sys, json, numpy as np, cv2
from geom import detect, ray_mesh, rodrigues
fin, pre, fout = sys.argv[1:4]; LAM = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
F = np.load(fin); V = F["Vfit"].copy(); cams = dict(zip(F["vnames"], F["cams"])); F_PX = float(F["F_PX"])
fs = dict(zip(F["vnames"], F["fs"])) if "fs" in F.files else {}
m = np.load("base_mesh.npz"); Fm = m["F"]; body = m["g_body"]; vid = np.load("corr.npz")["vid"]
L = json.load(open("landmarks.json")); A = json.load(open("analysis2.json"))
VIEWS = [v for v in ["front", "front_close", "three_quarter"] + [f"p{i:02d}" for i in range(1, 21)] if v in cams]
EXPR = {"p02", "p07", "p08", "p10", "p11", "p14", "p15", "p16", "p20"}
S = 0.25
inb = np.zeros(len(V), bool); inb[body] = True
chin_z = V[vid[152], 2]; ear_y = V[vid[234], 1]
headtri = Fm[inb[Fm].all(1) & (V[Fm, 2].min(1) > chin_z - 0.03) & (V[Fm, 1].max(1) < ear_y + 0.01)]
# fine RBF centres on the face (front of the ears, chin to forehead)
reg = body[(V[body, 2] > chin_z - 0.025) & (V[body, 2] < V[vid[10], 2] + 0.01) & (V[body, 1] < ear_y + 0.005)]
rng = np.random.default_rng(0); cent = [reg[0]]; dmin = np.linalg.norm(V[reg] - V[reg[0]], axis=1)
for _ in range(379):
    j = dmin.argmax(); cent.append(reg[j]); dmin = np.minimum(dmin, np.linalg.norm(V[reg] - V[reg[j]], axis=1))
import gzip, os
TD = os.path.expanduser("~/.config/blender/4.5/extensions/user_default/mpfb/data/targets")
V0b = m["V"]; EAR = {}
for side, sgn in (("r", -1), ("l", 1)):
    a_ = np.loadtxt(gzip.open(f"{TD}/ears/{side}-ear-scale-incr.target.gz")); i_ = np.intersect1d(a_[:, 0].astype(int), body)
    EAR[side] = i_[V0b[i_, 0] * sgn > 0.072]
earc = []
for side in "rl":
    e = EAR[side]; ec = [e[0]]; dm = np.linalg.norm(V[e] - V[e[0]], axis=1)
    for _ in range(11):
        j = dm.argmax(); ec.append(e[j]); dm = np.minimum(dm, np.linalg.norm(V[e] - V[e[j]], axis=1))
    earc += ec
C = np.vstack([V[cent], V[earc]]); SIGS = np.concatenate([np.full(len(cent), 0.009), np.full(len(earc), 0.012)])
def phi(P):
    return np.exp(-((P[:, None] - C[None]) ** 2).sum(-1) / (2 * SIGS[None] ** 2))
vn = np.zeros_like(V); fnr = np.cross(V[Fm[:, 1]] - V[Fm[:, 0]], V[Fm[:, 2]] - V[Fm[:, 0]])
for j in range(3): np.add.at(vn, Fm[:, j], fnr)
vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12
EARX = json.load(open("ears_auto.json")); JAWS = {k: np.array(v, float) for k, v in json.load(open("jaw_sil.json")).items()}
rimv = body[(V[body, 2] > chin_z - 0.01) & (V[body, 2] < V[vid[61], 2] + 0.01) & (V[body, 1] < ear_y) & (np.abs(V[body, 0]) > 0.015)]
EXCL = set([13, 14, 78, 308, 82, 312, 87, 317, 95, 324, 88, 318, 178, 402, 81, 311, 80, 310, 191, 415])
OVAL = set([10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109])
rows, rhs, stats, camcols = [], [], [], []
HCS = {}
view_ids = []
for v in VIEWS:
    img = cv2.imread(f"{pre}_{v}.png"); lr = detect(img)
    if lr is None: print(v, "no face on render"); continue
    lr = lr[:468] / S
    lp = np.array((L.get(v) or A[v])["lm"])[:468, :2]
    iod = np.linalg.norm(lp[33] - lp[263])
    c = cams[v]; R = rodrigues(c[:3]); t = c[3:]; f = fs.get(v, F_PX); Cc = -R.T @ t
    d = np.stack([(lr[:, 0] - 1736) / f, (lr[:, 1] - 2312) / f, np.ones(len(lr))], 1) @ R
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    tt, tri, b = ray_mesh(Cc, d, V, headtri)
    ok = np.isfinite(tt) & np.array([i not in EXCL and i not in OVAL for i in range(468)])
    if v in EXPR: ok &= lp[:, 1] < lp[2, 1]   # smiling / open mouth: only the rigid upper face
    P = Cc + d * np.where(ok, tt, 0)[:, None]
    err = (lp - lr) / iod * 100
    stats.append((v, np.sqrt((err[ok] ** 2).sum(1).mean())))
    Pc = P @ R.T + t
    Hc = Pc[ok].mean(0); HCS[v] = Hc
    Ph = phi(P[ok])
    for k, i in enumerate(np.where(ok)[0]):
        X, Y, Z = Pc[i]
        Jc = np.array([[f / Z, 0, -f * X / Z ** 2], [0, f / Z, -f * Y / Z ** 2]])
        J = Jc @ R    # d(pixel)/d(world point)
        Xh, Yh, Zh = Pc[i] - Hc
        skew = np.array([[0, Zh, -Yh], [-Zh, 0, Xh], [Yh, -Xh, 0]])   # rotation about the head centre: d(Pc)/d(omega) = -[Pc-Hc]x
        Jcam = np.hstack([Jc @ skew, Jc])                            # 2 x 6
        tgt = lp[i] - lr[i]
        wgt = 100 / iod
        for r_ in range(2):
            rows.append(wgt * np.kron(Ph[k], J[r_])); rhs.append(wgt * tgt[r_]); camcols.append(wgt * Jcam[r_]); view_ids.append(len(stats) - 1)
    # silhouette-type constraints (x only): ear outer edges, lower-face contour
    def add_x(Pw, tgt_x, wx):
        X, Y, Z = Pw @ R.T + t
        Jc = np.array([f / Z, 0, -f * X / Z ** 2]); Xh, Yh, Zh = np.array([X, Y, Z]) - Hc
        skew = np.array([[0, Zh, -Yh], [-Zh, 0, Xh], [Yh, -Xh, 0]])
        rows.append(wx * np.kron(phi(Pw[None])[0], Jc @ R)); rhs.append(wx * tgt_x)
        camcols.append(wx * np.concatenate([Jc @ skew, Jc])); view_ids.append(len(stats) - 1)
    uvall = (V @ R.T + t); uvx = f * uvall[:, 0] / uvall[:, 2] + 1736; uvy = f * uvall[:, 1] / uvall[:, 2] + 2312
    xinfo = []
    if v in EARX and not os.environ.get("NOSIL"):
        for side, ox in EARX[v].items():
            e = EAR[side]; k_ = e[np.argmin(uvx[e])] if side == "r" else e[np.argmax(uvx[e])]
            add_x(V[k_], ox - uvx[k_], 100 / iod * 1.2); xinfo.append((ox - uvx[k_]) / iod * 100)
    if v in JAWS:
        ray_ = V[rimv] @ R.T + t; nc_ = vn[rimv] @ R.T
        rim_ = rimv[np.abs((ray_ / np.linalg.norm(ray_, axis=1, keepdims=True) * nc_).sum(1)) < 0.15]
        for ob in JAWS[v]:
            side_ok = (uvx[rim_] < uvx[vid[1]]) if ob[0] < uvx[vid[1]] else (uvx[rim_] > uvx[vid[1]])
            cand = rim_[side_ok & (np.abs(uvy[rim_] - ob[1]) < 0.06 * iod)]
            if not len(cand): continue
            k_ = cand[np.argmin(uvx[cand])] if ob[0] < uvx[vid[1]] else cand[np.argmax(uvx[cand])]
            add_x(V[k_], ob[0] - uvx[k_], 100 / iod * float(os.environ.get("JAWW", "1.0"))); xinfo.append((ob[0] - uvx[k_]) / iod * 100)
    if xinfo: print(f"   {v}: silhouette x-errors %iod mean|.| {np.mean(np.abs(xinfo)):.2f} (n={len(xinfo)})")
# ---- PROFILE SILHOUETTE: frontmost model point per image row vs photo contour (forehead -> nose -> lips -> chin -> under-chin)
PROF = {"profile_right_side": (+1, [(1290, 1480), (1790, 2880)]), "profile_left_side": (-1, [(1000, 1270), (1680, 2760)])}
midv = body[(np.abs(V[body, 0]) < 0.012) & (V[body, 2] > chin_z - 0.07) & (V[body, 1] < V[vid[1], 1] + 0.06)]
for v, (facing, rowsets) in PROF.items():
    if v not in cams: continue
    c = cams[v]; R = rodrigues(c[:3]); t = c[3:]; f = fs.get(v, F_PX)
    cont = np.load(f"sil_{v}.npy"); Pc_ = V[midv] @ R.T + t
    ux = f * Pc_[:, 0] / Pc_[:, 2] + 1736; uy = f * Pc_[:, 1] / Pc_[:, 2] + 2312
    Hc = Pc_.mean(0); HCS[v] = Hc; stats.append((v, float("nan"))); errs = []
    for a_, b_ in rowsets:
        for y0 in range(a_, b_, 30):
            sel = (uy >= y0) & (uy < y0 + 30)
            if not sel.any() or not np.isfinite(cont[y0 + 15]): continue
            k_ = midv[sel][np.argmax(ux[sel] * facing)]
            X, Y, Z = V[k_] @ R.T + t; px = f * X / Z + 1736
            e = (cont[y0 + 15] - px)
            Jc = np.array([f / Z, 0, -f * X / Z ** 2]); Xh, Yh, Zh = np.array([X, Y, Z]) - Hc
            skew = np.array([[0, Zh, -Yh], [-Zh, 0, Xh], [Yh, -Xh, 0]]); wx = 100 / 700 * 1.0   # ~700 px ear-to-canthus scale
            rows.append(wx * np.kron(phi(V[k_][None])[0], Jc @ R)); rhs.append(wx * e)
            camcols.append(wx * np.concatenate([Jc @ skew, Jc])); view_ids.append(len(stats) - 1); errs.append(e)
    print(f"   {v}: profile contour error px mean|.| {np.mean(np.abs(errs)):.1f} (n={len(errs)})")
print("landmark RMS (%iod) per view:", " ".join(f"{v}:{e:.2f}" for v, e in stats))
print("mean RMS", np.nanmean([e for _, e in stats]))
nViews = len(stats)
Acam = np.zeros((len(rows), 6 * nViews)); vi = np.array(view_ids)
Acam[np.arange(len(rows))[:, None], 6 * vi[:, None] + np.arange(6)[None]] = np.array(camcols)
Amat = np.hstack([np.array(rows), Acam]); bvec = np.array(rhs)
nC = len(C) * 3
reg_ = np.zeros((nC + 6 * nViews, nC + 6 * nViews))
reg_[:nC, :nC] = np.sqrt(LAM) * np.eye(nC) * 1000      # 1 mm of coefficient costs as much as 1 % iod of landmark error
reg_[nC:, nC:] = np.diag(np.tile([300., 300., 300., 1000, 1000, 1000], nViews))   # 1 deg or 1 mm ~ 1 % iod
sol = np.linalg.lstsq(np.vstack([Amat, reg_]), np.concatenate([bvec, np.zeros(nC + 6 * nViews)]), rcond=None)[0]
pred = Amat @ sol - bvec
print("predicted residual RMS after step: %.2f (before %.2f)" % (np.sqrt((pred ** 2).mean() * 2), np.sqrt((bvec ** 2).mean() * 2)))
cvec = sol[:nC].reshape(-1, 3); dcam = sol[nC:].reshape(-1, 6)
names_done = [v for v, _ in stats]
newcams = dict(cams)
for v, dc in zip(names_done, dcam):
    R0 = rodrigues(cams[v][:3]); Rd = rodrigues(dc[:3]); R1 = Rd @ R0
    Hc = HCS[v]; t1 = Rd @ (cams[v][3:] - Hc) + Hc + dc[3:]
    newcams[v] = np.concatenate([cv2.Rodrigues(R1)[0].ravel(), t1])
    print("   cam update", v, "rot deg %.2f" % np.degrees(np.linalg.norm(dc[:3])), "trans mm %.1f" % (np.linalg.norm(dc[3:]) * 1000))
# apply with a smooth fade outside the face region
fade = np.zeros(len(V)); fade[body] = 1
Dv = np.zeros_like(V)
for s0 in range(0, len(V), 4000):
    Dv[s0:s0 + 4000] = phi(V[s0:s0 + 4000]) @ cvec
print("fine displacement mm: max %.2f  p95 %.2f" % (np.abs(Dv).max() * 1000, np.percentile(np.linalg.norm(Dv, axis=1)[reg], 95) * 1000))
out = {k: F[k] for k in F.files}; out["Vfit"] = V + Dv
out["cams"] = np.array([newcams[v] for v in F["vnames"]])
np.savez(fout, **out)
print("SAVED", fout)
