#!/bin/bash
# overnight coordinate ascent on clay identity over MakeHuman face targets
cd "$(dirname "$0")"; B=../tools/blender-4.5.14-linux-x64/blender; PY=../tools/venv/bin/python
S=/tmp/claude-1004/-home-claude-workspace/91f33fda-e54d-5b93-92fc-a56b9ef77a9f/scratchpad
cur=${1:-H0}; k=${cur#H}
for r in $(seq 1 ${2:-8}); do
  echo "=== round $r from $cur"
  [ -f ${cur}_avatar.blend ] || FIT=loop$cur.npz ./pipeline.sh $cur 2>&1 | grep -E "Traceback"
  rm -rf $S/sw_$cur $S/sc_$cur; $B -b ${cur}_avatar.blend --python sweep.py -- loop$cur.npz $S/sw_$cur 0.5 > /dev/null 2>&1
  $PY sweep_score.py $S/sw_$cur 2>&1 | grep -E "^BASE" 
  $PY ascent.py combos $S/sw_$cur $S/combos_$cur.json used.json
  $B -b ${cur}_avatar.blend --python sweep.py -- loop$cur.npz $S/sc_$cur 0.5 $S/combos_$cur.json > /dev/null 2>&1
  $PY sweep_score.py $S/sc_$cur 2>&1 | grep -E "^(BASE|top)" | head -4
  nxt=H$((k+1))
  $PY ascent.py bake $S/combos_$cur.json $S/sc_$cur/scores.json loop$cur.npz loop$nxt.npz used.json || { echo "STOP no gain"; break; }
  rm -rf $S/sw_$cur; rm -f ${cur}_fit.blend ${cur}_gl.blend
  [ "$cur" != "H0" ] && rm -f ${cur}_avatar.blend
  cur=$nxt; k=$((k+1)); echo "$cur" > ascent_cur.txt
done
echo "ASCENT DONE $cur"
