import numpy as np, cv2, sys
from geom import rodrigues, project
m = np.load("base_mesh.npz"); F = m["F"]; body = m["g_body"]
r = np.load(sys.argv[1] if len(sys.argv) > 1 else "fit_result.npz")
V = r["Vfit"]; F_PX = float(r["F_PX"])
headz = 1.45
inb = np.zeros(len(V), bool); inb[body] = True
tri = F[(inb[F].all(1)) & (V[F, 2].min(1) > headz)]
out = []
for name, c in zip(r["vnames"], r["cams"]):
    img = cv2.imread(f"../photos/{name}.jpg")
    R = rodrigues(c[:3]); t = c[3:]
    uv, Pc = project(V, R, t, F_PX, 1736, 2312)
    # painter's: far to near, shade by normal
    n = np.cross(Pc[tri[:, 1]] - Pc[tri[:, 0]], Pc[tri[:, 2]] - Pc[tri[:, 0]])
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    depth = Pc[tri, 2].mean(1)
    ov = img.copy(); mask = np.zeros(img.shape[:2], np.uint8)
    for i in np.argsort(-depth):
        if n[i, 2] > 0: continue
        sh = int(80 + 175 * min(1, -n[i, 2]))
        pts = uv[tri[i]].astype(np.int32)
        cv2.fillConvexPoly(ov, pts, (sh, sh * 0.8, sh * 0.6)); cv2.fillConvexPoly(mask, pts, 255)
    blend = cv2.addWeighted(img, 0.45, ov, 0.55, 0)
    cs, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(blend, cs, -1, (0, 0, 255), 5)
    try:
        sil = cv2.imread(f"sil_{name}.png", 0)
        cs2, _ = cv2.findContours(sil, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); cv2.drawContours(blend, cs2, -1, (0, 220, 0), 4)
    except Exception: pass
    ys, xs = np.where(mask > 0)
    x0, x1, y0, y1 = max(0, xs.min() - 300), min(3472, xs.max() + 300), max(0, ys.min() - 300), min(4624, ys.max() + 300)
    crop = blend[y0:y1, x0:x1]
    out.append(cv2.resize(crop, (int(600 * crop.shape[1] / crop.shape[0]), 600)))
    cv2.imwrite(f"../shots/diag_{name}.jpg", cv2.resize(blend, (868, 1156)))
cv2.imwrite(sys.argv[2] if len(sys.argv) > 2 else "../shots/diag_sheet.jpg", np.hstack(out))
