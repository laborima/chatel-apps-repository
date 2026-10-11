import cv2, numpy as np, sys
pre = sys.argv[1]; views = sys.argv[2].split(",")
rows = []
for v in views:
    ph = cv2.resize(cv2.imread(f"../photos/{v}.jpg"), (868, 1156)); rd = cv2.imread(f"../shots/{pre}_{v}.png")
    rows.append(np.hstack([ph[150:950, 100:768], rd[150:950, 100:768]]))
cv2.imwrite(f"../shots/{pre}_pc.jpg", cv2.resize(np.hstack(rows), None, fx=0.6, fy=0.6))
