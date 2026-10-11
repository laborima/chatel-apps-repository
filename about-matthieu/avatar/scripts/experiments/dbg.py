import os, sys, numpy as np
os.environ["RC"] = "1"; sys.argv = ["fit2.py", "R"]
src = open("fit2.py").read().split("nW, nC = K, 3 * len(C)")[0]
exec(src)
f0 = residuals(x); c0 = 0.5 * (f0 ** 2).sum(); print("cost", c0)
# finite-diff gradient on landmark-only parts
g = np.zeros(len(x)); h = 1e-4
for i in range(0, len(x)):
    xx = x.copy(); xx[i] += h; g[i] = (0.5 * (residuals(xx) ** 2).sum() - c0) / h
print("grad norm", np.linalg.norm(g), "top", np.argsort(-np.abs(g))[:10], np.sort(-np.abs(g))[:5])
for a in [1e-8, 1e-7, 1e-6, 1e-5]:
    xx = x - a * g; print(a, 0.5 * (residuals(xx) ** 2).sum())
