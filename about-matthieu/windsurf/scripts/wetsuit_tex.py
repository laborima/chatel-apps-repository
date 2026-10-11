"""Paint a black wetsuit (with booties) into the avatar skin texture: everything below the neck except the hands."""
import numpy as np, cv2
B = "/home/claude/workspace/avatar-3d/build"
m = np.load(f"{B}/base_mesh.npz"); F, FL, UV = m["F"], m["FL"], m["uv"]; V = m["V"]; vid = np.load(f"{B}/corr.npz")["vid"]
T = 4096; tex = cv2.imread(f"{B}/skin_4k.png")
names = [str(x) for x in m["gnames"]]
hand = np.zeros(len(V), bool)
for n in names:
    if "Hand" in n: hand[m["g_" + n]] = True
neck_z = V[vid[152], 2] - 0.065           # collar ~6.5 cm below the chin
suit_v = (V[:, 2] < neck_z) & ~hand
# soften the cuff: hands start a bit after the wrist, keep wetsuit on the forearm
fsuit = suit_v[F].mean(1) > 0.5
rng = np.random.default_rng(0)
mask = np.zeros((T, T), np.uint8)
for fl in FL[fsuit]:
    q = UV[fl] * T; q[:, 1] = T - q[:, 1]
    cv2.fillConvexPoly(mask, q.astype(np.int32), 255)
mask = cv2.dilate(mask, np.ones((5, 5), np.uint8))
neo = np.full_like(tex, 0); neo[:] = (24, 22, 21)                       # BGR near-black neoprene
noise = cv2.GaussianBlur(rng.normal(0, 1, (T, T)).astype(np.float32), (0, 0), 1.2)
neo = np.clip(neo.astype(np.float32) * (1 + 0.12 * noise[..., None]), 0, 255)
m3 = (cv2.GaussianBlur(mask, (0, 0), 2).astype(np.float32) / 255)[..., None]
out = tex * (1 - m3) + neo * m3
cv2.imwrite("/home/claude/workspace/avatar-3d/windsurf/build/skin_wetsuit.png", out.astype(np.uint8))
print("wetsuit faces", int(fsuit.sum()), "of", len(F))
