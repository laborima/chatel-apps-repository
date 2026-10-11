"""Project cleaned photos onto the head UV and composite with a colour-matched MakeHuman body skin.
Output: skin_4k.png (+ debug images)
"""
import numpy as np, cv2, sys, os, time
from geom import rodrigues, project, load_seg

T = 4096
fitf = sys.argv[1] if len(sys.argv) > 1 else "fit2_result.npz"
VIEWS = ["front_close", "front", "three_quarter", "profile_right_side", "profile_left_side", "back"]
VIEW_W = {"front_close": 1.0, "front": 0.8, "three_quarter": 0.9, "profile_right_side": 1.0, "profile_left_side": 1.0, "back": 0.8}
m = np.load("base_mesh.npz"); F = m["F"]; FL = m["FL"]; UV = m["uv"]; body = m["g_body"]
r = np.load(fitf); V = r["Vfit"]; cams = dict(zip(r["vnames"], r["cams"])); cams["back"] = np.load("cam_back.npy"); F_PX = float(r["F_PX"])
corr = np.load("corr.npz"); chin_z = V[corr["vid"][152], 2]

inb = np.zeros(len(V), bool); inb[body] = True
Fb = F[inb[F].all(1)]; FLb = FL[inb[F].all(1)]
fn = np.cross(V[Fb[:, 1]] - V[Fb[:, 0]], V[Fb[:, 2]] - V[Fb[:, 0]])
vn = np.zeros_like(V)
for j in range(3): np.add.at(vn, Fb[:, j], fn)
vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12
headsel = V[Fb, 2].min(1) > chin_z - 0.11
Fh, FLh = Fb[headsel], FLb[headsel]
print("head tris", len(Fh))

# ---- rasterise head triangles in UV space ----
t0 = time.time()
tex_idx, tex_P, tex_N = [], [], []
for f, fl in zip(Fh, FLh):
    uv = UV[fl] * T; uv[:, 1] = T - uv[:, 1]
    x0, y0 = np.floor(uv.min(0)).astype(int); x1, y1 = np.ceil(uv.max(0)).astype(int)
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
    p = np.stack([xs.ravel() + 0.5, ys.ravel() + 0.5], 1)
    a, b, c = uv
    den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(den) < 1e-9: continue
    l1 = ((b[1] - c[1]) * (p[:, 0] - c[0]) + (c[0] - b[0]) * (p[:, 1] - c[1])) / den
    l2 = ((c[1] - a[1]) * (p[:, 0] - c[0]) + (a[0] - c[0]) * (p[:, 1] - c[1])) / den
    l3 = 1 - l1 - l2
    ok = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
    if not ok.any(): continue
    L = np.stack([l1[ok], l2[ok], l3[ok]], 1)
    tex_idx.append(np.stack([ys.ravel()[ok], xs.ravel()[ok]], 1))
    tex_P.append(L @ V[f]); tex_N.append(L @ vn[f])
tex_idx = np.concatenate(tex_idx); tex_P = np.concatenate(tex_P); tex_N = np.concatenate(tex_N)
tex_idx = np.clip(tex_idx, 0, T - 1)
tex_N /= np.linalg.norm(tex_N, axis=1, keepdims=True) + 1e-12
print("texels", len(tex_idx), f"{time.time() - t0:.0f}s")

# ---- per-view sampling with z-buffer visibility ----
def sample(img, x, y, interp, border=0):
    n = len(x); pad = (-n) % 2048
    mx = np.concatenate([x, np.zeros(pad)]).astype(np.float32).reshape(-1, 2048)
    my = np.concatenate([y, np.zeros(pad)]).astype(np.float32).reshape(-1, 2048)
    out = cv2.remap(img, mx, my, interp, borderMode=cv2.BORDER_CONSTANT, borderValue=border)
    return out.reshape(-1, *img.shape[2:])[:n]
DS = 2
def zbuffer(R, t, W, H):
    uv, Pc = project(V, R, t, F_PX / DS, W / 2, H / 2)
    zb = np.full((H, W), np.inf, np.float32)
    for f in Fb:
        q = uv[f]; z = Pc[f, 2]
        x0, y0 = np.maximum(np.floor(q.min(0)).astype(int), 0); x1, y1 = np.minimum(np.ceil(q.max(0)).astype(int), [W - 1, H - 1])
        if x1 < x0 or y1 < y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        a, b, c = q
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-9: continue
        l1 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / den
        l2 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / den
        l3 = 1 - l1 - l2
        ok = (l1 >= 0) & (l2 >= 0) & (l3 >= 0)
        zz = l1 * z[0] + l2 * z[1] + l3 * z[2]
        sub = zb[y0:y1 + 1, x0:x1 + 1]
        np.minimum(sub, np.where(ok, zz, np.inf), out=sub)
    return zb

cols, wts, hairs, skins = {}, {}, {}, {}
DELIGHT = float(os.environ.get("DELIGHT", "0.85"))
def sh9(n):
    x, y, z = n[:, 0], n[:, 1], n[:, 2]
    return np.stack([np.ones_like(x), x, y, z, x * y, x * z, y * z, x * x - y * y, 3 * z * z - 1], 1)
def delight(col, ncam, mask, name):
    """Fit 2nd-order SH shading on skin texels (luminance), divide it out (partially)."""
    Y = sh9(ncam); lum = col.mean(1)
    m = mask & (lum > 20)
    if m.sum() < 5000: return col
    A_, b_ = Y[m], lum[m]
    coef = np.linalg.lstsq(A_, b_, rcond=None)[0]
    for _ in range(3):   # robust reweighting: stubble / lips / brows are not skin albedo
        r_ = b_ - A_ @ coef; s_ = 1.4826 * np.median(np.abs(r_)) + 1e-6
        wr = 1 / np.maximum(1, np.abs(r_) / (2 * s_))
        coef = np.linalg.lstsq(A_ * wr[:, None], b_ * wr, rcond=None)[0]
    S = Y @ coef; S = S / np.median(S[m])
    S = np.clip(S, 0.45, 1.6)
    print("   delight", name, "shading p5/p95 %.2f %.2f" % tuple(np.percentile(S[m], [5, 95])))
    return col / (S[:, None] ** DELIGHT)
for name in VIEWS:
    t0 = time.time()
    img = cv2.imread(f"clean_{name}.jpg").astype(np.float32)
    rel = np.load(f"rel_{name}.npy").astype(np.float32)
    lab = cv2.cvtColor(img.astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    chroma = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)
    seg = load_seg(f"seg_{name}.npy")
    segv = np.clip(seg[..., 1] + seg[..., 2] + seg[..., 3] + 0.7 * seg[..., 5], 0, 1)
    rel *= np.where(segv > 0.5, segv, 0)
    rel = cv2.erode(rel, np.ones((9, 9), np.uint8))
    H, W = img.shape[:2]
    c = cams[name]; R = rodrigues(c[:3]); t = c[3:]
    zb = zbuffer(R, t, W // DS, H // DS)
    uv, Pc = project(tex_P, R, t, F_PX, W / 2, H / 2)
    zs = sample(zb, uv[:, 0] / DS, uv[:, 1] / DS, cv2.INTER_NEAREST, float(np.inf))
    vis = Pc[:, 2] < zs + 0.004
    ray = -Pc / np.linalg.norm(Pc, axis=1, keepdims=True)
    cosv = ((tex_N @ R.T) * ray).sum(1)
    col = sample(img, uv[:, 0], uv[:, 1], cv2.INTER_LINEAR)
    rv = sample(rel, uv[:, 0], uv[:, 1], cv2.INTER_LINEAR)
    w = np.clip((cosv - 0.15) / 0.85, 0, 1) ** 2 * vis * rv * VIEW_W[name]
    print("   dbg", name, "cos>0.3", (cosv > 0.3).mean().round(3), "vis", vis.mean().round(3), "rel>0.5", (rv > 0.5).mean().round(3), "inimg", ((uv[:,0]>0)&(uv[:,0]<W)&(uv[:,1]>0)&(uv[:,1]<H)).mean().round(3))
    # glasses arms cross the hair: fill them with hair where hair surrounds them (morphological closing), else not hair
    hair_ = seg[..., 1]; acc = cv2.dilate((seg[..., 5] > 0.3).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(np.float32)
    closed = cv2.dilate(hair_, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (101, 101)))
    hair_ = hair_ * (1 - acc) + closed * acc
    sh = sample(np.ascontiguousarray(hair_), uv[:, 0], uv[:, 1], cv2.INTER_LINEAR)
    ss = sample(np.ascontiguousarray(seg[..., 2] + seg[..., 3]), uv[:, 0], uv[:, 1], cv2.INTER_LINEAR)
    ear_r = (tex_P[:, 0] < -0.07) & (tex_P[:, 2] > chin_z + 0.03); ear_l = (tex_P[:, 0] > 0.07) & (tex_P[:, 2] > chin_z + 0.03)
    if name not in ("profile_right_side", "back"): w = np.where(ear_r, 0, w)
    if name not in ("profile_left_side", "back"): w = np.where(ear_l, 0, w)
    if DELIGHT:
        col = delight(col, tex_N @ R.T, (w > 0.15) & (ss > 0.8), name)
    cols[name], wts[name], hairs[name], skins[name] = col, w, sh, ss
    print(name, "visible texels", int((w > 0.05).sum()), f"{time.time() - t0:.0f}s")

# ---- exposure / white-balance harmonisation against front_close ----
ref = "front_close"
done = [ref]
for name in VIEWS:
    if name == ref: continue
    sk = lambda n: (wts[n] > 0.05) & (skins[n] > 0.8)
    ov = [(sk(name) & sk(o)).sum() for o in done]
    o = done[int(np.argmax(ov))]; both = sk(name) & sk(o)
    if both.sum() < 3000:  # e.g. back view: fall back to hair overlap
        hv = lambda n: (wts[n] > 0.05) & (hairs[n] > 0.8)
        ov = [(hv(name) & hv(o)).sum() for o in done]; o = done[int(np.argmax(ov))]; both = hv(name) & hv(o)
    g = np.median(cols[o][both], 0) / np.maximum(np.median(cols[name][both], 0), 1)
    print(name, "gain", np.round(g, 3), "vs", o, int(both.sum()))
    cols[name] = cols[name] * g; done.append(name)

# ---- blend (sharpening power weights) ----
P = 4
num = np.zeros((len(tex_idx), 3)); den = np.zeros(len(tex_idx))
for name in VIEWS:
    w = wts[name] ** P; num += w[:, None] * cols[name]; den += w
cover = np.clip(sum(wts[n] for n in VIEWS) / 0.25, 0, 1)
ear_y = V[corr["vid"][234], 1]
zz = np.clip((tex_P[:, 2] - (chin_z - 0.075)) / 0.045, 0, 1); zz = zz * zz * (3 - 2 * zz)
front_neck = np.clip((ear_y - tex_P[:, 1]) / 0.03, 0, 1)
cover = cover * (1 - front_neck * (1 - zz))
zb_ = np.clip((tex_P[:, 2] - (chin_z - 0.105)) / 0.035, 0, 1); cover = cover * zb_ * zb_ * (3 - 2 * zb_)
# fade towards the UV seams of the head island (below the ears) so both sides of the seam show the same base skin
from collections import Counter
from scipy.spatial import cKDTree
uvk = lambda l: tuple(np.round(UV[l] * 4096).astype(int))
ec = Counter()
for fl in FLh:
    for a_, b_ in ((0, 1), (1, 2), (2, 0)):
        ec[tuple(sorted((uvk(fl[a_]), uvk(fl[b_]))))] += 1
bverts = set()
for f, fl in zip(Fh, FLh):
    for a_, b_ in ((0, 1), (1, 2), (2, 0)):
        if ec[tuple(sorted((uvk(fl[a_]), uvk(fl[b_]))))] == 1: bverts |= {f[a_], f[b_]}
bverts = np.array(sorted(bverts)); bverts = bverts[V[bverts, 2] < chin_z - 0.02]
dseam, _ = cKDTree(V[bverts]).query(tex_P)
fs = np.clip(dseam / 0.03, 0, 1); cover = cover * fs * fs * (3 - 2 * fs)
print("seam verts", len(bverts))
proj = num / np.maximum(den, 1e-9)[:, None]
hp = sum(wts[n] ** P * hairs[n] for n in VIEWS) / np.maximum(den, 1e-9)
HM = np.zeros((T, T), np.float32); HM[tex_idx[:, 0], tex_idx[:, 1]] = np.where(cover > 0.05, hp, 0)
HM[tex_idx[:, 0], tex_idx[:, 1]] = np.where((tex_P[:, 2] > V[corr['vid'][10], 2] + 0.02) & (tex_P[:, 1] > V[corr['vid'][10], 1] + 0.02), 1.0, HM[tex_idx[:, 0], tex_idx[:, 1]])
KN = np.zeros((T, T), np.float32); KN[tex_idx[:, 0], tex_idx[:, 1]] = (cover > 0.05)
for s_ in (4, 16, 48):  # fill uncovered texels (crown) from neighbours
    hb = cv2.GaussianBlur(HM * KN, (0, 0), s_); kb_ = cv2.GaussianBlur(KN, (0, 0), s_)
    HM = np.where(KN > 0, HM, np.where(kb_ > 1e-3, hb / np.maximum(kb_, 1e-6), HM))
cv2.imwrite("hairprob_4k.png", (np.clip(HM, 0, 1) * 255).astype(np.uint8))

# ---- base skin, colour-matched ----
base = cv2.imread(os.path.expanduser("~/.config/blender/4.5/extensions/.user/user_default/mpfb/data/skins/middleage_caucasian_male/middleage_lightskinned_male_diffuse.png"))
base = cv2.resize(base, (T, T), interpolation=cv2.INTER_CUBIC).astype(np.float32)
bsamp = base[tex_idx[:, 0], tex_idx[:, 1]]
mz0, mz1 = V[corr["vid"][61], 2], V[corr["vid"][6], 2]
sel = (cover > 0.5) & (tex_P[:, 2] > chin_z - 0.07) & (tex_P[:, 2] < chin_z - 0.035) & (sum(skins[n] * (wts[n] > 0.05) for n in VIEWS) > 0.5)
print("cheek texels", sel.sum())
# match in Lab: mean & std per channel
def to_lab(x): return cv2.cvtColor(np.clip(x, 0, 255).astype(np.uint8).reshape(-1, 1, 3), cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
pl, bl = to_lab(proj[sel]), to_lab(bsamp[sel])
mu_p, sd_p, mu_b, sd_b = pl.mean(0), pl.std(0), bl.mean(0), bl.std(0)
blab = cv2.cvtColor(base.astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
blab = (blab - mu_b) * np.clip(sd_p / sd_b, 0.85, 1.15) + mu_p

base = cv2.cvtColor(np.clip(blab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)

# ---- composite with feathered alpha ----
A = np.zeros((T, T), np.float32); C = np.zeros((T, T, 3), np.float32)
ear_top_z = V[corr["vid"][10], 2] + 0.005
crown = (tex_P[:, 2] > ear_top_z) & (cover < 0.6)
cover = np.where(crown, np.maximum(cover, 0.999), cover)
A[tex_idx[:, 0], tex_idx[:, 1]] = cover
KNOWN = np.zeros((T, T), np.float32); KNOWN[tex_idx[:, 0], tex_idx[:, 1]] = (~crown) & (cover > 0.3)
# crown is filled from hair texels only (fill pass below), the rest from any known texel
HAIRK = np.zeros((T, T), np.float32); HAIRK[tex_idx[:, 0], tex_idx[:, 1]] = (~crown) & (cover > 0.3) & (hp > 0.7)
CROWN = np.zeros((T, T), np.float32); CROWN[tex_idx[:, 0], tex_idx[:, 1]] = crown
C[tex_idx[:, 0], tex_idx[:, 1]] = proj
# fill holes inside the coverage by pull-push diffusion of the projected colours
def pullpush(C, known, sig):
    acc = C * known[..., None]; out = C.copy(); done = known.copy()
    for s in sig:
        acc_b = cv2.GaussianBlur(acc, (0, 0), s); w_b = cv2.GaussianBlur(known, (0, 0), s)
        fill = acc_b / np.maximum(w_b, 1e-6)[..., None]
        upd = (done == 0) & (w_b > 1e-3)
        out[upd] = fill[upd]; done = np.maximum(done, upd.astype(np.float32))
    return out
Cc = pullpush(C, HAIRK, (6, 18, 50, 120, 250))
C = pullpush(C, KNOWN, (3, 9, 27))
C = np.where(CROWN[..., None] > 0, Cc, C)
A = cv2.GaussianBlur(cv2.erode(A, np.ones((5, 5), np.uint8)), (0, 0), 6)
out = C * A[..., None] + base * (1 - A[..., None])
# remove bluish lens/pad residue on the face skin (cool, low-chroma streaks), in UV space
o8 = np.clip(out, 0, 255).astype(np.uint8)
labt = cv2.cvtColor(o8, cv2.COLOR_BGR2LAB).astype(np.float32)
bl = labt[..., 2] - cv2.medianBlur(labt[..., 2].astype(np.uint8), 31).astype(np.float32)
facez = np.zeros((T, T), np.uint8)
selz = (tex_P[:, 2] > chin_z) & (tex_P[:, 2] < V[corr["vid"][10], 2]) & (tex_P[:, 1] < V[corr["vid"][234], 1])
facez[tex_idx[selz, 0], tex_idx[selz, 1]] = 1
bluish = ((bl < -6) & (facez > 0)).astype(np.uint8)
bluish = cv2.dilate(cv2.morphologyEx(bluish, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), np.ones((9, 9), np.uint8))
print("bluish texels", int(bluish.sum()))
# whitish glints (nose-pad / frame reflections) on the face: much brighter than the local median
Lm = labt[..., 0] - cv2.medianBlur(labt[..., 0].astype(np.uint8), 41).astype(np.float32)
whitish = ((Lm > 22) & (facez > 0)).astype(np.uint8)
whitish = cv2.dilate(cv2.morphologyEx(whitish, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), np.ones((11, 11), np.uint8))
print("whitish texels", int(whitish.sum()))
bluish = np.maximum(bluish, whitish)
# nose bridge under the glasses bridge/pads: inpaint a small band around landmark 168/6 in UV
nb_ = np.zeros((T, T), np.uint8)
selnb = (np.linalg.norm(tex_P - V[corr["vid"][168]], axis=1) < 0.014) | (np.linalg.norm(tex_P - (V[corr["vid"][6]] * 0.5 + V[corr["vid"][168]] * 0.5), axis=1) < 0.011)
nb_[tex_idx[selnb, 0], tex_idx[selnb, 1]] = 1
Lnb = labt[..., 0] - cv2.GaussianBlur(labt[..., 0], (0, 0), 25)
bluish = np.maximum(bluish, ((Lnb > 6) & (nb_ > 0)).astype(np.uint8))
bluish = cv2.dilate(bluish, np.ones((5, 5), np.uint8))
out = cv2.inpaint(o8, bluish * 255, 7, cv2.INPAINT_TELEA).astype(np.float32)
ALBEDO = 0.88
# scalp tint: under the hair the skin texture takes the hair colour, so gaps between hair shells don't show pink skin
hmask = np.clip((HM - 0.5) / 0.3, 0, 1)[..., None] * 0.85
out = out * (1 - hmask) + np.array([34.0, 44.0, 60.0])[None, None, :] / ALBEDO * hmask
import json as _j
if os.path.exists("calib.json"):
    _g = np.array(_j.load(open("calib.json"))["skin"])
    out = 255 * (((out / 255) ** 2.2) * _g[None, None, :]) ** (1 / 2.2)   # gains are in linear space
    print("calib skin gains", _g)  # photos include lighting; keep the albedo a bit below the lit photo values
out = out * ALBEDO
# TONE: closer to the photos' rosy-beige (less orange), slightly darker
hsv = cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
hsv[..., 1] *= 0.8; hsv[..., 2] *= 0.92
out = cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR).astype(np.float32)
cv2.imwrite("skin_4k.png", np.clip(out, 0, 255).astype(np.uint8))
cv2.imwrite("../shots/bake_cover.jpg", cv2.resize((A * 255).astype(np.uint8), (1024, 1024)))
cv2.imwrite("../shots/bake_skin.jpg", cv2.resize(np.clip(out, 0, 255).astype(np.uint8), (1024, 1024)))
# head island crop for inspection
ys, xs = tex_idx[:, 0], tex_idx[:, 1]
crop = out[ys.min():ys.max(), xs.min():xs.max()]
cv2.imwrite("../shots/bake_head.jpg", cv2.resize(np.clip(crop, 0, 255).astype(np.uint8), None, fx=0.5, fy=0.5))
print("DONE")
