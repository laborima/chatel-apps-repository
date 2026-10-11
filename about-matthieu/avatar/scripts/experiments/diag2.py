import numpy as np, cv2, sys
sys.argv = [sys.argv[0], "AC"]
exec(open("fit2.py").read().split("# ---------------- init cameras")[0])
r = np.load("fit2_result.npz"); x = r["x"]
w, c, cams = unpack(x); Vs = shape(w, c, Vs0, Ds, As, Bs)
out = []
for v, cam in zip(views, cams):
    if v["kind"] != "prof": continue
    img = cv2.imread(f"../photos/{v['name']}.jpg"); R = rodrigues(cam[:3]); t = cam[3:]
    cv2.polylines(img, [np.stack([v["cont"], np.arange(len(v["cont"]))], 1).astype(np.int32)], False, (0, 200, 0), 4)
    cv2.polylines(img, [np.stack([v["chin_x"], v["chin_y"]], 1).astype(np.int32)], False, (0, 200, 0), 4)
    Pm = 0.5 * (Vs[pos[midpairs[:, 0]]] + Vs[pos[midpairs[:, 1]]]); uvm, _ = project(Pm, R, t, F_PX, CX, CY)
    for p in uvm: cv2.circle(img, tuple(p.astype(int)), 7, (0, 0, 255), -1)
    uc, _ = project(Vs[pos[underchin]], R, t, F_PX, CX, CY)
    for p in uc: cv2.circle(img, tuple(p.astype(int)), 5, (255, 0, 255), -1)
    ue, _ = project(Vs[pos[v["ear"]]], R, t, F_PX, CX, CY)
    for p in ue: cv2.circle(img, tuple(p.astype(int)), 4, (255, 120, 0), -1)
    uf, _ = project(Vs[pos[[p[0] for p in v["pts"][3:]]]], R, t, F_PX, CX, CY)
    for p in uf: cv2.circle(img, tuple(p.astype(int)), 14, (255, 0, 0), -1)
    for _, o in v["pts"]: cv2.circle(img, o, 14, (0, 255, 0), -1)
    for a, b in v["rows"]:
        cv2.line(img, (0, a), (300, a), (0, 0, 0), 4); cv2.line(img, (0, b), (300, b), (0, 0, 0), 4)
    out.append(cv2.resize(img[900:3300, 400:3000] if v["facing"] < 0 else img[900:3300, 400:3000], (650, 600)))
cv2.imwrite("../shots/diag2_prof.jpg", np.hstack(out))
