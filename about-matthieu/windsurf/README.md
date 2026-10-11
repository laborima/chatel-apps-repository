# Windsurfer model

`scripts/windsurf_build.py` (Blender 4.5) builds board, rig and rider and exports `site/public/models/windsurfer.glb`.

```bash
# 1. wetsuit painted into the avatar skin texture
python scripts/wetsuit_tex.py
# 2. model + animation (input: the avatar .blend produced by avatar/)
blender -b H7_keep.blend --python scripts/windsurf_build.py -- out/windsurfer.glb
# or from an Avaturn (Mixamo-named) avatar: the outfit is dyed into a black wetsuit
AVATAR_GLB=path/to/avaturn.glb blender -b --python scripts/windsurf_build.py -- out/windsurfer.glb
# 3. preview renders
blender -b out/windsurfer.blend --python scripts/preview.py -- out/prev
```

Pose knobs (environment): `HZ` hip height above the deck (0.88 m), `HX` hip offset to windward, `POLE_LEG`, `POLE_ARM`.
The paths in the scripts point to the working directories used to build it; adjust them for another machine.
