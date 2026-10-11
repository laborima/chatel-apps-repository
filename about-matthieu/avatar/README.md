# Avatar pipeline

Builds a rigged, talking 3D avatar from photos with Blender 4.5 + MPFB (MakeHuman), MediaPipe and ArcFace.
Main steps (see `scripts/pipeline.sh`): base human → head fit to the photos (`fit2.py`, `fine_fit.py`, `ear_fit.py`)
→ photo texture (`bake.py`) → hair, eyes, materials → export (`export.py`, TalkingHead-compatible: Mixamo-like rig,
52 ARKit blendshapes, 15 Oculus visemes).

Shape optimisation on likeness: `sweep.py` + `ascent.sh` (coordinate ascent on MakeHuman face targets, scored by
ArcFace on untextured renders, `clay_id.sh`). `scan_wrap.py` wraps the head onto a 3D scan (work in progress).
`experiments/` keeps the earlier attempts. Photos are not in the repository.
