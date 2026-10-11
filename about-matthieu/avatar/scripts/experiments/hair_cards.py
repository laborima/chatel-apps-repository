"""Hair cards for the (thinning, swept-back) top hair + a procedural strand texture.
Outputs hair_cards.npz and strands.png"""
import numpy as np, cv2
from scipy.spatial import cKDTree

rng = np.random.default_rng(7)
m = np.load("base_mesh.npz"); F = m["F"]; body = m["g_body"]
V = np.load("fit2_result.npz")["Vfit"]; vid = np.load("corr.npz")["vid"]
inb = np.zeros(len(V), bool); inb[body] = True
Fb = F[inb[F].all(1)]
vn = np.zeros_like(V)
fn = np.cross(V[Fb[:, 1]] - V[Fb[:, 0]], V[Fb[:, 2]] - V[Fb[:, 0]])
for j in range(3): np.add.at(vn, Fb[:, j], fn)
vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12

z10, y10 = V[vid[10], 2], V[vid[10], 1]
top = V[body, 2].max()
scalp = body[(V[body, 2] > z10 - 0.03)]
S, SN = V[scalp], vn[scalp]
kd = cKDTree(S)
def surf(p, h):
    _, i = kd.query(p, k=4); P = S[i].mean(0); n = SN[i].mean(0); n /= np.linalg.norm(n)
    return P + n * h, n

# root region: top of the head behind the hairline; a narrower front tuft (receding temples)
cand = scalp[(V[scalp, 2] > z10 - 0.004) & (V[scalp, 1] > y10 + 0.012)]
roots = []
for _ in range(3200):
    a, b, c = S[rng.integers(len(S), size=3)] if False else V[cand[rng.integers(len(cand), size=3)]]
    w = rng.dirichlet([1, 1, 1]); p = a * w[0] + b * w[1] + c * w[2]
    # receding temples: drop roots too far sideways near the front
    front = np.clip((y10 + 0.07 - p[1]) / 0.06, 0, 1)
    if abs(p[0]) > 0.055 - 0.025 * front: continue
    roots.append(p)
roots = np.array(roots)
print("roots", len(roots))

cards_v, cards_f, cards_uv = [], [], []
NSEG = 7
for p0 in roots:
    front = np.clip((y10 + 0.06 - p0[1]) / 0.06, 0, 1)      # 1 at the hairline, 0 at the crown
    L = rng.uniform(0.05, 0.08) * (0.85 + 0.45 * front)
    W0 = rng.uniform(0.0035, 0.0065)
    lift0 = 0.0015 + 0.006 * front * rng.uniform(0.6, 1.2)   # front hair stands up
    side = np.sign(p0[0]) * min(1.0, abs(p0[0]) / 0.03)
    pts = []; nrm = []
    p, n = surf(p0, 0.0045)
    d = np.array([0.22 * side * (0.3 + 0.7 * (1 - front)), 1.0, 0.25 + 0.9 * front]); d /= np.linalg.norm(d)
    for k in range(NSEG + 1):
        pts.append(p.copy()); nrm.append(n.copy())
        t = (k + 1) / NSEG
        d = d - n * (d @ n) * (0.55 if k > 0 else 0.2)          # follow the skull
        d += rng.normal(0, 0.03, 3); d /= np.linalg.norm(d)
        p = p + d * L / NSEG
        h = 0.0045 + lift0 * np.sin(np.pi * min(1, t * 0.9)) + 0.004 * t * (1 - front)
        p, n = surf(p, h)
    pts = np.array(pts); nrm = np.array(nrm)
    tang = np.gradient(pts, axis=0); tang /= np.linalg.norm(tang, axis=1, keepdims=True)
    side_v = np.cross(tang, nrm); side_v /= np.linalg.norm(side_v, axis=1, keepdims=True)
    width = W0 * np.linspace(1.0, 0.45, NSEG + 1)
    base = len(np.concatenate(cards_v)) if cards_v else 0
    vs = np.concatenate([pts - side_v * width[:, None] / 2, pts + side_v * width[:, None] / 2])
    u0 = rng.integers(4) * 0.25
    uvs = np.concatenate([np.stack([np.full(NSEG + 1, u0), np.linspace(0, 1, NSEG + 1)], 1),
                          np.stack([np.full(NSEG + 1, u0 + 0.25), np.linspace(0, 1, NSEG + 1)], 1)])
    fs = []
    for k in range(NSEG):
        a, b, c, d_ = k, k + 1, NSEG + 1 + k + 1, NSEG + 1 + k
        fs.append([base + a, base + b, base + c, base + d_])
    cards_v.append(vs); cards_f += fs; cards_uv.append(uvs)
CV = np.concatenate(cards_v); CU = np.concatenate(cards_uv); CF = np.array(cards_f)
np.savez("hair_cards.npz", V=CV, F=CF, uv=CU)
print("cards verts", len(CV), "quads", len(CF))

tex = cv2.imread("skin_4k.png").astype(np.float32) / 255; hpm = cv2.imread("hairprob_4k.png", 0) > 230
HC = np.median(tex[hpm], 0); HC = (HC * 0.62 + HC.mean() * 0.62 * 0.25) / 1.0; print("hair colour BGR", HC)
# strand texture: 4 variants side by side (u quarters), v = root(0) -> tip(1). Stored with v up.
TW, TH = 1024, 1024
img = np.zeros((TH, TW, 4), np.float32)
for q in range(4):
    for _ in range(150):
        x = q * 256 + rng.uniform(8, 248); w = rng.uniform(0.9, 2.2)
        tip = rng.uniform(0.6, 1.0); bend = rng.normal(0, 6)
        shade = rng.uniform(0.75, 1.25)
        for yy in range(TH):
            v = 1 - yy / TH               # v=0 at the bottom row = root
            if v > tip: continue
            xx = x + bend * v * v
            a = (1 - (v / tip) ** 3) * rng.uniform(0.75, 1.0)
            x0 = int(xx - 2 * w); x1 = int(xx + 2 * w) + 1
            for xi in range(max(q * 256, x0), min((q + 1) * 256, x1)):
                k = np.exp(-((xi - xx) / w) ** 2)
                img[yy, xi, 3] = max(img[yy, xi, 3], a * k)
                img[yy, xi, :3] = HC * shade
img[..., :3] = np.where(img[..., 3:] > 0, img[..., :3], HC)
uq = (np.arange(TW) % 256) / 256.0
img[..., 3] *= (np.sin(np.pi * uq) ** 0.7)[None, :]
cv2.imwrite("strands.png", (np.clip(img, 0, 1) * 255).astype(np.uint8))
