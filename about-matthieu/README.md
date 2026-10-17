# about-matthieu

Personal "about the author" page for **Matthieu Laborie** (author of
[Ocearo](https://github.com/laborima/ocearo-ui)), with a small windsurfing game behind
its main button. The page is meant to be linked from the "About" screen of the apps.

| Folder | What it is |
|---|---|
| [`site/`](site/) | The page and the game: Vite + React + three.js / react-three-fiber. The sea and sky come from Ocearo UI. |
| [`windsurf/`](windsurf/) | Blender scripts that build the windsurfer model (`site/public/models/windsurfer.glb`). |
| [`avatar/`](avatar/) | The pipeline that builds the 3D avatar from photos (MakeHuman/MPFB in Blender). |
| [`docs/`](docs/) | The overall plan and notes. |

## Run the site

```bash
cd site
npm install
npm run dev          # http://localhost:5173
npm run build        # static files in site/dist (relative paths: works from any sub-folder)
```

The game opens at `#windsurf`. Keys: ← / → (or Q / D) to bear away and head up; on a phone, the two round buttons (see Play below for the figures).

## The windsurfer model

One glTF (`windsurfer.glb`, ~10 MB), real-world metres, bow towards −Z, Y up, a single looping animation
**`Ride`** (board heave and heel, rig sway, sail leech flutter, the rider's knees absorbing the chop).
Root node: `Windsurfer`. The rider stands on the port rail (wind from port); mirror the model on
starboard tack. It is built for a later drop-in replacement of the Windsurf model in Ocearo UI.

- Board: JP Australia Magic Ride 119 (241 × 74 cm, 119 L, Ride 38 fin)
- Sail: Duotone E_Pace 6.2 (luff 442 cm, boom 190 cm, 6 battens, 430 mast)
- Brand logos are not reproduced.

## Privacy

Source photos of the face and body are **not** in this repository (`.gitignore`). The avatar texture
inside the model is derived from them.

## Licence

Code: Apache-2.0 (as Ocearo UI). Texts, photos and the avatar: © Matthieu Laborie, all rights reserved.

## Play

Live: https://laborima.github.io/ (the game is at `#windsurf`), built from this folder by the workflow of
[laborima/laborima.github.io](https://github.com/laborima/laborima.github.io), which picks up changes pushed to `master`
within the hour. The old address, /chatel-apps-repository/about-matthieu/, redirects there.

Controls: four action buttons (touch, keyboard Space / V / E / C, or ✕ □ ○ △ on a PlayStation / standard gamepad) plus
steering (⟲ ⟳, arrows, left stick). On the water, tapping a button once, twice or three times picks the figure:
Virer = tack / helitack / flaka, Empanner = jibe / duck jibe / air jibe, 360 = carve / vulcan / spock. Below planing the
jump button pumps (tap in rhythm or hold it): the wing foil needs three good strokes to take off. In the air the buttons
change name: Forward (one more loop per tap: a double tap on Saut is a forward loop), Back, Table (held) and Lâcher
(one tap a foot, two a foot and a hand). The in-game "Figures" panel lists them all.
