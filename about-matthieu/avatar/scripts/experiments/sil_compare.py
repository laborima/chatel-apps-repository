"""Overlay face/hair/skin segmentation contours: photo (green) vs render (red). Usage: sil_compare.py render.png photo_path out.jpg"""
import sys, cv2, numpy as np, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path="/home/claude/workspace/avatar-3d/tools/selfie_multiclass.tflite"), output_confidence_masks=True))
def masks(img):
    r = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
    c = np.stack([m.numpy_view().squeeze() for m in r.confidence_masks], -1); a = c.argmax(-1)
    return {"face": (a == 3), "hair": (a == 1), "skin": (a == 2) | (a == 3), "person": a != 0}
ren = cv2.imread(sys.argv[1]); ph = cv2.resize(cv2.imread(sys.argv[2]), (ren.shape[1], ren.shape[0]))
mr, mpp = masks(ren), masks(ph)
vis = cv2.addWeighted(ph, 0.6, ren, 0.4, 0)
for k, th in (("face", 2), ("hair", 1)):
    for m, col in ((mpp[k], (0, 200, 0)), (mr[k], (0, 0, 255))):
        cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); cv2.drawContours(vis, cs, -1, col, th)
for k in ("face", "hair", "person"):
    i = (mr[k] & mpp[k]).sum(); u = (mr[k] | mpp[k]).sum(); print(f"IoU {k} {i / max(u, 1):.3f}  area ratio render/photo {mr[k].sum() / max(mpp[k].sum(), 1):.2f}")
cv2.imwrite(sys.argv[3], vis)
