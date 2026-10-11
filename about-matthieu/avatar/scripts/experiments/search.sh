#!/bin/bash
# Greedy overnight search on shape: from the best fit, try candidate correction steps, keep only clay-identity improvements.
cd "$(dirname "$0")"; B=../tools/blender-4.5.14-linux-x64/blender; PY=../tools/venv/bin/python
ALL=front,front_close,three_quarter$(for i in $(seq -w 1 20); do printf ",p%s" $i; done)
BEST=${1:-G3}; BESTS=${2:-0.2244}; n=0
score() { ./clay_id.sh $1_avatar.blend loop$1.npz $1 2>&1 | grep CLAY | awk '{print $NF}'; }
while [ $n -lt ${3:-12} ]; do
  n=$((n+1)); echo "=== round $n  best=$BEST ($BESTS)"
  [ -f ../shots/Gg_$BEST"_front.png" ] || GENERIC=1 $B -b ${BEST}_avatar.blend --python render_views.py -- loop$BEST.npz $PWD/../shots/Gg_$BEST $ALL 2>&1 | grep -E "Traceback"
  improved=0
  for cand in "j0.4:0.4:1.0" "j0:0.0:1.0" "j0.4s:0.4:0.5" "j1:1.0:2.0"; do
    IFS=: read tag jw lam <<< "$cand"; C=S${n}_$tag
    JAWW=$jw NOSIL=1 $PY fine_fit.py loop$BEST.npz ../shots/Gg_$BEST loop$C.npz $lam 2>&1 | grep -E "mean RMS|profile contour" | tr '\n' ' '; echo
    FIT=loop$C.npz ./pipeline.sh $C 2>&1 | grep -E "Traceback"
    s=$(score $C); echo "  $C clay=$s"
    rm -f ${C}_fit.blend ${C}_gl.blend
    if $PY -c "import sys; sys.exit(0 if float('$s') > float('$BESTS') + 0.003 else 1)"; then
      echo "  ACCEPT $C ($BESTS -> $s)"; BEST=$C; BESTS=$s; improved=1; break
    else rm -f ${C}_avatar.blend; fi
  done
  echo "$BEST $BESTS" > search_best.txt
  [ $improved -eq 1 ] || { echo "no candidate improved; stop"; break; }
done
echo "FINAL $BEST $BESTS"
