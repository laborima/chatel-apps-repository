# Putting the windsurfer into Ocearo UI

Today `ocearo-ui` draws the "Windsurf" boat from `public/boats/windsurf/assets/scene-transformed.glb`
(a static, Draco-compressed Sketchfab model, CC-BY) inside `GltfBoatMeshes` (`app/components/3dview/SailBoat3D.js`).

Planned change:
1. Copy `site/public/models/windsurfer.glb` to `public/boats/windsurf/assets/` (or Draco-compress it with `gltf-transform`).
2. Add a procedural-style component (like `boats/racer/RacerBoat.js`) that loads the glTF with `useGLTF`, plays the `Ride` animation with `useAnimations`, mirrors it on starboard tack (from `windData.awa`), and scales the animation speed with the boat speed.
3. Register it in `PROCEDURAL_BOATS` under `windsurf`, keep the boat entry `"Windsurf"` in `public/boats/boats.json`.
4. Units: Ocearo draws the own boat at `BOAT_SCALE = 0.7` scene units per metre; the model is in metres.
