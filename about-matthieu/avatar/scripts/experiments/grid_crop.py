import cv2, sys
name, x0, y0, x1, y1, step, sc = sys.argv[1], *map(int, sys.argv[2:7]), float(sys.argv[7])
img = cv2.imread(f"../photos/{name}.jpg")[y0:y1, x0:x1].copy()
for y in range((y0 // step + 1) * step, y1, step):
    cv2.line(img, (0, y - y0), (x1 - x0, y - y0), (255, 0, 0), 1); cv2.putText(img, str(y), (3, y - y0 - 3), 0, 0.9, (255, 0, 0), 2)
for x in range((x0 // step + 1) * step, x1, step):
    cv2.line(img, (x - x0, 0), (x - x0, y1 - y0), (0, 150, 0), 1); cv2.putText(img, str(x), (x - x0 + 3, 25), 0, 0.9, (0, 150, 0), 2)
cv2.imwrite(sys.argv[8], cv2.resize(img, None, fx=sc, fy=sc))
