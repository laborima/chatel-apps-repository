import mediapipe as mp, cv2, json, sys, numpy as np
from mediapipe.tasks.python import vision, BaseOptions
opt = vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path='/home/claude/workspace/avatar-3d/tools/face_landmarker.task'),
    output_face_blendshapes=True, output_facial_transformation_matrixes=True, num_faces=1)
det = vision.FaceLandmarker.create_from_options(opt)
out = {}
for name in sys.argv[1:]:
    p = f'/home/claude/workspace/avatar-3d/photos/{name}.jpg'
    img = cv2.imread(p); h, w = img.shape[:2]
    r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
    if not r.face_landmarks: print(name, 'NO FACE'); continue
    lm = np.array([[l.x*w, l.y*h, l.z*w] for l in r.face_landmarks[0]])
    out[name] = dict(w=w, h=h, lm=lm.tolist(), M=np.array(r.facial_transformation_matrixes[0]).tolist(),
        bs={b.category_name: b.score for b in r.face_blendshapes[0]})
    vis = img.copy()
    for x,y,_ in lm: cv2.circle(vis, (int(x),int(y)), 4, (0,255,0), -1)
    cv2.imwrite(f'/home/claude/workspace/avatar-3d/shots/lm_{name}.jpg', cv2.resize(vis, (w//3, h//3)))
    print(name, 'ok', lm[:,0].min(), lm[:,0].max(), lm[:,1].min(), lm[:,1].max())
json.dump(out, open('/home/claude/workspace/avatar-3d/build/landmarks.json','w'))
