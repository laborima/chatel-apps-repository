#!/bin/bash
# Full avatar build: base human -> fitted head -> texture -> materials -> glasses -> hair [-> export]
# usage: FIT=fit3_result.npz EXPORT=1 ./pipeline.sh v13
set -e
cd "$(dirname "$0")"
B=../tools/blender-4.5.14-linux-x64/blender; PY=../tools/venv/bin/python; V=${1:-v7}; FIT=${FIT:-fit2_result.npz}
q() { grep -E "SAVED|Error|Traceback|BASEMESH|BODY|drift" || true; }
$B -b --python build_base.py -- $PWD/${V}_base.blend 2>&1 | q
$B -b ${V}_base.blend --python apply_fit.py -- $FIT $PWD/${V}_fit.blend 2>&1 | q
$PY bake.py $FIT 2>&1 | grep -E "DONE|delight|Error|Trace"
$B -b ${V}_fit.blend --python materials.py -- $PWD/${V}_mat.blend 2>&1 | q
$B -b ${V}_mat.blend --python glasses.py -- $FIT $PWD/${V}_gl.blend 2>&1 | q
FIT=$FIT $PY hair_shells.py | tail -1
$B -b ${V}_gl.blend --python hair_install_shells.py -- $PWD/${V}_avatar.blend 2>&1 | q
rm -f ${V}_base.blend ${V}_mat.blend
if [ -n "$EXPORT" ]; then $B -b ${V}_avatar.blend --python export.py -- $PWD/../export 2>&1 | grep -E "EXPORTED|Error|Trace"; fi
