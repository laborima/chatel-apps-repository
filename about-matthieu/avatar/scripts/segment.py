import mediapipe as mp, cv2, numpy as np, sys
from mediapipe.tasks.python import vision, BaseOptions
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
    base_options=BaseOptions(model_asset_path="/home/claude/workspace/avatar-3d/tools/selfie_multiclass.tflite"), output_confidence_masks=True))
# classes: 0 background, 1 hair, 2 body-skin, 3 face-skin, 4 clothes, 5 others(accessories)
tiles = []
for n in sys.argv[1:]:
    img = cv2.imread(f"../photos/{n}.jpg"); H, W = img.shape[:2]
    small = cv2.resize(img, (W // 2, H // 2))
    r = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(small, cv2.COLOR_BGR2RGB)))
    conf = np.stack([m.numpy_view() for m in r.confidence_masks], -1)
    conf = np.stack([cv2.resize(np.ascontiguousarray(conf[..., k]), (W, H)) for k in range(conf.shape[-1])], -1)
    np.save(f"seg_{n}.npy", conf.astype(np.float16))
    vis = (np.array([[200, 200, 200], [0, 40, 160], [180, 140, 255], [120, 200, 255], [255, 120, 0], [0, 255, 0]])[conf.argmax(-1)]).astype(np.uint8)
    tiles.append(cv2.resize(cv2.addWeighted(img, 0.4, vis, 0.6, 0), (434, 578)))
cv2.imwrite("../shots/segmentation.jpg", np.hstack(tiles))
