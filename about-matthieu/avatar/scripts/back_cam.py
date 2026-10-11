import numpy as np, gzip, os, cv2
from scipy.optimize import least_squares
from geom import rodrigues, project
TD = os.path.expanduser("~/.config/blender/4.5/extensions/user_default/mpfb/data/targets")
m = np.load("base_mesh.npz"); V0 = m["V"]; body = m["g_body"]
r = np.load("fit2_result.npz"); V = r["Vfit"]; F_PX = float(r["F_PX"])
ear = {}
for side, sgn in (("r", -1), ("l", 1)):
    a = np.loadtxt(gzip.open(f"{TD}/ears/{side}-ear-scale-incr.target.gz")); i = np.intersect1d(a[:, 0].astype(int), body)
    ear[side] = i[V0[i, 0] * sgn > 0.072]
obs = {"l": [(789, 1816), (705, 1974), (974, 2368)], "r": [(2539, 1750), (2605, 1921), (2382, 2329)]}
Rb = np.array([[-1, 0, 0], [0, 0, -1], [0, -1, 0]], float)
c = V[np.concatenate([ear["l"], ear["r"]])].mean(0)
def res(x):
    R = rodrigues(x[:3]); t = x[3:]; out = []
    for s in "lr":
        uv, _ = project(V[ear[s]], R, t, F_PX, 1736, 2312)
        lat = uv[:, 0].argmin() if s == "l" else uv[:, 0].argmax()
        pts = np.array([uv[uv[:, 1].argmin()], uv[lat], uv[uv[:, 1].argmax()]])
        out.append((pts - np.array(obs[s])).ravel())
    Pc = V[np.concatenate([ear['l'], ear['r']])].mean(0) @ R.T + t
    out.append([(Pc[2] - 0.54) * 400])
    return np.concatenate(out)
x0 = np.concatenate([cv2.Rodrigues(Rb)[0].ravel(), -Rb @ c + np.array([0, 0, 0.5])])
best=None
for pit in range(0, 61, 5):
    Rg = rodrigues(np.radians([-pit, 0, 0])) @ Rb
    xi = np.concatenate([cv2.Rodrigues(Rg)[0].ravel(), -Rg @ c + np.array([0, 0, 0.54])])
    si = least_squares(res, xi)
    if best is None or si.cost < best.cost: best = si; bp = pit
s = best; print("pitch init", bp)
print("rms px", np.sqrt((s.fun ** 2).mean()), "t", s.x[3:])
np.save("cam_back.npy", s.x)
img = cv2.imread("../photos/back.jpg"); cv2.imwrite("clean_back.jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 95])
np.save("rel_back.npy", np.ones(img.shape[:2], np.float16))
for nm, x in (("init", x0), ("final", s.x)):
    print(nm, np.round(res(x)[:12].reshape(-1, 2)).astype(int).tolist())
R = rodrigues(s.x[:3]); print("R", np.round(R, 2)); print("ear l mean", V[ear["l"]].mean(0), "r", V[ear["r"]].mean(0))
