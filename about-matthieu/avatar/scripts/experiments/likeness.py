"""Compare face proportions between photo and render using MediaPipe landmarks."""
import cv2, numpy as np, json, sys
from geom import detect
LM = json.load(open("landmarks.json"))
def feats(lm):
    d = lambda a, b: np.linalg.norm(lm[a] - lm[b])
    iod = d(33, 263)
    return {
        "eye_open_R": (d(159, 145)) / d(33, 133), "eye_open_L": d(386, 374) / d(362, 263),
        "eye_width": (d(33, 133) + d(362, 263)) / 2 / iod, "inner_canthi": d(133, 362) / iod,
        "nose_width": d(129, 358) / iod, "nose_len": d(168, 2) / iod, "mouth_width": d(61, 291) / iod,
        "upper_lip": d(0, 13) / iod, "lower_lip": d(14, 17) / iod, "chin_h": d(17, 152) / iod,
        "face_w_cheek": d(234, 454) / iod, "jaw_w": d(172, 397) / iod, "face_h": d(10, 152) / iod,
        "brow_eye": (d(105, 159) + d(334, 386)) / 2 / iod, "nose_mouth": d(2, 0) / iod,
    }
photo = feats(np.array(LM[sys.argv[2] if len(sys.argv) > 2 else "front"]["lm"])[:, :2])
img = cv2.imread(sys.argv[1]); lm = detect(img)
if lm is None: print("no face in render"); sys.exit()
ren = feats(lm)
tot = 0
for k in photo:
    e = (ren[k] - photo[k]) / photo[k] * 100; tot += e * e
    print(f"{k:14s} photo {photo[k]:.3f} render {ren[k]:.3f}  {e:+6.1f}%")
print("RMS %", np.sqrt(tot / len(photo)))
