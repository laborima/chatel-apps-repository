#!/bin/bash
# clay_id.sh <avatar.blend> <fit.npz> <tag>: identity of the shape alone (uniform skin), 8 views
cd "$(dirname "$0")"; B=../tools/blender-4.5.14-linux-x64/blender; V=front,front_close,three_quarter,p01,p03,p09,p17,p19
CLAY=1 $B -b $1 --python render_views.py -- $2 $PWD/../shots/C_$3 $V 2>&1 | grep -E "Error|Trace"
../tools/venv/bin/python identity.py $(for v in ${V//,/ }; do echo ../shots/C_${3}_$v.png; done) 2>&1 | grep "vs photos" | awk '{s+=$5; printf "%s ", $5} END {print "| CLAY IDENTITY", s/NR}'
