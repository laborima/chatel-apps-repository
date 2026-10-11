#!/bin/bash
cd "$(dirname "$0")"; B=../tools/blender-4.5.14-linux-x64/blender; PY=../tools/venv/bin/python
ALL=front,front_close,three_quarter$(for i in $(seq -w 1 20); do printf ",p%s" $i; done)
V6=front,front_close,three_quarter,p03,p09,p19
for k in $(seq ${1:-0} $((${2:-3} - 1))); do
  echo "=== iteration $k"
  FIT=loopG$k.npz ./pipeline.sh G$k 2>&1 | grep -E "Error|Trace"
  $B -b G${k}_avatar.blend --python render_views.py -- loopG$k.npz $PWD/../shots/G$k $V6 2>&1 | grep -E "Error|Trace"
  $PY identity.py $(for v in ${V6//,/ }; do echo ../shots/G${k}_$v.png; done) 2>&1 | grep "vs photos" | awk '{s+=$5} END {print "IDENTITY MEAN", s/NR}'
  ./clay_id.sh G${k}_avatar.blend loopG$k.npz G$k 2>&1 | grep CLAY
  GENERIC=1 $B -b G${k}_avatar.blend --python render_views.py -- loopG$k.npz $PWD/../shots/Gg$k $ALL 2>&1 | grep -E "Error|Trace"
  NOSIL=1 $PY fine_fit.py loopG$k.npz ../shots/Gg$k loopG$((k+1)).npz 1.0 2>&1 | grep -E "per view|mean RMS|predicted|fine disp|no face|profile contour|Error|Trace"
  rm -f G${k}_gl.blend G${k}_fit.blend
done
