# usage: VIEW=wind CLIPSHOTS="..." sh build/sheet.sh out.jpg
rm -rf shots_clips; mkdir -p shots_clips
../tools/blender-4.5.14-linux-x64/blender -b ${BLEND:-windsurfer_av2.blend} --python build/clip_sheet.py -- $PWD/shots_clips/c > build/log_sheet.txt 2>&1
../tools/venv/bin/python - "$1" <<'PY'
import cv2, glob, numpy as np, sys
fs = sorted(glob.glob('shots_clips/c_*.png')); ims = [cv2.imread(f) for f in fs]
for im, f in zip(ims, fs): cv2.putText(im, f.split('c_')[1][:-4], (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,0,0), 2)
cols = 6; rows = (len(ims) + cols - 1) // cols
ims += [np.full_like(ims[0], 255)] * (rows * cols - len(ims))
sheet = np.vstack([np.hstack(ims[r*cols:(r+1)*cols]) for r in range(rows)])
cv2.imwrite(sys.argv[1], cv2.resize(sheet, None, fx=0.75, fy=0.75), [cv2.IMWRITE_JPEG_QUALITY, 85])
PY
