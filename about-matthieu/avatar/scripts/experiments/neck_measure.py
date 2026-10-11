"""Neck width (body-skin segmentation) relative to iod, photo vs render. Usage: neck_measure.py render.png photo.jpg"""
import sys, cv2, numpy as np, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
from geom import detect
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path="/home/claude/workspace/avatar-3d/tools/selfie_multiclass.tflite"), output_confidence_masks=True))
def neck(img):
    r = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
    a = np.stack([m.numpy_view().squeeze() for m in r.confidence_masks], -1).argmax(-1)
    lm = detect(img); iod = np.linalg.norm(lm[33] - lm[263]); out = []
    for f in (0.35, 0.6, 0.85):
        y = int(lm[152, 1] + f * iod)
        xs = np.where((a[y] == 2) | (a[y] == 3))[0]; cx = int(lm[152, 0])
        # contiguous run containing the chin x
        run = xs[(xs > cx - 2 * iod) & (xs < cx + 2 * iod)]
        out.append((run.max() - run.min()) / iod if len(run) else 0)
    return np.round(out, 2)
ren = cv2.imread(sys.argv[1]); ph = cv2.resize(cv2.imread(sys.argv[2]), (ren.shape[1], ren.shape[0]))
print("neck width/iod photo", neck(ph), "render", neck(ren))
