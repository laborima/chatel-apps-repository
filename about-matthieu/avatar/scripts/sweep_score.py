import sys, json, glob, os, numpy as np, cv2
sys.argv_ = sys.argv; sys.argv = [sys.argv[0]]
exec(open("identity.py").read().split("cache = ")[0])
R = np.load("id_ref.npz")["E"]; d = sys.argv_[1]
names = ["BASE"] + json.load(open(f"{d}/names.json"))
res = {}
for n in names:
    sc_ = []
    for f in sorted(glob.glob(f"{d}/{n}__*.jpg")):
        fa = app.get(cv2.imread(f))
        if fa: sc_.append(float(np.mean(R @ max(fa, key=lambda x: (x.bbox[2]-x.bbox[0])*(x.bbox[3]-x.bbox[1])).normed_embedding)))
    res[n] = float(np.mean(sc_)) if sc_ else float("nan")
b = res["BASE"]; print("BASE", round(b, 4))
for n, s in sorted(res.items(), key=lambda x: -x[1])[:25]: print(f"{n:40s} {s:.4f} {s - b:+.4f}")
json.dump(res, open(f"{d}/scores.json", "w"))
