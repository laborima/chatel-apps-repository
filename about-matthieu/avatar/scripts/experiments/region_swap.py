import sys, json, cv2, numpy as np
sys.argv_ = sys.argv; sys.argv = [sys.argv[0]]
exec(open("identity.py").read().split("cache = ")[0])
R = np.load("id_ref.npz")["E"]
ren = cv2.imread(sys.argv_[1]); ph = cv2.resize(cv2.imread(sys.argv_[2]), (ren.shape[1], ren.shape[0]))
lm = np.array(json.load(open("landmarks.json"))[sys.argv_[3]]["lm"])[:, :2] * ren.shape[1] / 3472
def score(img):
    f = app.get(img); f = max(f, key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1])); return float(np.mean(R @ f.normed_embedding))
regions = {"eyes": [33, 133, 159, 145, 362, 263, 386, 374, 70, 300, 105, 334], "nose": [168, 6, 1, 2, 98, 327, 129, 358], "mouth": [61, 291, 0, 17, 37, 267, 84, 314],
           "chin_jaw": [152, 148, 377, 172, 397, 136, 365, 17], "cheeks": [234, 454, 93, 323, 50, 280, 116, 345], "forehead_hair": [10, 109, 338, 67, 297, 54, 284]}
base = score(ren); print(f"render {base:.3f}   photo {score(ph):.3f}")
for k, ids in regions.items():
    hull = cv2.convexHull(lm[ids].astype(np.int32)); m = np.zeros(ren.shape[:2], np.float32); cv2.fillConvexPoly(m, hull, 1)
    if k == "forehead_hair": m[: int(lm[10, 1]) + 20, int(lm[234, 0]) - 40: int(lm[454, 0]) + 40] = 1
    m = cv2.dilate(m, np.ones((15, 15), np.uint8)); m = cv2.GaussianBlur(m, (0, 0), 6)[..., None]
    comp = (ph * m + ren * (1 - m)).astype(np.uint8)
    print(f"swap {k:14s} -> {score(comp):.3f} ({score(comp) - base:+.3f})")
for side, lo, hi in (("ears", 234, 454),):
    m = np.zeros(ren.shape[:2], np.float32); y0, y1 = int(lm[70, 1]), int(lm[2, 1]) + 30
    m[y0:y1, : int(lm[234, 0]) + 10] = 1; m[y0:y1, int(lm[454, 0]) - 10:] = 1; m = cv2.GaussianBlur(m, (0, 0), 6)[..., None]
    comp = (ph * m + ren * (1 - m)).astype(np.uint8); print(f"swap ears           -> {score(comp):.3f} ({score(comp) - base:+.3f})")
