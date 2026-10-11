import mediapipe as mp, cv2, json, numpy as np, glob, os
from mediapipe.tasks.python import vision, BaseOptions
T = "/home/claude/workspace/avatar-3d/tools"
face = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=f"{T}/face_landmarker.task"), output_face_blendshapes=True, output_facial_transformation_matrixes=True, num_faces=1))
pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=f"{T}/pose_landmarker_heavy.task"), num_poses=1))
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path=f"{T}/selfie_multiclass.tflite"), output_confidence_masks=True))
out = {}
for p in sorted(glob.glob("../photos2/*.jpg")):
    n = os.path.basename(p)[:-4]; img = cv2.imread(p); h, w = img.shape[:2]
    rgb = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    r = face.detect(rgb); d = {}
    if r.face_landmarks:
        d["lm"] = [[l.x * w, l.y * h, l.z * w] for l in r.face_landmarks[0]]
        d["bs"] = {b.category_name: b.score for b in r.face_blendshapes[0]}
        M = np.array(r.facial_transformation_matrixes[0]); d["M"] = M.tolist()
        yaw = np.degrees(np.arctan2(M[0, 2], M[2, 2])); pitch = np.degrees(np.arcsin(-M[1, 2]))
        d["yaw"], d["pitch"] = float(yaw), float(pitch)
    rp = pose.detect(rgb)
    if rp.pose_landmarks:
        d["pose"] = [[l.x * w, l.y * h, l.visibility] for l in rp.pose_landmarks[0]]
    small = cv2.resize(img, (w // 2, h // 2))
    rs = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(small, cv2.COLOR_BGR2RGB)))
    conf = np.stack([m.numpy_view() for m in rs.confidence_masks], -1)
    np.save(f"seg2_{n}.npy", conf.astype(np.float16))  # half resolution
    out[n] = d
    bs = d.get("bs", {})
    print(n, "yaw %.0f pitch %.0f" % (d.get("yaw", 0), d.get("pitch", 0)), "smile %.2f jaw %.2f" % (bs.get("mouthSmileLeft", 0) + bs.get("mouthSmileRight", 0), bs.get("jawOpen", 0)),
          "iod %.0f" % (np.linalg.norm(np.subtract(d["lm"][33][:2], d["lm"][263][:2])) if "lm" in d else 0))
json.dump(out, open("analysis2.json", "w"), default=float)
