import cv2, numpy as np, json, sys
from geom import load_seg
LM = json.load(open("landmarks.json"))
PROF_BAND = {"profile_right_side": [(820, 1450), (2160, 1440), (2200, 1900), (1950, 1960), (1300, 1760), (900, 1800), (560, 2300), (700, 2350), (950, 1830)],
             "profile_left_side": [(1250, 1200), (2700, 1250), (2840, 1900), (2730, 1960), (2550, 1450), (1500, 1450), (1450, 1800), (1200, 1800)]}
def clean(name):
    """returns cleaned photo (frame inpainted, purple tint removed) and a 'reliability' map (0..1)"""
    img = cv2.imread(f"../photos/{name}.jpg")
    band = np.zeros(img.shape[:2], np.uint8)
    if name in LM:
        lm = np.array(LM[name]["lm"])[:, :2]
        eyes = lm[[33, 133, 362, 263, 159, 145, 386, 374, 70, 300, 105, 334]]
        x0, y0 = eyes.min(0); x1, y1 = eyes.max(0); w = x1 - x0
        cv2.rectangle(band, (int(x0 - 0.9 * w), int(y0 - 0.25 * w)), (int(x1 + 0.9 * w), int(y1 + 0.35 * w)), 255, -1)
        lens = np.zeros_like(band)
        for side in ([33, 133, 159, 145, 70, 105], [362, 263, 386, 374, 300, 334]):
            p = lm[side]; c = p.mean(0); ww = np.ptp(p[:, 0])
            cv2.ellipse(lens, (int(c[0]), int(c[1] + 0.12 * ww)), (int(0.95 * ww), int(0.62 * ww)), 0, 0, 360, 255, -1)
    else:
        cv2.fillPoly(band, [np.array(PROF_BAND[name], np.int32)], 255)
        lens = np.zeros_like(band)
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    ks = 71 if name in LM else 101
    bh = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ks, ks)))
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(int)
    H, S, V = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2]
    frame = (bh > (45 if name in LM else 35)) & (S < 0.5) & (V < (110 if name in LM else 80)) & (band > 0)
    spec = (H > 200) & (H < 300) & (S > 0.35) & (lens > 0)  # strong purple/blue reflections
    try:
        acc = load_seg(f"seg_{name}.npy")[..., 5] > 0.35
    except FileNotFoundError:
        acc = np.zeros_like(frame)
    m = ((frame | spec | acc) * 255).astype(np.uint8)
    m = cv2.dilate(m, np.ones((7, 7), np.uint8), iterations=2)
    band = np.maximum(band, cv2.dilate((acc * 255).astype(np.uint8), np.ones((25, 25), np.uint8)))
    ys, xs = np.where(band > 0)
    x0, x1, y0, y1 = max(0, xs.min() - 60), xs.max() + 60, max(0, ys.min() - 60), ys.max() + 60
    out = img.copy()
    out[y0:y1, x0:x1] = cv2.inpaint(img[y0:y1, x0:x1], m[y0:y1, x0:x1], 9, cv2.INPAINT_TELEA)
    # remove purple cast inside lens: pull Lab a/b toward the skin chroma measured just below the lens
    if lens.any():
        lab = cv2.cvtColor(out, cv2.COLOR_BGR2LAB).astype(float)
        below = np.roll(lens, int(0.9 * np.ptp(np.where(lens > 0)[0]) / 2), axis=0) & ~lens
        ref = lab[below > 0].mean(0)
        lm_ = cv2.GaussianBlur((lens > 0).astype(float), (0, 0), 25)
        for ch in (1, 2):
            lowf = cv2.GaussianBlur(lab[..., ch], (0, 0), 15)
            lab[..., ch] = lab[..., ch] - lm_ * (lowf - ref[ch])
        out = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
    rel = 1.0 - 0.85 * cv2.GaussianBlur((m > 0).astype(np.float32), (0, 0), 6)
    if lens.any(): rel *= 1.0 - 0.5 * cv2.GaussianBlur((lens > 0).astype(np.float32), (0, 0), 10)
    if name == "three_quarter":
        rel *= 1.0 - 0.6 * cv2.GaussianBlur((band > 0).astype(np.float32), (0, 0), 20)
    return out, np.clip(rel, 0, 1), m, (x0, y0, x1, y1)
if __name__ == "__main__":
    tiles = []
    for n in sys.argv[1:]:
        out, rel, m, (x0, y0, x1, y1) = clean(n)
        cv2.imwrite(f"clean_{n}.jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 95]); np.save(f"rel_{n}.npy", rel.astype(np.float16))
        img = cv2.imread(f"../photos/{n}.jpg"); vis = img.copy(); vis[m > 0] = (0, 0, 255)
        y0 = max(0, y0 - 200); y1 += 200; x0 = max(0, x0 - 100); x1 += 100
        r = 420 / (y1 - y0)
        tiles.append(np.vstack([cv2.resize(vis[y0:y1, x0:x1], None, fx=r, fy=r), cv2.resize(out[y0:y1, x0:x1], None, fx=r, fy=r)]))
    h = max(t.shape[0] for t in tiles)
    cv2.imwrite("../shots/glasses_clean.jpg", np.hstack([cv2.copyMakeBorder(t, 0, h - t.shape[0], 0, 0, cv2.BORDER_CONSTANT) for t in tiles]))
