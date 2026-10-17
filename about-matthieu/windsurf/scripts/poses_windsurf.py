# Windsurf poses and clips (exec'd by windsurf_build.py: P, RIDE0, ride_frame, CLIPS, OPEN_HANDS)
def P(**kw):
    base = dict(heel=-6.0, pitch=0.0, heave=0.0, spin=0.0, rlean=-14.0, rake=14.6, sheet=12.0, flip=0.0, flutter=0.5,
                hips=(-0.72, -0.72, 0.85), blean=-33.0, yaw=90.0,
                LF=(-0.22, -0.47, D(-0.47) + 0.06), RF=(-0.20, -0.95, D(-0.95) + 0.06),
                LH=("boom", 0.15, -1), RH=("boom", 0.45, -1),
                pLL=(0.9, 0.35, -0.2), pRL=(0.9, -0.2, -0.2), pLA=(-0.15, 0.6, -0.5), pRA=(-0.15, -0.6, -0.5),   # elbows down and out
                neck=25.0, head=30.0, LFa=35.0, RFa=0.0)
    base.update(kw); return base
RIDE0 = P(pitch=1.2 * 0.337, heave=0.012 * 0.337)

def ride_frame(f, n):
    t = (f - 1) / n
    chop = 0.6 * math.sin(2 * math.pi * 2 * t) + 0.4 * math.sin(2 * math.pi * 3 * t + 1.0)
    sway = math.sin(2 * math.pi * t)
    ex = dict(pitch=1.2 * chop - RIDE0["pitch"], heel=0.8 * sway, heave=0.012 * chop - RIDE0["heave"],
              rlean=2.0 * sway, rake=1.0 * math.sin(2 * math.pi * t + 0.7) - 0.644, sheet=2.5 * sway,
              blean=-2 * sway, hips=(-0.02 * sway, 0, -0.045 * chop + 0.015), flutter=0.5 * math.sin(2 * math.pi * 8 * t))
    apply_pose(RIDE0, RIDE0, 0, ex)


# --- tack: luff up, front foot ahead of the mast, step round the front holding the mast, sail flips, new side
TK1 = P(heel=-2, rlean=-6, rake=24, sheet=4, flip=0.08, hips=(-0.42, -0.40, 0.93), blean=-12, yaw=55,
        LF=(-0.10, 0.34, D(0.34) + 0.06), RF=(-0.20, -0.42, D(-0.42) + 0.06),
        LH=("mast", 1.05), RH=("boom", 0.22, -1), neck=10, head=10, **poles(55))
TK2 = P(heel=0, rlean=0, rake=22, sheet=0, flip=0.5, hips=(0.0, 0.42, 0.97), blean=2, yaw=0,
        LF=(0.14, 0.50, D(0.50) + 0.06), RF=(-0.14, 0.44, D(0.44) + 0.06),
        LH=("mast", 1.12), RH=("mast", 1.30), neck=0, head=-5, **poles(0))
TACK = [(1, RIDE0), (20, TK1), (36, TK2), (52, mirror(TK1)), (72, mirror(RIDE0))]

# --- carve (planing) jibe: carve on the inside rail, foot change, release the sail: it rotates round the bow, catch the new side
JB1 = P(heel=10, rlean=-4, rake=10, sheet=4, flip=0.0, hips=(-0.30, -0.62, 0.78), blean=-6, yaw=100,
        RF=(0.04, -0.88, D(-0.88) + 0.06), LH=("boom", 0.15, -1), RH=("boom", 0.40, -1), neck=30, head=35, **poles(100))
JB2 = P(heel=6, rlean=0, rake=16, sheet=180, flip=0.5, hips=(0.0, -0.62, 0.88), blean=0, yaw=180,
        LF=(0.12, -0.52, D(-0.52) + 0.06), RF=(-0.10, -0.80, D(-0.80) + 0.06),
        LH=("mast", 1.25), RH=("mast", 1.02), neck=0, head=0, **poles(180))
JIBE = [(1, RIDE0), (18, JB1), (32, JB2), (46, mirror(JB1, 1)), (60, mirror(RIDE0, 1))]

# --- duck jibe: back hand slides to the clew, the rig is thrown aft over the head while the rider ducks under the boom
DK1 = P(heel=10, rlean=-22, rake=-6, sheet=2, flip=0.0, hips=(-0.30, -0.62, 0.74), blean=-4, yaw=110,
        RF=(0.04, -0.88, D(-0.88) + 0.06), LH=("boom", 0.30, -1), RH=("boom", 0.72, -1), neck=10, head=0, **poles(110))
DK2 = P(heel=8, rlean=0, rake=-30, sheet=0, flip=0.5, hips=(0.0, -0.62, 0.66), blean=18, yaw=180,
        LF=(0.14, -0.52, D(-0.52) + 0.06), RF=(-0.12, -0.84, D(-0.84) + 0.06),
        LH=("boom", 0.32, 1), RH=("boom", 0.80, -1), neck=-10, head=-15, **poles(180))
DUCK = [(1, RIDE0), (18, DK1), (32, DK2), (46, mirror(DK1)), (62, mirror(RIDE0))]

# --- held poses for the game to blend: tuck (jumps, loops), one-footer, deep carve
TUCK = P(heel=-14, pitch=6, rlean=-24, rake=8, sheet=6, hips=(-0.66, -0.70, 0.76), blean=-24, neck=20, head=20)   # rig pulled down to the rider
ONEF = P(heel=-18, pitch=4, rlean=-12, sheet=8, hips=(-0.55, -0.66, 0.84), blean=-20,
         RF=(-1.30, -1.15, 1.10), pRL=(-0.2, -0.9, 0.7), neck=20, head=25)         # back leg thrown out to windward, well clear of the board
# one-hander: back hand released, arm thrown up and back; and the one-foot one-hand combo
ONEH = P(heel=-16, pitch=4, rlean=-14, sheet=10, hips=(-0.58, -0.68, 0.84), blean=-22, RH=("free", (-1.35, -0.85, 2.25)),
         pRA=(-0.2, -0.6, 0.5), neck=20, head=25)
CARVE = P(heel=12, rlean=-8, rake=10, sheet=6, hips=(-0.52, -0.66, 0.76), blean=-20, yaw=100,
          RF=(0.02, -0.90, D(-0.90) + 0.06), LH=("boom", 0.15, -1), RH=("boom", 0.38, -1), neck=35, head=40, **poles(100))

# ---------------------------------------------------------------- freestyle
def W(p, **kw):
    q = dict(p); q.update(kw); return q
MAST_HANDS = dict(LH=("mast", 1.22), RH=("mast", 1.0))
# pop: crouch and pull the nose up
POP = P(heave=0.05, pitch=8, hips=(-0.55, -0.70, 0.74), blean=-18, sheet=18, neck=20, head=20)
# helitack: tack the board while the rig is back-winded and spun round the bow; the rider stays behind the mast
HL1 = W(JB1, heel=0, rlean=-2, rake=18, sheet=70, flip=0.2, hips=(-0.30, -0.55, 0.90), blean=-4, LH=("mast", 1.2), RH=("boom", 0.25, -1))
HL2 = W(JB2, heel=0, rake=20, sheet=180, flip=0.5, hips=(0.0, -0.55, 0.92))
HELI = [(1, RIDE0), (24, HL1), (40, HL2), (56, mirror(HL1, 1)), (80, mirror(RIDE0, 1))]
# air jibe: pop, jibe the rig and swap the feet in the air, land on the new tack
AJ1 = W(JB1, heave=0.75, heel=8, pitch=2, hips=(-0.30, -0.62, 0.74))
AJ2 = W(JB2, heave=0.65, heel=4, hips=(0.0, -0.62, 0.80))
AIRJIBE = [(1, RIDE0), (8, POP), (18, AJ1), (28, AJ2), (40, W(mirror(AJ1, 1), heave=0.1)), (54, mirror(RIDE0, 1))]
# vulcan: pop, the board spins 180 downwind in the air, lands tail first, rig flipped clew first, then pivots and sails away on the new tack
VA = P(heave=0.75, pitch=0, heel=-4, spin=-150, sheet=120, flip=0.3, hips=(-0.45, -0.70, 0.74), blean=-10, LH=("mast", 1.25), RH=("boom", 0.2, -1), neck=10, head=10)
VL = P(heave=0.0, pitch=-4, heel=0, spin=-195, rlean=0, rake=16, sheet=180, flip=0.5, hips=(-0.25, -0.68, 0.86), blean=-4, neck=0, head=0, **MAST_HANDS)
VS = P(heave=0.0, pitch=-2, heel=0, spin=-290, rlean=6, rake=16, sheet=280, flip=0.85, yaw=180, hips=(0.0, -0.70, 0.88), blean=-6,
       LF=(0.10, -0.55, D(-0.55) + 0.06), RF=(-0.08, -0.82, D(-0.82) + 0.06), LH=("boom", 0.25, 1), RH=("mast", 1.15), neck=0, head=0, **poles(180))
VULCAN = [(1, RIDE0), (8, POP), (20, VA), (28, VL), (44, VS), (60, W(mirror(RIDE0, 1), spin=-360))]
# spock: a vulcan, then a full turn pivoting on the nose (tail up), before sailing away
SP1 = W(VL, spin=-330, pitch=-14, heave=0.12, sheet=180)
SP2 = W(VL, spin=-480, pitch=-12, heave=0.12, sheet=180)
SPOCK = [(1, RIDE0), (8, POP), (20, VA), (28, VL), (42, SP1), (56, SP2), (70, W(VS, spin=-650)), (84, W(mirror(RIDE0, 1), spin=-720))]
# flaka: pop, spin upwind in the air (rig flagged over the tail), land backwards, keep turning and sail away on the same tack
FA = P(heave=0.75, pitch=0, heel=-8, spin=150, sheet=-70, flip=0.3, hips=(-0.45, -0.70, 0.74), blean=-10, LH=("mast", 1.25), RH=("boom", 0.2, -1), neck=10, head=10)
FL = P(heave=0.0, pitch=-6, heel=0, spin=200, rlean=0, rake=16, sheet=-180, flip=0.5, hips=(-0.25, -0.68, 0.86), blean=-4, neck=0, head=0, **MAST_HANDS)
FS = P(heave=0.0, pitch=-4, heel=-2, spin=290, rlean=-6, rake=16, sheet=-280, flip=0.2, hips=(-0.40, -0.70, 0.86), blean=-12, LH=("mast", 1.2), RH=("boom", 0.3, -1))
FLAKA = [(1, RIDE0), (8, POP), (20, FA), (30, FL), (46, FS), (64, W(RIDE0, spin=360, sheet=-348))]

ONEFH2 = W(ONEF, RH=("free", (-1.35, -0.85, 2.25)), pRA=(-0.2, -0.6, 0.5), blean=-22)
CROUCH = P(pitch=7, rlean=-20, rake=10, sheet=10, hips=(-0.62, -0.70, 0.66), blean=-22, neck=20, head=20)   # pop: legs loaded, tail pressed
# pumping (to get planing): sail pulled in while the body drops and hangs back, then pushed out as the legs extend
PUMP_IN = P(heel=-9, pitch=1.5, rlean=-18, rake=12, sheet=24, hips=(-0.82, -0.72, 0.74), blean=-40, neck=22, head=26)
PUMP_OUT = P(heel=-3, pitch=-0.5, rlean=-6, rake=16, sheet=2, hips=(-0.56, -0.70, 0.90), blean=-20, neck=26, head=30)
PUMP = [(1, PUMP_OUT), (11, PUMP_IN), (25, PUMP_OUT)]      # quick pull, slower recovery
OPEN_HANDS = {"OneHand": ("Right",), "OneFootHand": ("Right",)}
CLIPS = [("Ride", FR, ride_frame), ("Tack", 72, keyed(TACK)), ("Jibe", 60, keyed(JIBE)), ("Duck", 62, keyed(DUCK)),
         ("Tuck", 2, keyed([(1, TUCK), (2, TUCK)])), ("OneFoot", 2, keyed([(1, ONEF), (2, ONEF)])),
         ("Carve", 2, keyed([(1, CARVE), (2, CARVE)])), ("Crouch", 2, keyed([(1, CROUCH), (2, CROUCH)])),
         ("OneHand", 2, keyed([(1, ONEH), (2, ONEH)])), ("OneFootHand", 2, keyed([(1, ONEFH2), (2, ONEFH2)])),
         ("Heli", 80, keyed(HELI)), ("AirJibe", 54, keyed(AIRJIBE)), ("Vulcan", 60, keyed(VULCAN)),
         ("Spock", 84, keyed(SPOCK)), ("Flaka", 64, keyed(FLAKA)), ("Pump", 24, keyed(PUMP, cyclic=True))]
ONLY = os.environ.get("CLIPS")
if ONLY: CLIPS = [c for c in CLIPS if c[0] in ONLY.split(",")]

