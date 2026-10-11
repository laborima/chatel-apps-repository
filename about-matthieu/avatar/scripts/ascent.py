"""After a sweep: build cumulative combos, or bake the best combo into a new fit. Usage:
  ascent.py combos <sweepdir> <outjson> <usedjson>
  ascent.py bake <combosjson> <scoresjson> <infit> <outfit> <usedjson>"""
import sys, json, glob, gzip, os, numpy as np
TD = os.path.expanduser("~/.config/blender/4.5/extensions/user_default/mpfb/data/targets")
CAP = 1.2
mode = sys.argv[1]
if mode == "combos":
    d, out, usedf = sys.argv[2:5]; used = json.load(open(usedf)) if os.path.exists(usedf) else {}
    sc = json.load(open(f"{d}/scores.json")); b = sc.pop("BASE")
    good = [n for n, v in sorted(sc.items(), key=lambda x: -x[1]) if v - b > 0.003 and used.get(n, 0) + 0.5 <= CAP]
    seen, order = set(), []
    for n in good:
        stem = n.rsplit("-", 1)[0]
        if stem in seen: continue
        seen.add(stem); order.append(n)
    combos = [{"tag": f"top{k}", "w": {n: 0.5 for n in order[:k]}} for k in (1, 2, 3, 4, 6, 8, 10, 12, 15, 20) if k <= len(order)]
    json.dump(combos, open(out, "w")); print("candidates", len(order), order[:10])
else:
    cf, sf, fin, fout, usedf = sys.argv[2:7]
    combos = {c["tag"]: c["w"] for c in json.load(open(cf))}; sc = json.load(open(sf)); b = sc.pop("BASE")
    best = max(sc, key=sc.get); print("best combo", best, round(sc[best], 4), "base", round(b, 4))
    if sc[best] < b + 0.004: print("NO_GAIN"); sys.exit(3)
    F = np.load(fin); V = F["Vfit"].copy(); used = json.load(open(usedf)) if os.path.exists(usedf) else {}
    groups = {}
    for c in ["nose", "mouth", "chin", "cheek", "head", "eyes", "eyebrows", "forehead"]:
        for p in sorted(glob.glob(f"{TD}/{c}/*.target.gz")):
            n = os.path.basename(p)[:-10]; groups.setdefault(n[2:] if n[:2] in ("l-", "r-") else n, []).append(p)
    for t, amt in combos[best].items():
        for p in groups[t]:
            a = np.loadtxt(gzip.open(p), ndmin=2); V[a[:, 0].astype(int)] += amt * np.stack([a[:, 1], -a[:, 3], a[:, 2]], 1) * 0.1
        used[t] = used.get(t, 0) + amt
    out = {k: F[k] for k in F.files}; out["Vfit"] = V; np.savez(fout, **out); json.dump(used, open(usedf, "w"))
    print("GAIN", round(sc[best] - b, 4), "applied", combos[best])
