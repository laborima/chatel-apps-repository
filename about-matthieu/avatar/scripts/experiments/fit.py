"""Multi-view fit of MakeHuman face targets + per-photo cameras.
Inputs: base_mesh.npz, corr.npz, landmarks.json, sil_*.npy
Output: fit_result.npz (target weights, cameras, fitted head vertices), overlays in ../shots
"""
import numpy as np, json, gzip, glob, os, cv2, sys
from scipy.optimize import least_squares
from geom import rodrigues, project

TD = os.path.expanduser("~/.config/blender/4.5/extensions/user_default/mpfb/data/targets")
m = np.load("base_mesh.npz"); V0 = m["V"]; F = m["F"]
corr = np.load("corr.npz")
N = len(V0)

# ---------- targets ----------
def load_target(p):
    a = np.loadtxt(gzip.open(p), ndmin=2) if p.endswith(".gz") else np.loadtxt(p, ndmin=2)
    idx = a[:, 0].astype(int); d = np.stack([a[:, 1], -a[:, 3], a[:, 2]], 1) * 0.1
    return idx, d

cats = ["head", "nose", "mouth", "chin", "cheek", "eyes", "ears", "eyebrows", "forehead"]
groups = {}
for c in cats:
    for p in sorted(glob.glob(f"{TD}/{c}/*.target.gz")):
        n = os.path.basename(p)[:-10]
        key = n[2:] if n[:2] in ("l-", "r-") else n
        groups.setdefault(key, []).append(p)
skip = ("head-age", "head-fat", "head-angle")
names = [k for k in groups if not k.startswith(skip)]
D = []  # dense deltas (K, N, 3) on float32
for k in names:
    d = np.zeros((N, 3), np.float32)
    for p in groups[k]:
        i, dd = load_target(p); d[i] += dd
    D.append(d)
D = np.array(D); K = len(D)
print("targets", K)

# ---------- ear/manual model points ----------
ear = {}
for side, sgn in (("r", -1), ("l", 1)):
    i, _ = load_target(f"{TD}/ears/{side}-ear-scale-incr.target.gz")
    i = np.intersect1d(i, m["g_body"])
    i = i[V0[i, 0] * sgn > 0.072]
    P = V0[i]
    ear[side] = dict(top=i[P[:, 2].argmax()], back=i[P[:, 1].argmax()], lobe=i[P[:, 2].argmin()], all=i)
print("ear verts", ear)

# ---------- views ----------
LM = json.load(open("landmarks.json"))
good = np.where(corr["spread"] < 0.012)[0]
good = np.array([g for g in good if g < 468 and g not in (13, 14, 78, 308, 82, 312, 87, 317)])
vid = corr["vid"]
F_PX = 43.0 * np.hypot(3472, 4624) / np.hypot(36, 24)
views = []
for name in ["front", "front_close", "three_quarter", "front_torso"]:
    lm = np.array(LM[name]["lm"])[:, :2]
    views.append(dict(name=name, kind="lm", obs=lm[good], ids=vid[good], W=3472, H=4624))

MAN = {  # manual profile points: model vertex -> pixel
    "profile_right_side": dict(facing=+1, rows=[(1290, 1480), (1790, 2900)],
        pts=[(ear["r"]["top"], (856, 1697)), (ear["r"]["back"], (639, 1903)), (ear["r"]["lobe"], (1034, 2306)),
             (vid[33], (1869, 1710)), (vid[61], (2058, 2427))]),
    "profile_left_side": dict(facing=-1, rows=[(1000, 1270), (1680, 2770)],
        pts=[(ear["l"]["top"], (2520, 1310)), (ear["l"]["back"], (2744, 1580)), (ear["l"]["lobe"], (2420, 1980)),
             (vid[263], (1510, 1550)), (vid[291], (1400, 2270))]),
}
body = m["g_body"]
mid = body[(np.abs(V0[body, 0]) < 1e-4)]
headz = V0[vid[good], 2]
mid = mid[(V0[mid, 2] > headz.min() - 0.03) & (V0[mid, 2] < headz.max() + 0.03) & (V0[mid, 1] < np.median(V0[vid[good], 1]))]
for name, d in MAN.items():
    d["cont"] = np.load(f"sil_{name}.npy")
    Rb = np.array([[0, -1, 0], [0, 0, -1], [1, 0, 0]], float) if d["facing"] > 0 else np.array([[0, 1, 0], [0, 0, -1], [-1, 0, 0]], float)
    views.append(dict(name=name, kind="prof", **d, W=3472, H=4624, Rb=Rb))
print("midline verts", len(mid))

MAN["profile_right_side"]["ear"] = ear["r"]["all"]; MAN["profile_left_side"]["ear"] = ear["l"]["all"]
for v in views:
    if v["kind"] == "prof": v["ear"] = MAN[v["name"]]["ear"]
subset = np.unique(np.concatenate([vid[good], mid, ear["r"]["all"], ear["l"]["all"]] + [[p[0] for p in d["pts"]] for d in MAN.values()]))
pos = {v: i for i, v in enumerate(subset)}
Vs0 = V0[subset]; Ds = D[:, subset]

def sub(idx):
    return np.array([pos[i] for i in idx])

# ---------- camera init ----------
def init_cam(v):
    if v["kind"] == "lm":
        ok, r, t = cv2.solvePnP(V0[v["ids"]].astype(np.float64), v["obs"].astype(np.float64),
                                np.array([[F_PX, 0, v["W"] / 2], [0, F_PX, v["H"] / 2], [0, 0, 1]]), None, flags=cv2.SOLVEPNP_EPNP)
        ok, r, t = cv2.solvePnP(V0[v["ids"]].astype(np.float64), v["obs"].astype(np.float64),
                                np.array([[F_PX, 0, v["W"] / 2], [0, F_PX, v["H"] / 2], [0, 0, 1]]), None, r, t, True)
        return np.concatenate([r.ravel(), t.ravel()])
    R = np.array([[0, -1, 0], [0, 0, -1], [1, 0, 0]], float) if v["facing"] > 0 else np.array([[0, 1, 0], [0, 0, -1], [-1, 0, 0]], float)
    P3 = V0[[p[0] for p in v["pts"]]].astype(np.float64); P2 = np.array([p[1] for p in v["pts"]], np.float64)
    r0, _ = cv2.Rodrigues(R)
    real = np.linalg.norm((P3[0] - P3[3])[1:]); px = np.linalg.norm(P2[0] - P2[3])
    dist = F_PX * real / px
    c = P3.mean(0)
    t0 = -R @ c + np.array([0, 0, dist])
    # shift so the centroid of the manual points lands on the observed centroid
    o = P2.mean(0) - np.array([v["W"] / 2, v["H"] / 2])
    t0[:2] += o / F_PX * dist
    best = None
    for yw in range(-10, 11, 5):
        for pt in range(-10, 11, 5):
            for rl in range(-30, 31, 3):
                Rg = rodrigues(np.radians([pt, 0, 0])) @ rodrigues(np.radians([0, yw, 0])) @ rodrigues(np.radians([0, 0, rl]))
                Rc = Rg @ R  # world->cam with perturbation in camera frame
                rv = cv2.Rodrigues(Rc)[0].ravel()
                tt = -Rc @ c + np.array([0, 0, dist])
                ft = lambda t3: (project(P3, Rc, t3, F_PX, v["W"] / 2, v["H"] / 2)[0] - P2).ravel()
                st = least_squares(ft, tt)
                x6 = np.concatenate([rv, st.x])
                e = st.cost
                if best is None or e < best[0]: best = (e, x6, (yw, pt, rl))
    print(v["name"], "grid best", best[2], np.sqrt(2 * best[0] / len(P2)))
    return best[1]

cams0 = [init_cam(v) for v in views]
for v, c in zip(views, cams0):
    print(v["name"], "init cam t", np.round(c[3:], 3))

# ---------- residuals ----------
LAM = float(sys.argv[1]) if len(sys.argv) > 1 else 0.02
W_PROF = 1.0

def unpack(x):
    return x[:K], [x[K + 6 * i:K + 6 * i + 6] for i in range(len(views))]

def residuals(x, detail=False):
    w, cams = unpack(x)
    Vs = Vs0 + np.tensordot(w, Ds, 1)
    res, info = [], []
    for v, c in zip(views, cams):
        R = rodrigues(c[:3]); t = c[3:]
        if v["kind"] == "lm":
            uv, _ = project(Vs[sub(v["ids"])], R, t, F_PX, v["W"] / 2, v["H"] / 2)
            scale = np.linalg.norm(v["obs"][good.tolist().index(33) if 33 in good else 0] - v["obs"][0]) + 1e-9
            iod = np.linalg.norm(np.array(LM[v["name"]]["lm"])[33, :2] - np.array(LM[v["name"]]["lm"])[263, :2])
            r = ((uv - v["obs"]) / iod * 100).ravel()
            res.append(r); info.append((v["name"], np.sqrt((r ** 2).mean())))
        else:
            ids = [p[0] for p in v["pts"]]; obs = np.array([p[1] for p in v["pts"]], float)
            uv, _ = project(Vs[sub(ids)], R, t, F_PX, v["W"] / 2, v["H"] / 2)
            ue, _ = project(Vs[sub(v["ear"])], R, t, F_PX, v["W"] / 2, v["H"] / 2)
            uv = uv.copy()
            uv[0] = ue[ue[:, 1].argmin()]; uv[2] = ue[ue[:, 1].argmax()]
            uv[1] = ue[(ue[:, 0] * -v["facing"]).argmax()]
            sc = np.linalg.norm(obs[0] - obs[3])  # ear-top to canthus
            r1 = ((uv - obs) / sc * 100 * 0.5).ravel()
            uvm, _ = project(Vs[sub(mid)], R, t, F_PX, v["W"] / 2, v["H"] / 2)
            ys = uvm[:, 1]
            okr = np.zeros(len(ys), bool)
            for a, b in v["rows"]:
                okr |= (ys > a) & (ys < b)
            cont = v["cont"]
            cx = np.interp(ys, np.arange(len(cont)), np.nan_to_num(cont, nan=0))
            # signed distance: positive when the model pokes in front of the photo silhouette
            r2 = np.where(okr, (uvm[:, 0] - cx) * v["facing"], 0.0)
            # vertices behind the silhouette are fine only if they're not the frontmost at that row;
            # approximate by penalising both directions but behind ones less
            r2 = np.where(r2 > 0, r2, 0.5 * r2) / sc * 100 * W_PROF
            Rrel = R @ v["Rb"].T
            rv = cv2.Rodrigues(Rrel)[0].ravel()
            r3 = np.degrees(rv[:2]) * 0.5  # 2 deg ~ 1 unit
            res += [r1, r2, r3]; info.append((v["name"], np.sqrt((r1 ** 2).mean()), np.sqrt((r2[okr] ** 2).mean()) if okr.any() else -1))
    res.append(np.sqrt(LAM) * w * 30)
    if detail:
        return info
    return np.concatenate(res)

x0 = np.concatenate([np.zeros(K)] + cams0)
lb = np.concatenate([np.zeros(K)] + [np.full(6, -np.inf)] * len(views))
ub = np.concatenate([np.ones(K)] + [np.full(6, np.inf)] * len(views))
print("before", residuals(x0, True))
# stage A: cameras only
mask = np.zeros_like(x0, bool); mask[K:] = True
fA = lambda xc: residuals(np.concatenate([x0[:K], xc]))
sA = least_squares(fA, x0[K:], method="trf", max_nfev=200)
x1 = np.concatenate([x0[:K], sA.x])
print("cams only", residuals(x1, True))
s = least_squares(residuals, x1, bounds=(lb, ub), method="trf", max_nfev=400, verbose=0, x_scale="jac")
x = s.x
print("after", residuals(x, True))
w, cams = unpack(x)
order = np.argsort(-w)
for i in order[:40]:
    print(f"  {names[i]:40s} {w[i]:.2f}")
Vfit = V0 + np.tensordot(w, D, 1)
np.savez("fit_result.npz", w=w, names=np.array(names), cams=np.array(cams), Vfit=Vfit, F_PX=F_PX,
         vnames=np.array([v["name"] for v in views]))

# ---------- overlays ----------
for v, c in zip(views, cams):
    img = cv2.imread(f"../photos/{v['name']}.jpg")
    R = rodrigues(c[:3]); t = c[3:]
    for VV, col in ((V0, (255, 0, 0)), (Vfit, (0, 0, 255))):
        pass
    uv, _ = project(Vfit, R, t, F_PX, 1736, 2312)
    # draw wireframe of face-region triangles
    fr = np.isin(F, subset).any(1) | np.isin(F, vid[good]).any(1)
    head = (V0[:, 2] > headz.min() - 0.06)
    tri = F[head[F].all(1)]
    for a, b in ((0, 1), (1, 2)):
        for p, q in zip(uv[tri[::2, a]], uv[tri[::2, b]]):
            cv2.line(img, tuple(p.astype(int)), tuple(q.astype(int)), (255, 200, 0), 1)
    if v["kind"] == "lm":
        uvl = uv[v["ids"]]
        for p, o in zip(uvl, v["obs"]):
            cv2.circle(img, tuple(o.astype(int)), 6, (0, 255, 0), -1); cv2.line(img, tuple(o.astype(int)), tuple(p.astype(int)), (0, 0, 255), 3)
    else:
        for vi, o in v["pts"]:
            cv2.circle(img, o, 12, (0, 255, 0), -1); cv2.line(img, o, tuple(uv[vi].astype(int)), (0, 0, 255), 4)
        uvm = uv[mid]
        for p in uvm: cv2.circle(img, tuple(p.astype(int)), 5, (0, 0, 255), -1)
    cv2.imwrite(f"../shots/fit_{v['name']}.jpg", cv2.resize(img, (868, 1156)))
