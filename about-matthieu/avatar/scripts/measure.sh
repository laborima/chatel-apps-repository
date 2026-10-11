#!/bin/bash
# measure.sh <fit.npz> <tag> : build avatar, render 6 views, ArcFace mean
cd "$(dirname "$0")"; B=../tools/blender-4.5.14-linux-x64/blender; PY=../tools/venv/bin/python; V6=front,front_close,three_quarter,p03,p09,p19
FIT=$1 ./pipeline.sh $2 2>&1 | grep -E "Error|Trace"
$B -b ${2}_avatar.blend --python render_views.py -- $1 $PWD/../shots/$2 $V6 2>&1 | grep -E "Error|Trace"
$PY identity.py $(for v in ${V6//,/ }; do echo ../shots/${2}_$v.png; done) 2>&1 | grep "vs photos" | awk '{s+=$5; printf "%s %s | ", $1, $5} END {print "\nIDENTITY MEAN", s/NR}'
rm -f ${2}_gl.blend ${2}_fit.blend
