#!/bin/bash
# usage: body_iter.sh '<json targets>' tag
cd "$(dirname "$0")"; B=../tools/blender-4.5.14-linux-x64/blender; PY=../tools/venv/bin/python; S=/tmp/claude-1004/-home-claude-workspace/91f33fda-e54d-5b93-92fc-a56b9ef77a9f/scratchpad
echo "$1" > body_targets.json
$B -b --python build_base.py -- $PWD/bi_base.blend 2>&1 | grep -E "Error|Trace"
$B -b $PWD/bi_base.blend --python apply_fit.py -- fine_test.npz $PWD/bi_fit.blend 2>&1 | grep -E "Error|Trace"
$B -b $PWD/bi_fit.blend --python materials.py -- $PWD/bi_mat.blend 2>&1 | grep -E "Error|Trace"
$B -b $PWD/bi_mat.blend --python render_bodycam.py -- fit_tmp_pcams.npz $S/bi_$2 p01,p03,p09 2>&1 | grep -E "Error|Trace"
$PY body_widths.py $S/bi_$2 p01,p03,p09 2>&1 | grep mean
$PY body_compare.py $S/bi_$2 p01,p03,p09 2>&1 | grep -E "^p0" | sed 's/  hips.*neck_y/  neck_y/'
