"""Shared helpers: landmark detection, ray casting, projection."""
import numpy as np, cv2, json

ROOT = "/home/claude/workspace/avatar-3d"
_det = None


def detect(img_bgr):
    global _det
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    if _det is None:
        opt = vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=f"{ROOT}/tools/face_landmarker.task"),
                                           output_face_blendshapes=False, num_faces=1)
        _det = vision.FaceLandmarker.create_from_options(opt)
    h, w = img_bgr.shape[:2]
    r = _det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)))
    if not r.face_landmarks:
        return None
    return np.array([[l.x * w, l.y * h] for l in r.face_landmarks[0]])


def ray_mesh(orig, dirs, V, F, chunk=64):
    """Möller–Trumbore, returns (t, tri, b1, b2) for nearest hit per ray (t=inf if none)."""
    v0, v1, v2 = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    e1, e2 = v1 - v0, v2 - v0
    res_t = np.full(len(dirs), np.inf); res_f = np.full(len(dirs), -1); res_b = np.zeros((len(dirs), 2))
    for s in range(0, len(dirs), chunk):
        d = dirs[s:s + chunk][:, None, :]
        p = np.cross(d, e2[None])
        det = (e1[None] * p).sum(-1)
        inv = 1.0 / np.where(np.abs(det) < 1e-12, 1e-12, det)
        tv = orig[None, None, :] - v0[None]
        u = (tv * p).sum(-1) * inv
        q = np.cross(tv, e1[None])
        v = (d * q).sum(-1) * inv
        t = (e2[None] * q).sum(-1) * inv
        ok = (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 1e-6)
        t = np.where(ok, t, np.inf)
        j = t.argmin(1)
        rr = np.arange(len(j))
        res_t[s:s + chunk] = t[rr, j]; res_f[s:s + chunk] = j
        res_b[s:s + chunk] = np.stack([u[rr, j], v[rr, j]], 1)
    return res_t, res_f, res_b


def bary_point(V, F, tri, b):
    f = F[tri]
    return V[f[:, 0]] * (1 - b[:, 0] - b[:, 1])[:, None] + V[f[:, 1]] * b[:, 0:1] + V[f[:, 2]] * b[:, 1:2]


def blender_cam_rays(M, f, W, H, px):
    M = np.array(M)
    R, C = M[:3, :3], M[:3, 3]
    d = np.stack([(px[:, 0] - W / 2) / f, -(px[:, 1] - H / 2) / f, -np.ones(len(px))], 1)
    d = d @ R.T
    return C, d / np.linalg.norm(d, axis=1, keepdims=True)


def rodrigues(r):
    th = np.linalg.norm(r)
    if th < 1e-12:
        return np.eye(3)
    k = r / th
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + np.sin(th) * K + (1 - np.cos(th)) * K @ K


def project(P, R, t, f, cx, cy):
    """Camera looking down +Z_cam (OpenCV convention): x right, y down."""
    Pc = P @ R.T + t
    return np.stack([f * Pc[:, 0] / Pc[:, 2] + cx, f * Pc[:, 1] / Pc[:, 2] + cy], 1), Pc


def load_seg(path, W=3472, H=4624):
    """Segmentation confidences stored as uint8 at half resolution -> float32 (H, W, 6)."""
    a = np.load(path).astype(np.float32) / 255
    return np.stack([cv2.resize(np.ascontiguousarray(a[..., k]), (W, H)) for k in range(a.shape[2])], -1)
