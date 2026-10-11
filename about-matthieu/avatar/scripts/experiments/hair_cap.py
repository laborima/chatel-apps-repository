"""Build a photo-textured hair shell from the scalp of the fitted head.
Outputs hair_cap.npz (verts, tris, loop uvs, source body vertex ids) and hair_4k.png (RGBA)."""
import numpy as np, cv2

T = 4096
m = np.load("base_mesh.npz"); F = m["F"]; FL = m["FL"]; UV = m["uv"]; body = m["g_body"]
V = np.load("fit2_result.npz")["Vfit"]; vid = np.load("corr.npz")["vid"]
hp_img = cv2.imread("hairprob_4k.png", 0).astype(np.float32) / 255
tex = cv2.imread("skin_4k.png")

inb = np.zeros(len(V), bool); inb[body] = True
Fb, FLb = F[inb[F].all(1)], FL[inb[F].all(1)]
def uv2px(uv): return np.clip((uv[:, 0] * T).astype(int), 0, T - 1), np.clip(((1 - uv[:, 1]) * T).astype(int), 0, T - 1)
x, y = uv2px(UV); hp_loop = hp_img[y, x]
hp_v = np.zeros(len(V)); np.maximum.at(hp_v, Fb.ravel(), hp_loop[FLb.ravel()])

z_forehead = V[vid[10], 2]; z_brow = V[vid[105], 2]; z_lobe = V[vid[177], 2] - 0.01
top = V[body, 2].max(); y_ear = V[vid[234], 1]
cand = (V[:, 2] > z_lobe - 0.02) | ((V[:, 1] > y_ear + 0.02) & (V[:, 2] > z_lobe - 0.07))
face_front = (V[:, 1] < y_ear - 0.015) & (V[:, 2] < z_forehead - 0.012)   # face, brows, beard
keep_v = inb & cand & ~face_front & (hp_v > 0.25)
fm = keep_v[Fb].all(1) & (hp_loop[FLb].mean(1) > 0.3)
Fc, FLc = Fb[fm], FLb[fm]
print("cap tris", len(Fc))

# vertex normals of the head
vn = np.zeros_like(V)
fn = np.cross(V[Fb[:, 1]] - V[Fb[:, 0]], V[Fb[:, 2]] - V[Fb[:, 0]])
for j in range(3): np.add.at(vn, Fb[:, j], fn)
vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12

uniq, inv = np.unique(Fc.ravel(), return_inverse=True)
P = V[uniq]; N = vn[uniq]
h = np.clip((P[:, 2] - (z_lobe + 0.03)) / (top - z_lobe - 0.03), 0, 1)
front_top = np.clip((y_ear + 0.01 - P[:, 1]) / 0.08, 0, 1) * h          # extra volume on the front-top (swept-up hair)
t = 0.0025 + 0.0035 * h ** 1.3 + 0.0015 * front_top
edge = np.clip((hp_v[uniq] - 0.3) / 0.45, 0, 1); edge = edge * edge * (3 - 2 * edge)
t *= 0.35 + 0.65 * edge
Pc = P + N * t[:, None]
tris = inv.reshape(-1, 3)
np.savez("hair_cap.npz", V=Pc, F=tris, uv=UV[FLc].reshape(-1, 2), src=uniq, t=t)

# RGBA texture: colour from the projected photos (slightly darker/denser), alpha from hair probability with strand breakup
col = tex.astype(np.float32)
lab = cv2.cvtColor(tex, cv2.COLOR_BGR2LAB).astype(np.float32)
lab[..., 0] *= 0.93
col = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
rng = np.random.default_rng(1)
noise = rng.random((T // 2, T // 2)).astype(np.float32)
noise = cv2.resize(cv2.GaussianBlur(noise, (0, 0), 0.8), (T, T))
streak = cv2.GaussianBlur(noise, (0, 0), sigmaX=6, sigmaY=0.7)          # elongated strands in UV
streak = (streak - streak.mean()) / (streak.std() + 1e-6)
a = np.clip((hp_img - 0.32) / 0.38, 0, 1)
a = np.clip(a + 0.25 * streak * (a < 0.98) * (a > 0.02), 0, 1)
a = cv2.GaussianBlur(a, (0, 0), 1.2)
rgba = np.dstack([col, (a * 255).astype(np.uint8)])
cv2.imwrite("hair_4k.png", rgba)
cv2.imwrite("../shots/hair_alpha.jpg", cv2.resize((a * 255).astype(np.uint8)[600:3550, 2450:4000], None, fx=0.25, fy=0.25))
print("thickness mm min/mean/max", t.min() * 1000, t.mean() * 1000, t.max() * 1000)
