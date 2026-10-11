#!/bin/bash
# analysis-by-synthesis loop: loop$k.npz -> avatar -> renders -> fine_fit -> loop$((k+1)).npz
cd "$(dirname "$0")"; B=../tools/blender-4.5.14-linux-x64/blender; PY=../tools/venv/bin/python
VIEWS=front,front_close,three_quarter,p01,p03,p04,p05,p06,p09,p12,p17,p18,p19
for k in $(seq ${1:-0} $((${2:-3} - 1))); do
  echo "=== iteration $k"
  FIT=loop$k.npz ./pipeline.sh L$k 2>&1 | grep -E "Error|Trace|head drift"
  $B -b L${k}_avatar.blend --python render_views.py -- loop$k.npz $PWD/../shots/L$k $VIEWS 2>&1 | grep -E "Error|Trace"
  $PY identity.py ../shots/L${k}_front.png ../shots/L${k}_front_close.png ../shots/L${k}_three_quarter.png ../shots/L${k}_p03.png ../shots/L${k}_p09.png ../shots/L${k}_p19.png 2>&1 | grep "vs photos" | awk '{s+=$5; print} END {print "IDENTITY MEAN", s/NR}'
  $PY color_calib.py ../shots/L$k update 2>&1 | grep calib.json
  $PY fine_fit.py loop$k.npz ../shots/L$k loop$((k+1)).npz 1.0 2>&1 | grep -E "per view|mean RMS|predicted|silhouette|fine disp"
  rm -f L${k}_gl.blend
done
