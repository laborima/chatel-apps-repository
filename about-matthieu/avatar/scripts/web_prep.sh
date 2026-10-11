#!/bin/bash
# web_prep.sh <blend> <tag> [renderprefix]: light GLB -> base64 txt + comparison jpg in ../web_live
cd "$(dirname "$0")"; B=../tools/blender-4.5.14-linux-x64/blender
WEB=1 CLAY=${CLAY:-} $B -b $1 --python export.py -- $PWD/../web_live 2>&1 | grep -E "EXPORTED|Error"
base64 -w0 ../web_live/avatar_web.glb > ../web_live/$2.txt
../tools/venv/bin/python - "$2" "${3:-../shots/$2}" <<'PY'
import cv2, numpy as np, sys
tag, pre = sys.argv[1], sys.argv[2]
rows = []
for v, ph in (("front_close", "../photos/front_close.jpg"), ("three_quarter", "../photos/three_quarter.jpg")):
    r = cv2.imread(f"{pre}_{v}.png"); p = cv2.resize(cv2.imread(ph), (r.shape[1], r.shape[0]))
    rows.append(np.hstack([p[120:900, 100:770], r[120:900, 100:770]]))
cv2.imwrite(f"../web_live/cmp_{tag}.jpg", cv2.resize(np.vstack(rows), None, fx=0.6, fy=0.6), [cv2.IMWRITE_JPEG_QUALITY, 85])
PY
ls -la ../web_live/$2.txt ../web_live/cmp_$2.jpg | awk '{print $5, $9}'
