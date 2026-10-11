import numpy as np, cv2
tex = cv2.imread("skin_4k.png"); cov = cv2.imread("../shots/bake_cover.jpg", 0)
lab = cv2.cvtColor(tex, cv2.COLOR_BGR2LAB).astype(np.float32)
L, a, b = lab[..., 0], lab[..., 1] - 128, lab[..., 2] - 128
# hair: dark, low redness; skin: brighter and redder. soft score
s = 1 / (1 + np.exp(((L - 112) / 9))) * 1 / (1 + np.exp((a - 17) / 3))
s = cv2.GaussianBlur(s, (0, 0), 2)
# restrict to the head island region (x > 0.6 of width)
H, W = s.shape; s[:, : int(0.6 * W)] = 0
cv2.imwrite("hairmask_4k.png", (np.clip(s, 0, 1) * 255).astype(np.uint8))
crop = (np.clip(s, 0, 1) * 255).astype(np.uint8)[600:3550, 2450:4000]
vis = tex[600:3550, 2450:4000].copy(); vis[..., 2] = np.maximum(vis[..., 2], crop)
cv2.imwrite("../shots/hairmask.jpg", cv2.resize(np.hstack([cv2.cvtColor(crop, cv2.COLOR_GRAY2BGR), vis]), None, fx=0.25, fy=0.25))
