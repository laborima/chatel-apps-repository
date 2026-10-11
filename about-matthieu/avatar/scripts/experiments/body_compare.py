"""Compare body proportions photo vs render (same camera). Usage: body_compare.py renderprefix view1,view2"""
import sys, json, cv2, numpy as np, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
T = "/home/claude/workspace/avatar-3d/tools"
pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=f"{T}/pose_landmarker_heavy.task")))
from geom import detect
A = json.load(open("analysis2.json")); L = json.load(open("landmarks.json"))
def meas(img):
    h, w = img.shape[:2]
    r = pose.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
    p = np.array([[l.x * w, l.y * h, l.visibility] for l in r.pose_landmarks[0]]); lm = detect(img)
    iod = np.linalg.norm(lm[33] - lm[263]); d = lambda i, j: np.linalg.norm(p[i, :2] - p[j, :2]) / iod
    return dict(shoulders=d(11, 12), hips=d(23, 24), torso=np.linalg.norm((p[11, :2] + p[12, :2]) / 2 - (p[23, :2] + p[24, :2]) / 2) / iod,
                neck_y=((p[11, 1] + p[12, 1]) / 2 - lm[152, 1]) / iod)
pre = sys.argv[1]
for v in sys.argv[2].split(","):
    ph = cv2.imread(f"../photos2/{v}.jpg") if v.startswith("p") else cv2.imread(f"../photos/{v}.jpg")
    a_, b_ = meas(cv2.resize(ph, (868, 1156))), meas(cv2.imread(f"{pre}_{v}.png"))
    print(v, "  ".join(f"{k} {a_[k]:.2f}/{b_[k]:.2f} ({(b_[k]/a_[k]-1)*100:+.0f}%)" for k in a_))
