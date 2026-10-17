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

On an Avaturn avatar, `scripts/rider_shape.py` first gives the rider Matthieu's build, from the photos on the water:
1.78 m, broader shoulders, thicker arms, forearms, chest and thighs, a slim waist (knobs `RIDER_H`, `BULK`, `SHOULDERS`).
Key poses are interpolated with a Catmull-Rom spline (the motion flows through each key instead of stopping on it); feet
step from key to key, lifting heel first. When a grip is out of reach, the gear comes to the hands (`RIG_GIVE`: the wing
is held freely, the windsurf rig is pulled to windward) and the body moves the rest of the way. Each model also has a
`Pump` clip (one stroke), scrubbed by the game while pumping.

Pose knobs (environment): `HZ` hip height above the deck (0.88 m), `HX` hip offset to windward, `POLE_LEG`, `POLE_ARM`.
The paths in the scripts point to the working directories used to build it; adjust them for another machine.

Other generated assets:

- `scripts/sail_print.py` (Python + Pillow) paints `textures/sail_print.png`, the sail body in the E_Pace 2025 look (C20 colours,
  no logos), mapped on the sail's (u, v) coordinates by `gear_windsurf.py`. Run it before the build when the design changes.
- `scripts/head_build.py` (Blender, same avatar and build) exports `site/public/models/head.glb`: Matthieu's head and
  shoulders in a wetsuit collar, the pilot in the Tintin sharks' cockpit:
  `AVATAR_GLB=avatar.glb blender -b --python scripts/head_build.py -- head.glb`
- `scripts/app_icons.py` (Pillow) draws the app icons in `site/public/icons/`.

Ocearo UI (own boats "Windsurf" and "Wing foil", `public/boats/<windsurf|wingfoil>/assets/rider.glb`, under 1 MB each):
the Ride clip only, no facial expressions, 512 px textures, Draco meshes:

    NOFACE=1 CLIPS=Ride TEXMAX=512 DRACO=1 AVATAR_GLB=avatar.glb blender -b --python scripts/windsurf_build.py -- windsurf.glb
    MODE=wing NOFACE=1 CLIPS=Ride TEXMAX=512 DRACO=1 AVATAR_GLB=avatar.glb blender -b --python scripts/windsurf_build.py -- wingfoil.glb
