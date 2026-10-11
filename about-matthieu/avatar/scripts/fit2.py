"""Multi-view head fit v2: MakeHuman targets + symmetric RBF free-form + per-photo cameras.
Constraints: MediaPipe landmarks (4 frontal-ish photos), jaw contour (oval landmarks vs model rim),
profile silhouettes (midline vs row contour, under-chin vs column contour), manual ear/eye/mouth points.
Output: fit2_result.npz
"""
import numpy as np, json, gzip, glob, os, cv2, sys, time
from scipy.optimize import least_squares
from scipy.spatial import cKDTree
from geom import rodrigues, project

TD = os.path.expanduser("~/.config/blender/4.5/extensions/user_default/mpfb/data/targets")
m = np.load("base_mesh.npz"); V0 = m["V"]; F = m["F"]; body = m["g_body"]
corr = np.load("corr.npz"); vid = corr["vid"]
N = len(V0)
STAGES = sys.argv[1] if len(sys.argv) > 1 else "ABC"

# ---------------- targets ----------------
def load_target(p):
    a = np.loadtxt(gzip.open(p), ndmin=2)
    return a[:, 0].astype(int), np.stack([a[:, 1], -a[:, 3], a[:, 2]], 1) * 0.1

if os.path.exists("targets_cache.npz"):
    tc = np.load("targets_cache.npz"); names = list(tc["names"]); D = tc["D"]
else:
    groups = {}
    for c in ["head", "nose", "mouth", "chin", "cheek", "eyes", "ears", "eyebrows", "forehead"]:
        for p in sorted(glob.glob(f"{TD}/{c}/*.target.gz")):
            n = os.path.basename(p)[:-10]
            groups.setdefault(n[2:] if n[:2] in ("l-", "r-") else n, []).append(p)
    names = [k for k in groups if not k.startswith(("head-age", "head-fat", "head-angle"))]
    D = np.zeros((len(names), N, 3), np.float32)
    for k, n in enumerate(names):
        for p in groups[n]:
            i, d = load_target(p); D[k, i] += d
    np.savez("targets_cache.npz", names=np.array(names), D=D)
K = len(names)

# ---------------- model features ----------------
inb = np.zeros(N, bool); inb[body] = True
good = np.where(corr["spread"] < 0.012)[0]
good = np.array([g for g in good if g < 468 and g not in (13, 14, 78, 308, 82, 312, 87, 317)])
OVAL_JAW = [356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127]
good = np.array([g for g in good if g not in OVAL_JAW])
chin_z = V0[vid[152], 2]; eye_z = V0[vid[33], 2]; top_z = V0[body, 2].max()

ear = {}
for side, sgn in (("r", -1), ("l", 1)):
    i, _ = load_target(f"{TD}/ears/{side}-ear-scale-incr.target.gz")
    i = np.intersect1d(i, body); i = i[V0[i, 0] * sgn > 0.072]
    ear[side] = i

# midline (sagittal) points incl. edge midpoints for density
midv = body[(np.abs(V0[body, 0]) < 1e-4) & (V0[body, 2] > chin_z - 0.06) & (V0[body, 1] < V0[vid[1], 1] + 0.09)]
ms = set(midv.tolist())
E = set()
for f in F:
    for a, b in ((f[0], f[1]), (f[1], f[2]), (f[2], f[0])):
        if a in ms and b in ms: E.add((min(a, b), max(a, b)))
midpairs = np.array([(v, v) for v in midv] + list(E))
print("midline pts", len(midpairs))

# rim candidates for the jaw contour in frontal views
vn = np.zeros_like(V0)
fn = np.cross(V0[F[:, 1]] - V0[F[:, 0]], V0[F[:, 2]] - V0[F[:, 0]])
for j in range(3): np.add.at(vn, F[:, j], fn)
vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12
rimc = body[(V0[body, 2] > chin_z - 0.03) & (V0[body, 2] < eye_z + 0.01) & (V0[body, 1] < V0[ear["r"], 1].max())
            & (np.abs(V0[body, 0]) < 0.075)]
rimc = np.setdiff1d(rimc, np.concatenate([ear["r"], ear["l"]]))

# ---------------- RBF basis (symmetric) ----------------
headv = body[V0[body, 2] > chin_z - 0.07]
rng = np.random.default_rng(0)
cand = headv[V0[headv, 0] >= -1e-4]
cent = [cand[rng.integers(len(cand))]]
dmin = np.linalg.norm(V0[cand] - V0[cent[0]], axis=1)
NC = int(os.environ.get("NC", 140))
for _ in range(NC - 1):
    j = dmin.argmax(); cent.append(cand[j]); dmin = np.minimum(dmin, np.linalg.norm(V0[cand] - V0[cand[j]], axis=1))
C = V0[cent]; SIG = float(os.environ.get("SIG", 0.022))
def neck_fade(z):
    s = np.clip((z - (chin_z - 0.07)) / 0.04, 0, 1); return s * s * (3 - 2 * s)
def rbf_basis(P):
    Cm = C * np.array([-1, 1, 1])
    A = np.exp(-((P[:, None] - C[None]) ** 2).sum(-1) / (2 * SIG ** 2))
    B = np.exp(-((P[:, None] - Cm[None]) ** 2).sum(-1) / (2 * SIG ** 2))
    fade = neck_fade(P[:, 2])[:, None]
    return A * fade, B * fade   # disp = A@c + (B@c)*[-1,1,1]

# ---------------- views ----------------
LM = json.load(open("landmarks.json"))
F_PX = 43.0 * np.hypot(3472, 4624) / np.hypot(36, 24); CX, CY = 1736, 2312
views = []
for name in ["front", "front_close", "three_quarter", "front_torso"]:
    lm = np.array(LM[name]["lm"])[:, :2]
    iod = np.linalg.norm(lm[33] - lm[263])
    jaw = [g for g in OVAL_JAW if not (name == "three_quarter" and g in (356, 454, 323, 361, 288, 397))]
    if os.environ.get("RC"):
        rc = np.load("rcorr.npz")
        sel = rc[name + "_ok"].copy(); sel[468:] = False
        sel[[13, 14, 78, 308, 82, 312, 87, 317, 95, 324, 88, 318, 178, 402]] = False; sel[OVAL_JAW] = False
        views.append(dict(name=name, kind="lm", obs=lm[:478][sel], ids=rc[name][sel], jaw_obs=lm[jaw], sc=iod))
    else:
        views.append(dict(name=name, kind="lm", obs=lm[good], ids=vid[good], jaw_obs=lm[jaw], sc=iod))

def column_contour(sil, x0, x1, ystart):
    out = {}
    for x in range(x0, x1):
        col = sil[ystart:, x] > 0
        k = np.argmin(col) if not col.all() else None
        if k is not None and col[:k].all(): out[x] = ystart + k
    return out

PROF = {
    "profile_right_side": dict(facing=+1, rows=[(1290, 1480), (1790, 2880)], chin_cols=(1990, 2160), chin_y0=2500,
        pts=[("ear_top", (856, 1697)), ("ear_back", (639, 1903)), ("ear_lobe", (1034, 2306)), (vid[33], (1869, 1710)), (vid[61], (2058, 2427))]),
    "profile_left_side": dict(facing=-1, rows=[(1000, 1270), (1680, 2760)], chin_cols=(1520, 1690), chin_y0=2400,
        pts=[("ear_top", (2520, 1310)), ("ear_back", (2744, 1580)), ("ear_lobe", (2420, 1980)), (vid[263], (1510, 1550)), (vid[291], (1400, 2270))]),
}
for name, d in PROF.items():
    sil = cv2.imread(f"sil_{name}.png", 0)
    cont = np.load(f"sil_{name}.npy")
    cc = column_contour(sil, *d["chin_cols"], d["chin_y0"])
    xs = np.array(sorted(cc)); ys = np.array([cc[x] for x in xs])
    Rb = np.array([[0, -1, 0], [0, 0, -1], [1, 0, 0]], float) if d["facing"] > 0 else np.array([[0, 1, 0], [0, 0, -1], [-1, 0, 0]], float)
    views.append(dict(name=name, kind="prof", cont=np.nan_to_num(cont, nan=0), chin_x=xs, chin_y=ys, Rb=Rb,
                      ear=ear["r" if d["facing"] > 0 else "l"], sc=np.linalg.norm(np.subtract(d["pts"][0][1], d["pts"][3][1])), **d))

# under-chin model points: midline verts below the chin tip
underchin = body[(np.abs(V0[body, 0]) < 0.03) & (V0[body, 2] < chin_z + 0.005) & (V0[body, 2] > chin_z - 0.04) & (V0[body, 1] < V0[vid[152], 1] + 0.05)]

subset = np.unique(np.concatenate([np.concatenate([v['ids'] for v in views if v['kind'] == 'lm']), vid[good], midpairs.ravel(), ear["r"], ear["l"], rimc, underchin, vid[[33, 263, 61, 291]]]))
pos = np.full(N, -1); pos[subset] = np.arange(len(subset))
Vs0 = V0[subset]; Ds = D[:, subset]; ns0 = vn[subset]
As, Bs = rbf_basis(Vs0)
print("subset", len(subset), "targets", K, "rbf", len(C))

# ---------------- parameter packing ----------------
NV = len(views)
EAR_FRONT = {"front": {"r": 800.0, "l": 2455.0}}
def unpack(x):
    w = x[:K]; c = x[K:K + 3 * len(C)].reshape(-1, 3); cams = x[K + 3 * len(C):].reshape(NV, 6)
    return w, c, cams

def shape(w, c, Vbase, Dm, A, B):
    return Vbase + np.tensordot(w, Dm, 1) + A @ c + (B @ c) * np.array([-1, 1, 1])

LAM_W = 0.6; LAM_C = float(os.environ.get("LAMC", 3.0))
def residuals(x, detail=False):
    w, c, cams = unpack(x)
    Vs = shape(w, c, Vs0, Ds, As, Bs)
    res, info = [], []
    for v, cam in zip(views, cams):
        R = rodrigues(cam[:3]); t = cam[3:]
        if v["kind"] == "lm":
            uv, _ = project(Vs[pos[v["ids"]]], R, t, F_PX, CX, CY)
            r = ((uv - v["obs"]) / v["sc"] * 100).ravel()
            # jaw contour: soft nearest rim point (rimness = normal perpendicular to the view ray)
            P = Vs[pos[rimc]]; Pc = P @ R.T + t
            ray = Pc / np.linalg.norm(Pc, axis=1, keepdims=True)
            nc = ns0[pos[rimc]] @ R.T
            rimw = np.exp(-((ray * nc).sum(1) / 0.08) ** 2)
            uvr = F_PX * Pc[:, :2] / Pc[:, 2:3] + np.array([CX, CY])
            d2 = ((uvr[None] - v["jaw_obs"][:, None]) ** 2).sum(-1)
            sj = 0.04 * v["sc"]
            wj = rimw[None] * np.exp(-(d2 - d2.min(1, keepdims=True)) / (2 * sj ** 2)) + 1e-12
            near = (wj[..., None] * uvr[None]).sum(1) / wj.sum(1, keepdims=True)
            rj = ((near - v["jaw_obs"]) / v["sc"] * 100 * 0.7).ravel()
            if v["name"] in EAR_FRONT:   # lateral extent of the ears (they stick out)
                tau_ = 0.01 * v["sc"]; re_ = []
                for side_, ox in EAR_FRONT[v["name"]].items():
                    ue_, _ = project(Vs[pos[ear[side_]]], R, t, F_PX, CX, CY)
                    sc_ = -ue_[:, 0] if side_ == "r" else ue_[:, 0]
                    e_ = np.exp((sc_ - sc_.max()) / tau_); xo_ = (e_ * ue_[:, 0]).sum() / e_.sum()
                    re_.append((xo_ - ox) / v["sc"] * 100 * 1.2)
                res.append(np.array(re_))
            res += [r, rj]; info.append((v["name"], round(np.sqrt((r ** 2).mean()), 2), round(np.sqrt((rj ** 2).mean()), 2)))
        else:
            tau = 0.01 * v["sc"]
            def softext(p, score):
                e = np.exp((score - score.max()) / tau); return (e[:, None] * p).sum(0) / e.sum()
            obs = np.array([p[1] for p in v["pts"]], float)
            ue, _ = project(Vs[pos[v["ear"]]], R, t, F_PX, CX, CY)
            uf, _ = project(Vs[pos[[p[0] for p in v["pts"][3:]]]], R, t, F_PX, CX, CY)
            uv = np.vstack([softext(ue, -ue[:, 1]), softext(ue, -ue[:, 0] * v["facing"]), softext(ue, ue[:, 1]), uf])
            r1 = ((uv - obs) / v["sc"] * 100 * np.array([1.2, 1.2, 1.2, 0.7, 0.7])[:, None]).ravel()
            Pm = 0.5 * (Vs[pos[midpairs[:, 0]]] + Vs[pos[midpairs[:, 1]]])
            uvm, _ = project(Pm, R, t, F_PX, CX, CY)
            # soft frontmost model point per row band vs photo contour
            r2 = []; okr = []
            for a, b in v["rows"]:
                for yc in np.arange(a + 20, b, 40):
                    g = np.exp(-((uvm[:, 1] - yc) / 25.0) ** 2)
                    if g.max() < 0.05: r2.append(0.0); okr.append(False); continue
                    sc_ = uvm[:, 0] * v["facing"] + tau * np.log(g + 1e-30)
                    p = softext(uvm, sc_)
                    r2.append((p[0] - np.interp(p[1], np.arange(len(v["cont"])), v["cont"])) * v["facing"]); okr.append(True)
            r2 = np.array(r2) / v["sc"] * 100; okr = np.array(okr)
            # under-chin: soft lowest model point per column band vs photo column contour
            uc, _ = project(Vs[pos[underchin]], R, t, F_PX, CX, CY)
            r4 = []
            for xc in np.linspace(v["chin_x"].min(), v["chin_x"].max(), 6):
                g = np.exp(-((uc[:, 0] - xc) / 25.0) ** 2)
                p = softext(uc, uc[:, 1] + tau * np.log(g + 1e-30))
                r4.append(p[1] - np.interp(p[0], v["chin_x"], v["chin_y"]))
            r4 = np.array(r4) / v["sc"] * 100 * 0.7
            rv = cv2.Rodrigues(R @ v["Rb"].T)[0].ravel()
            r3 = np.degrees(rv[:2]) * 0.5
            res += [r1, r2, r4, r3]
            info.append((v["name"], round(np.sqrt((r1 ** 2).mean()), 2), round(np.sqrt((r2[okr] ** 2).mean()), 2), round(np.sqrt((r4 ** 2).mean()), 2)))
    res.append(np.sqrt(LAM_W) * w * 10)
    res.append(np.sqrt(LAM_C) * c.ravel() * 1000)  # coefficients in m -> mm
    if detail: return info
    return np.concatenate(res)

# ---------------- init cameras from fit v1 if available ----------------
prev = np.load("fit_result.npz")
cams0 = prev["cams"]; w0 = prev["w"] if list(prev["names"]) == names else np.zeros(K)
x = np.concatenate([w0, np.zeros(3 * len(C)), np.ravel(cams0)])
if os.path.exists("fit2_result.npz") and "R" in STAGES:
    p2 = np.load("fit2_result.npz"); x = p2["x"] if len(p2["x"]) == len(x) else x
print("start", residuals(x, True))
nW, nC = K, 3 * len(C)
lb = np.concatenate([np.zeros(nW), np.full(nC, -0.02), np.full(6 * NV, -np.inf)])
UBW = np.array([2.0 if n.startswith("ear-trans") else 1.5 for n in names])
ub = np.concatenate([UBW, np.full(nC, 0.02), np.full(6 * NV, np.inf)])
x = np.clip(x, lb + 1e-12, ub - 1e-12)
def solve(free, nfev):
    global x
    idx = np.where(free)[0]
    def f(xf):
        xx = x.copy(); xx[idx] = xf; return residuals(xx)
    t0 = time.time()
    s = least_squares(f, x[idx], bounds=(lb[idx], ub[idx]), method="trf", max_nfev=nfev, x_scale="jac", xtol=1e-12, ftol=1e-10, diff_step=1e-4)
    x[idx] = s.x
    print("   status", s.status, s.message, s.nfev, s.cost)
    print(f"  solved {len(idx)} params in {time.time() - t0:.0f}s", residuals(x, True))
free_cam = np.zeros(len(x), bool); free_cam[nW + nC:] = True
free_w = free_cam.copy(); free_w[:nW] = True
free_all = np.ones(len(x), bool)
if "A" in STAGES: solve(free_w, 300)
if "C" in STAGES: solve(free_all, int(os.environ.get("NFEV", 60)))
w, c, cams = unpack(x)
for i in np.argsort(-w)[:25]: print(f"  {names[i]:36s} {w[i]:.2f}")
print("rbf coef max mm", np.abs(c).max() * 1000)
A, B = rbf_basis(V0)
Vfit = shape(w, c, V0, D, A, B)
np.savez("fit2_result.npz", x=x, w=w, c=c, names=np.array(names), cams=cams, Vfit=Vfit, F_PX=F_PX,
         vnames=np.array([v["name"] for v in views]))
print("SAVED")
