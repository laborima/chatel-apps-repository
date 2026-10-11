import numpy as np, cv2
for name, facing in [("profile_right_side", +1), ("profile_left_side", -1)]:
    img = cv2.imread(f"../photos/{name}.jpg")
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(float)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(float)
    # background: bright, low chroma
    chroma = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)
    fg = ((chroma > 9) | (lab[..., 0] < 170)).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    n, lab_cc, st, _ = cv2.connectedComponentsWithStats(fg)
    k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); fg = (lab_cc == k).astype(np.uint8)
    H, W = fg.shape
    cont = np.full(H, np.nan)
    for y in range(H):
        xs = np.where(fg[y])[0]
        if len(xs): cont[y] = xs.max() if facing > 0 else xs.min()
    np.save(f"sil_{name}.npy", cont); cv2.imwrite(f"sil_{name}.png", fg * 255)
    vis = img.copy()
    for y in range(0, H, 4):
        if np.isfinite(cont[y]): cv2.circle(vis, (int(cont[y]), y), 3, (0, 0, 255), -1)
    for y in range(0, H, 200):
        cv2.line(vis, (0, y), (W, y), (255, 0, 0), 2); cv2.putText(vis, str(y), (10, y - 5), 0, 2, (255, 0, 0), 4)
    for x in range(0, W, 200):
        cv2.line(vis, (x, 0), (x, H), (0, 160, 0), 2); cv2.putText(vis, str(x), (x + 5, 60), 0, 1.5, (0, 160, 0), 3)
    cv2.imwrite(f"../shots/sil_{name}.jpg", cv2.resize(vis, (W // 3, H // 3)))
