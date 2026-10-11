"""Per-region colour gains so the render matches the photos (same cameras). Usage: color_calib.py renderprefix [update]"""
import sys, json, os, cv2, numpy as np, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path="/home/claude/workspace/avatar-3d/tools/selfie_multiclass.tflite"), output_confidence_masks=True))
def cls(img):
    r = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
    return np.stack([m.numpy_view().squeeze() for m in r.confidence_masks], -1).argmax(-1)
def lin(x): x = x / 255.0; return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
pre = sys.argv[1]; acc = {"skin": [], "hair": []}
for v in ["front_close", "front", "p03", "p09", "p17", "three_quarter"]:
    ren = cv2.imread(f"{pre}_{v}.png")
    if ren is None: continue
    phf = f"../photos/{v}.jpg" if not v[1:].isdigit() else f"../photos2/{v}.jpg"
    ph = cv2.resize(cv2.imread(phf), (ren.shape[1], ren.shape[0]))
    cr, cp = cls(ren), cls(ph)
    for name, c in (("skin", 3), ("hair", 1)):
        m = (cr == c) & (cp == c)
        m = cv2.erode(m.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        if m.sum() < 200: continue
        g = np.median(lin(ph[m].astype(float)), 0) / np.maximum(np.median(lin(ren[m].astype(float)), 0), 1e-4)
        acc[name].append(g)
out = {k: np.median(np.array(v), 0) for k, v in acc.items() if v}
norm = float(np.mean(out["skin"])); out = {k: (v / norm).tolist() for k, v in out.items()}   # relative only: lighting of the check renders cancels out
print("linear BGR gains photo/render:", {k: np.round(v, 3).tolist() for k, v in out.items()})
if len(sys.argv) > 2:
    old = json.load(open("calib.json")) if os.path.exists("calib.json") else {"skin": [1, 1, 1], "hair": [1, 1, 1]}
    new = {k: (np.array(old[k]) * np.clip(np.array(out.get(k, [1, 1, 1])), 0.6, 1.6)).tolist() for k in old}
    json.dump(new, open("calib.json", "w")); print("calib.json ->", {k: np.round(v, 3).tolist() for k, v in new.items()})
