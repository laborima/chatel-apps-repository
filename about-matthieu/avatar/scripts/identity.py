"""ArcFace identity similarity: renders vs reference photos.  Usage: identity.py render1.png [render2.png ...]"""
import sys, glob, os, cv2, numpy as np
from insightface.app import FaceAnalysis
app = FaceAnalysis(name="buffalo_l", root="/home/claude/workspace/avatar-3d/tools/insightface", providers=["CPUExecutionProvider"], allowed_modules=["detection", "recognition"])
app.prepare(ctx_id=-1, det_size=(640, 640))
def emb(path):
    im = cv2.imread(path)
    s = 1600 / max(im.shape[:2]); im = cv2.resize(im, None, fx=s, fy=s) if s < 1 else im
    f = app.get(im)
    if not f: return None
    f = max(f, key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]))
    return f.normed_embedding
cache = "id_ref.npz"
if os.path.exists(cache):
    R = np.load(cache)["E"]
else:
    refs = sorted(glob.glob("../photos2/*.jpg")) + ["../photos/front.jpg", "../photos/front_close.jpg", "../photos/three_quarter.jpg"]
    R = np.array([e for e in (emb(p) for p in refs) if e is not None]); np.savez(cache, E=R)
    S = R @ R.T; iu = np.triu_indices(len(R), 1)
    print(f"photo-vs-photo baseline: mean {S[iu].mean():.3f} min {S[iu].min():.3f}")
centroid = R.mean(0); centroid /= np.linalg.norm(centroid)
for p in sys.argv[1:]:
    e = emb(p)
    if e is None: print(p, "NO FACE"); continue
    print(f"{os.path.basename(p):32s} vs photos mean {np.mean(R @ e):.3f}  vs centroid {centroid @ e:.3f}")
