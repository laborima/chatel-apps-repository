"""Person-silhouette width at fixed distances below the chin (in iod), photo vs render. Usage: body_widths.py renderprefix v1,v2"""
import sys, cv2, numpy as np, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
from geom import detect
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path="/home/claude/workspace/avatar-3d/tools/selfie_multiclass.tflite"), output_confidence_masks=True))
KS = [0.8, 1.3, 1.8, 2.5, 3.5, 4.5, 5.5]
def widths(img):
    r = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
    a = np.stack([m.numpy_view().squeeze() for m in r.confidence_masks], -1).argmax(-1)
    lm = detect(img); iod = np.linalg.norm(lm[33] - lm[263]); out = []
    for k in KS:
        y = int(lm[152, 1] + k * iod)
        if y >= img.shape[0]: out.append(np.nan); continue
        xs = np.where(a[y] != 0)[0]; out.append((xs.max() - xs.min()) / iod if len(xs) else np.nan)
    return np.array(out)
pre = sys.argv[1]; tot = []
for v in sys.argv[2].split(","):
    ren = cv2.imread(f"{pre}_{v}.png"); ph = cv2.resize(cv2.imread(f"../photos2/{v}.jpg"), (ren.shape[1], ren.shape[0]))
    wp, wr = widths(ph), widths(ren); tot.append(wr / wp - 1)
    print(v, " ".join(f"{k}:{p:.2f}/{q:.2f}" for k, p, q in zip(KS, wp, wr)))
print("mean rel error % by depth below chin:", " ".join(f"{k}:{e * 100:+.0f}" for k, e in zip(KS, np.nanmean(tot, 0))))
