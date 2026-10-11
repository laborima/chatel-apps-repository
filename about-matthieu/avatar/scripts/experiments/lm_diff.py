"""Landmark discrepancy render vs photo (same camera). Usage: lm_diff.py render.png photo_name scale out.jpg"""
import sys, json, cv2, numpy as np
from geom import detect
r, name, s, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
img = cv2.imread(r); lr = detect(img) / s
L = json.load(open("landmarks.json"))
lp = np.array(L[name]["lm"])[:, :2] if name in L else np.array(json.load(open("analysis2.json"))[name]["lm"])[:, :2]
iod = np.linalg.norm(lp[33] - lp[263])
d = (lr - lp)[:468] / iod * 100
groups = {"brows": [70, 63, 105, 66, 107, 336, 296, 334, 293, 300], "eyes": [33, 133, 159, 145, 362, 263, 386, 374], "nose": [1, 2, 4, 5, 98, 327, 168, 6],
          "mouth": [61, 291, 0, 17, 13, 14, 37, 267, 84, 314], "chin": [152, 148, 377, 176, 400], "jaw": [172, 397, 136, 365, 58, 288], "cheek": [234, 454, 93, 323, 132, 361], "forehead": [10, 109, 338, 67, 297]}
for g, ids in groups.items():
    v = d[ids].mean(0); print(f"{g:9s} dx {v[0]:+5.1f}  dy {v[1]:+5.1f}  (% iod; +y = render lower)")
print("RMS", np.sqrt((d ** 2).sum(1).mean()))
ph = cv2.resize(cv2.imread(f"../photos/{name}.jpg" if name in L else f"../photos2/{name}.jpg"), None, fx=s, fy=s)
vis = cv2.addWeighted(ph, 0.5, img, 0.5, 0)
for a, b in zip(lp * s, lr * s): cv2.arrowedLine(vis, tuple(a.astype(int)), tuple(b.astype(int)), (0, 0, 255), 1, tipLength=0.3)
cv2.imwrite(out, vis)
