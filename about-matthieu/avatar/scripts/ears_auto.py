import numpy as np, json, cv2, os
from geom import load_seg
A = json.load(open("analysis2.json")); L = json.load(open("landmarks.json"))
NEUTRAL = ["p01", "p03", "p04", "p05", "p06", "p09", "p12", "p17", "p18"]
def ear_extent(name):
    lm = np.array((L.get(name) or A[name])["lm"])[:, :2]
    segf = f"seg_{name}.npy" if name in L else f"seg2_{name}.npy"
    s = load_seg(segf); skin = ((s[..., 2] + s[..., 3]) > 0.5).astype(np.uint8)
    n, lab = cv2.connectedComponents(skin); c = lab[int(lm[1, 1]), int(lm[1, 0])]; skin = lab == c
    y0, y1 = int(lm[159, 1]), int(lm[2, 1])
    xl, xr = [], []
    for y in range(y0, y1, 4):
        xs = np.where(skin[y])[0]
        if len(xs): xl.append(xs.min()); xr.append(xs.max())
    return float(np.percentile(xl, 3)), float(np.percentile(xr, 97)), (y0, y1)
out = {}
for n in ["front", "front_close"] + NEUTRAL:
    l, r, yy = ear_extent(n); out[n] = {"r": l, "l": r}   # image-left = subject's right ear
    print(n, round(l), round(r), yy)
json.dump(out, open("ears_auto.json", "w"))
img = cv2.imread("../photos2/p01.jpg"); e = out["p01"]
for x in (e["r"], e["l"]): cv2.line(img, (int(x), 0), (int(x), 4623), (0, 0, 255), 6)
cv2.imwrite("../shots/ears_auto.jpg", cv2.resize(img, (868, 1156)))
