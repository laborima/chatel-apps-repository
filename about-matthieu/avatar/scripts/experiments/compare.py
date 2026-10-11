import cv2, numpy as np, sys
pre = sys.argv[1]
def ph(n, box):  # crop photo (x0,y0,x1,y1)
    im = cv2.imread(f"../photos/{n}.jpg")[box[1]:box[3], box[0]:box[2]]; return cv2.resize(im, (480, 600))
def rd(n):
    im = cv2.imread(f"../shots/{pre}_{n}.png"); h, w = im.shape[:2]
    im = im[int(h*0.0):int(h*0.75), int(w*0.12):int(w*0.88)]; return cv2.resize(im, (480, 600))
top = np.hstack([ph("front", (500, 300, 1900+600, 2800)), ph("three_quarter", (650, 600, 3050, 3600)), ph("profile_right_side", (300, 700, 2900, 3950))])
bot = np.hstack([rd("head_front"), rd("head_34"), rd("head_right")])
cv2.imwrite(f"../shots/{pre}_compare.jpg", np.vstack([top, bot]))
