#!/bin/bash
cd "$(dirname "$0")"; B=../tools/blender-4.5.14-linux-x64/blender; PY=../tools/venv/bin/python
V6=front,front_close,three_quarter,p03,p09,p19
for spec in "loop2.npz:L2nc" "loop0.npz:L0nc"; do
  fit=${spec%%:*}; tag=${spec##*:}
  FIT=$fit ./pipeline.sh $tag 2>&1 | grep -E "Error|Trace"
  $B -b ${tag}_avatar.blend --python render_views.py -- $fit $PWD/../shots/$tag $V6 2>&1 | grep -E "Error|Trace"
  echo "== $tag"; $PY identity.py $(for v in ${V6//,/ }; do echo ../shots/${tag}_$v.png; done) 2>&1 | grep "vs photos" | awk '{s+=$5} END {print "IDENTITY MEAN", s/NR}'
  rm -f ${tag}_gl.blend ${tag}_fit.blend
done
