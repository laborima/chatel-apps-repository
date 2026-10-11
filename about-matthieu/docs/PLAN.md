# Plan

Status of the overall plan as understood so far (to be replaced by Matthieu's own drawing).

1. **About page** (`site/`): who I am, my GitHub projects, achievements. Linked from the apps' "About" screen to credit the author.
2. **Windsurf mini-game** behind the main button: my avatar on my board (JP Magic Ride) with my sail (Duotone E_Pace 6.2), on the Ocearo sea.
3. **Windsurfer model** (`windsurf/`): animated (sail moving, knees bending), real scale, reusable.
4. **Back into Ocearo UI**: replace the current Windsurf glTF in `ocearo-ui` by this model (see `docs/ocearo-integration.md`).
5. **Better avatar**: a phone 3D scan (RealityScan / Polycam), wrapped with `avatar/scripts/scan_wrap.py`, then the windsurfer rebuilt with it.

## Open points
- Professional background: a link to the LinkedIn profile (set `linkedin` in `site/src/data/showcase.json`).
- Projects shown on the page: `site/src/data/showcase.json` (pictures in `site/public/img/projects/`).
- Hands do not close on the boom yet; knees splay a little seen from behind; hair reads slightly long in three.js.
- Game: no buoys / race yet, no sound, French only.
