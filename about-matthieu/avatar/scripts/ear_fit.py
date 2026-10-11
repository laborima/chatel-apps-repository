"""Fit each ear (MakeHuman ear targets, per side) to hand-traced profile contours + frontal ear extents.
Usage: ear_fit.py in.npz out.npz"""
import sys, json, glob, gzip, os, numpy as np, cv2
from scipy.optimize import least_squares
from scipy.spatial import ConvexHull
from geom import rodrigues, project
fin, fout = sys.argv[1:3]
F = np.load(fin); V = F["Vfit"].copy(); cams = dict(zip(F["vnames"], F["cams"])); fs = dict(zip(F["vnames"], F["fs"])); F_PX = float(F["F_PX"])
m = np.load("base_mesh.npz"); V0b = m["V"]; body = m["g_body"]
TD = os.path.expanduser("~/.config/blender/4.5/extensions/user_default/mpfb/data/targets")
CONT = json.load(open("ear_contours.json")); EARX = json.load(open("ears_auto.json"))
def load_t(p):
    a = np.loadtxt(gzip.open(p), ndmin=2); return a[:, 0].astype(int), np.stack([a[:, 1], -a[:, 3], a[:, 2]], 1) * 0.1
def dense(poly, n=60):
    P = np.array(poly, float); seg = np.linalg.norm(np.diff(P, axis=0), axis=1); s = np.concatenate([[0], np.cumsum(seg)])
    t = np.linspace(0, s[-1], n); return np.stack([np.interp(t, s, P[:, 0]), np.interp(t, s, P[:, 1])], 1)
for side, sgn, prof in (("r", -1, "profile_right_side"), ("l", 1, "profile_left_side")):
    files = sorted(glob.glob(f"{TD}/ears/{side}-ear-*.target.gz"))
    names = [os.path.basename(f)[2:-10] for f in files]
    Ds = []
    for f in files:
        i, d = load_t(f); D = np.zeros_like(V); D[i] = d; Ds.append(D)
    Ds = np.array(Ds)
    a_, d_ = load_t(f"{TD}/ears/{side}-ear-scale-incr.target.gz"); mag = np.linalg.norm(d_, axis=1)
    ear = m["g_ears"]; ear = ear[V0b[ear, 0] * sgn > 0]   # MakeHuman 'ears' vertex group: the whole auricle
    region = np.unique(np.concatenate([np.where(np.abs(Ds).sum((0, 2)) > 0)[0]]))
    Vr = V[region]; Dr = Ds[:, region]; pos = {v: k for k, v in enumerate(region)}; ek = np.array([pos[e] for e in ear])
    FACEDIR = np.array([1.0, 0.0]) if prof == "profile_right_side" else np.array([-1.0, 0.0])
    target = dense(CONT[prof]); c = cams[prof]; R = rodrigues(c[:3]); t = c[3:]; f = fs.get(prof, F_PX)
    sc = np.ptp(target[:, 1])   # ear height in px
    fviews = [v for v in EARX if v in cams]
    def outline(w):
        P = Vr[ek] + np.tensordot(w, Dr[:, ek], 1); uv, _ = project(P, R, t, f, 1736, 2312)
        h = ConvexHull(uv); return P, uv, uv[h.vertices]
    def res(w):
        P, uv, hull = outline(w); hd = dense(np.vstack([hull, hull[:1]]), 120)
        d1 = np.min(np.linalg.norm(target[:, None] - hd[None], axis=2), 1)
        a0, a1 = target[0], target[-1]; nrm = np.array([a1[1] - a0[1], -(a1[0] - a0[0])])   # attachment line
        face_side = np.sign(nrm @ (np.array([1736.0, 2312.0]) * 0 + FACEDIR))
        free = ((hd - a0) @ nrm) * face_side < 0          # hull points behind the attachment line
        d2 = np.min(np.linalg.norm(hd[:, None] - target[None], axis=2), 1) * free
        r = [d1 / sc * 100, 0.5 * d2 / sc * 100]
        for v in fviews:   # frontal ear outer extent
            cv_ = cams[v]; uvf, _ = project(P, rodrigues(cv_[:3]), cv_[3:], fs.get(v, F_PX), 1736, 2312)
            lm_iod = 1.0
            xo = uvf[:, 0].min() if side == "r" else uvf[:, 0].max()
            r.append([(xo - EARX[v][side]) / 30.0])   # ~30 px ~ a few % iod
        r.append(w * 3.0)
        return np.concatenate([np.atleast_1d(x) for x in r])
    w0 = np.zeros(len(names)); r0 = res(w0)
    s = least_squares(res, w0, bounds=(0, 1.0), diff_step=1e-3, max_nfev=300)
    w = s.x; r1 = res(w)
    n_t = len(target)
    print(side, "contour mean err (%% ear height): before %.1f after %.1f" % (r0[:n_t].mean(), r1[:n_t].mean()))
    print("   weights:", {n: round(x, 2) for n, x in zip(names, w) if x > 0.05})
    V[region] += np.tensordot(w, Dr, 1)
    # debug overlay
    img = cv2.imread(f"../photos/{prof}.jpg"); P, uv, hull = outline(np.zeros(len(names)))
    cv2.polylines(img, [target.astype(np.int32)], False, (0, 255, 0), 4)
    _, _, hull1 = outline(w)
    cv2.polylines(img, [hull1.astype(np.int32)], True, (0, 0, 255), 4)
    c0 = target.mean(0).astype(int); x0, y0 = c0 - 450
    cv2.imwrite(f"../shots/earfit_{side}.jpg", cv2.resize(img[max(0, y0):y0 + 900, max(0, x0):x0 + 900], (450, 450)))
out = {k: F[k] for k in F.files}; out["Vfit"] = V; np.savez(fout, **out); print("SAVED", fout)
