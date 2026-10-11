"""Lower-face contour points from the face-skin segmentation (rows between mouth corners and chin)."""
import numpy as np, json, cv2
from geom import load_seg
A = json.load(open("analysis2.json")); L = json.load(open("landmarks.json"))
out = {}
for n in ["front", "front_close", "p01", "p03", "p04", "p05", "p06", "p09", "p12", "p17", "p18"]:
    lm = np.array((L.get(n) or A[n])["lm"])[:, :2]
    s = load_seg(f"seg_{n}.npy" if n in L else f"seg2_{n}.npy"); face = (s.argmax(-1) == 3).astype(np.uint8)
    _, lab = cv2.connectedComponents(face); face = lab == lab[int(lm[1, 1]), int(lm[1, 0])]
    y0 = lm[61, 1]; y1 = y0 + 0.8 * (lm[152, 1] - y0)
    pts = []
    for y in np.linspace(y0, y1, 9).astype(int):
        xs = np.where(face[y])[0]
        if len(xs) > 10: pts += [(xs.min(), y), (xs.max(), y)]
    out[n] = pts
    print(n, len(pts), "width at mouth / iod %.2f" % ((pts[1][0] - pts[0][0]) / np.linalg.norm(lm[33] - lm[263])))
json.dump(out, open("jaw_sil.json", "w"), default=int)
