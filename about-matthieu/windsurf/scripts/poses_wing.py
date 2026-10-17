# Wing foil poses and clips (exec'd by windsurf_build.py with MODE=wing)
# Rider strapless on the board centreline, wing held at arm's length to leeward by its two strut handles.
def P(**kw):
    base = dict(heel=-3.0, pitch=0.0, heave=0.0, spin=0.0, rlean=-38.0, rake=4.0, sheet=14.0, flip=0.0, flutter=0.5,
                rigpos=(0.40, 0.50, 1.62), hips=(-0.22, -0.20, 0.90), blean=-16.0, yaw=90.0,
                LF=(-0.05, 0.08, D(0.08) + 0.06), RF=(-0.03, -0.46, D(-0.46) + 0.06),
                LH=("hdl", 0.35, -1), RH=("hdl", 0.95, -1),
                pLL=(0.9, 0.35, -0.2), pRL=(0.9, -0.2, -0.2), pLA=(-0.15, 0.6, -0.5), pRA=(-0.15, -0.6, -0.5),
                neck=25.0, head=28.0, LFa=40.0, RFa=5.0)
    base.update(kw)
    x, y, z = base["hips"]; base["hips"] = (x, y, z - 0.06)     # knees bent: the rider (1.78 m) rides lower than the keys say
    return base
RIDE0 = P()

def ride_frame(f, n):
    """Flying: slow wing sway, a few pumps of the legs, light board pitch."""
    t = (f - 1) / n
    pump = math.sin(2 * math.pi * 2 * t); sway = math.sin(2 * math.pi * t)
    ex = dict(pitch=0.8 * pump, heel=0.6 * sway, rlean=3.0 * sway, sheet=2.0 * pump, rake=1.5 * pump,
              blean=-1.5 * sway, hips=(-0.015 * sway, 0.0, -0.035 * (1 + pump) / 2), flutter=0.5 * math.sin(2 * math.pi * 6 * t))
    apply_pose(RIDE0, RIDE0, 0, ex)

def W(p, **kw):
    q = dict(p); q.update(kw); return q

# Wing over the head: in the middle of a tack or a jibe the wing is held flat above the rider (canopy up, like an
# umbrella, leading edge to the wind), never through the body. At the flat point the canopy has no camber (flip 0.5),
# so tilting it -90 or +90 gives the same shape: the key swaps there from one tack to the other in a single frame.
# The hands hold the middle of the strut, close together: swapping sides there moves them a few centimetres, not from
# one handle to the other.
SYM_LEGS = dict(LF=(0.11, -0.17, D(-0.17) + 0.06), RF=(-0.11, -0.17, D(-0.17) + 0.06), pLL=(-0.3, 0.9, -0.2), pRL=(0.3, 0.9, -0.2))
OVER = P(heel=0, rlean=-90, rake=0, sheet=0, flip=0.5, rigpos=(0.0, 0.62, 2.10), hips=(0.0, -0.17, 0.90), blean=0, yaw=180,
         neck=0, head=-12, pLA=(-0.6, -0.15, -0.5), pRA=(0.6, -0.15, -0.5), LH=("hdl", 0.58, -1), RH=("hdl", 0.72, -1), **SYM_LEGS)

# --- tack: carve up into the wind, lift the wing over the head, swap feet facing the bow, wing down on the new side
TK1 = P(heel=0, rlean=-62, rake=-4, sheet=6, flip=0.2, rigpos=(0.20, 0.52, 1.98), hips=(-0.10, -0.18, 0.86), blean=-6, yaw=128,
        LF=(-0.02, 0.06, D(0.06) + 0.06), RF=(-0.04, -0.36, D(-0.36) + 0.06), neck=10, head=5, **poles(128))
TACK = [(1, RIDE0), (16, TK1), (34, OVER), (35, mirror(OVER, 0, 1)), (54, mirror(TK1, 0, 1)), (72, mirror(RIDE0, 0, 1))]

# --- jibe: carve downwind on the leeward rail, wing up over the head while the board turns under it, new side
JB1 = P(heel=12, rlean=-60, rake=-6, sheet=4, flip=0.18, rigpos=(0.22, 0.48, 1.95), hips=(-0.08, -0.20, 0.80), blean=-8, yaw=118,
        RF=(0.05, -0.40, D(-0.40) + 0.06), neck=30, head=25, **poles(118))
OVERJ = W(OVER, heel=0)          # flat at the swap: a heel there would flip sign in one frame
JIBE = [(1, RIDE0), (14, JB1), (29, OVERJ), (30, mirror(OVERJ, 0, 1)), (45, mirror(JB1, 0, 1)), (60, mirror(RIDE0, 0, 1))]

# --- held poses: tuck (jumps, loops: wing pulled in over the head), one-footer, one-hander, both, carve
TUCK = P(heel=-10, pitch=6, rlean=-22, rake=-6, sheet=8, rigpos=(0.22, 0.40, 1.82), hips=(-0.18, -0.20, 0.72), blean=-10, neck=20, head=20)
ONEF = P(heel=-12, pitch=4, rigpos=(0.30, 0.45, 1.75), hips=(-0.20, -0.18, 0.86), blean=-14,
         RF=(-0.75, -0.55, 1.00), pRL=(-0.2, -0.9, 0.7), neck=20, head=25)
FREE_HAND = ("free", (-0.75, -0.55, 2.10))
ONEH = P(heel=-10, pitch=4, rigpos=(0.30, 0.50, 1.70), hips=(-0.20, -0.18, 0.86), blean=-14, RH=FREE_HAND, pRA=(-0.2, -0.6, 0.5), neck=20, head=25)
ONEFH = W(ONEF, RH=FREE_HAND, pRA=(-0.2, -0.6, 0.5))
CARVE = P(heel=14, rlean=-30, sheet=10, rigpos=(0.32, 0.45, 1.55), hips=(-0.10, -0.20, 0.76), blean=-10, yaw=100,
          RF=(0.04, -0.44, D(-0.44) + 0.06), neck=30, head=35, **poles(100))

CROUCH = P(pitch=6, rlean=-30, sheet=10, rigpos=(0.36, 0.48, 1.45), hips=(-0.18, -0.20, 0.68), blean=-12, neck=20, head=20)
# pumping to take off: the wing is lifted high and forward, then pulled down and back towards the hip while the legs
# compress (the board pushed into the water), then the legs extend and the wing goes up again
PUMP_UP = P(heel=-2, pitch=-1, rlean=-28, rake=10, sheet=4, rigpos=(0.28, 0.62, 1.98), hips=(-0.20, -0.20, 0.95), blean=-8,
            neck=22, head=24)
PUMP_DOWN = P(heel=-5, pitch=3, rlean=-50, rake=-8, sheet=24, rigpos=(0.46, 0.28, 1.38), hips=(-0.26, -0.20, 0.68), blean=-26,
              neck=30, head=30)
PUMP = [(1, PUMP_UP), (11, PUMP_DOWN), (25, PUMP_UP)]
OPEN_HANDS = {"OneHand": ("Right",), "OneFootHand": ("Right",)}
CLIPS = [("Ride", FR, ride_frame), ("Tack", 72, keyed(TACK)), ("Jibe", 60, keyed(JIBE)),
         ("Tuck", 2, keyed([(1, TUCK), (2, TUCK)])), ("OneFoot", 2, keyed([(1, ONEF), (2, ONEF)])),
         ("OneHand", 2, keyed([(1, ONEH), (2, ONEH)])), ("OneFootHand", 2, keyed([(1, ONEFH), (2, ONEFH)])),
         ("Carve", 2, keyed([(1, CARVE), (2, CARVE)])), ("Crouch", 2, keyed([(1, CROUCH), (2, CROUCH)])),
         ("Pump", 24, keyed(PUMP, cyclic=True))]
ONLY = os.environ.get("CLIPS")
if ONLY: CLIPS = [c for c in CLIPS if c[0] in ONLY.split(",")]
