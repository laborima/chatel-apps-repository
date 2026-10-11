# Wing foil gear (exec'd by windsurf_build.py with MODE=wing): 145 x 60 cm foil board, carbon foil (85 cm mast,
# 1000 cm2 front wing), 5 m2 inflatable wing held by two handles on the strut.
# Same frame as the windsurf: board along +Y (bow), rider on the -X rail facing +X, wind from -X.
# The "rig" is the wing: rig space = span along Z, chord aft along -Y, canopy camber to +X; its origin is the
# leading edge at the strut, and it is placed freely in the board frame (pose key "rigpos").

M_FBOARD = mat("BoardWhite", (0.86, 0.87, 0.88, 1), 0.35)
M_FRAIL = mat("BoardGrey", (0.30, 0.32, 0.35, 1), 0.4)
M_CARBON = mat("FoilCarbon", (0.025, 0.025, 0.03, 1), 0.3)
M_CANOPY = mat("SailWingCanopy", (0.92, 0.93, 0.95, 1), 0.4, alpha=0.95)
M_WACCENT = mat("SailWingTeal", (0.0, 0.48, 0.56, 1), 0.4, alpha=0.95)
M_WWIN = mat("SailWingWindow", (0.80, 0.86, 0.90, 1), 0.2, alpha=0.45)
M_TUBE = mat("SailWingTube", (0.03, 0.22, 0.28, 1), 0.5)
M_HANDLE = mat("SailWingHandle", (0.04, 0.04, 0.04, 1), 0.8)

# ---------------------------------------------------------------- board
L, W = 1.45, 0.60
def outline(y):          # half width: round nose, wide square-ish tail
    s = (y + L / 2) / L                       # 0 tail -> 1 nose
    nose = min(1.0, (1 - s) / 0.38) ** 0.55
    tail = 0.82 + 0.18 * min(1.0, s / 0.15)
    return 0.5 * W * nose * tail
def rocker(y):
    s = (y + L / 2) / L
    return 0.07 * max(0, (s - 0.70) / 0.30) ** 2.0
def thick(y):
    s = (y + L / 2) / L
    return 0.11 + 0.03 * math.sin(math.pi * min(1, max(0, s * 1.05)))
NY, NC = 60, 28
verts, faces, fm = [], [], []
ys = np.linspace(-L / 2 + 0.004, L / 2 - 0.004, NY)
for y in ys:
    hw = max(outline(y), 0.004); t = thick(y); z0 = rocker(y)
    for j in range(NC):
        a = 2 * math.pi * j / NC
        cx, cz = math.cos(a), math.sin(a)
        x = hw * np.sign(cx) * abs(cx) ** 0.35                   # very boxy rails
        z = z0 + (t * (0.5 + 0.5 * np.sign(cz) * abs(cz) ** 0.5) if cz > 0 else t * 0.5 * (1 + cz * 0.95) * 0.15)
        verts.append((x, y, z))
for i in range(NY - 1):
    for j in range(NC):
        a, b = i * NC + j, i * NC + (j + 1) % NC
        faces.append((a, b, b + NC, a + NC))
        ang = 2 * math.pi * (j + 0.5) / NC
        fm.append(0 if math.sin(ang) > 0.2 else (1 if math.sin(ang) > -0.4 else 2))
for idx in (0, NY - 1):
    c = len(verts); verts.append(tuple(np.mean(np.array(verts[idx * NC:(idx + 1) * NC]), 0)))
    for j in range(NC):
        f = (idx * NC + j, idx * NC + (j + 1) % NC, c); faces.append(f if idx else f[::-1]); fm.append(1)
board = mesh_obj("Board", verts, faces, [M_FBOARD, M_FRAIL, M_FRAIL], fm)
deck_z = lambda y: rocker(y) + thick(y)
pv, pf = [], []
yy = np.linspace(-0.66, 0.30, 16); xx = np.linspace(-1, 1, 9)
for y in yy:
    for x in xx: pv.append((x * outline(y) * 0.86, y, deck_z(y) + 0.003))
for i in range(15):
    for j in range(8): pf.append((i * 9 + j, i * 9 + j + 1, (i + 1) * 9 + j + 1, (i + 1) * 9 + j))
mesh_obj("DeckPad", pv, pf, [M_PAD])

# ---------------------------------------------------------------- foil (under the board, towards the tail)
FY, FMAST = -0.22, 0.85
def plate(name, pts, thick_):
    o = mesh_obj(name, pts, [tuple(range(len(pts)))], [M_CARBON], smooth=False)
    so = o.modifiers.new("t", "SOLIDIFY"); so.thickness = thick_; so.offset = 0; return o
plate("FoilMast", [(0, FY + 0.065, 0.01), (0, FY - 0.065, 0.01), (0, FY - 0.06, -FMAST), (0, FY + 0.06, -FMAST)], 0.018)
def wing_plan(name, yc, span, c0, c1, sweep, anhedral, th):
    pts = []
    N = 14
    for i in range(N + 1):                                     # leading edge, tip to tip
        x = -span / 2 + span * i / N; s = abs(2 * x / span)
        pts.append((x, yc + c0 * 0.35 - sweep * s ** 1.6 + (c0 - c1) * 0.15 * s, -FMAST - 0.02 - anhedral * s ** 2))
    for i in range(N, -1, -1):                                 # trailing edge back
        x = -span / 2 + span * i / N; s = abs(2 * x / span); c = c0 + (c1 - c0) * s ** 1.3
        pts.append((x, yc + c0 * 0.35 - sweep * s ** 1.6 + (c0 - c1) * 0.15 * s - c, -FMAST - 0.02 - anhedral * s ** 2))
    return plate(name, pts, th)
wing_plan("FoilFront", FY + 0.34, 1.00, 0.19, 0.06, 0.07, 0.05, 0.022)
wing_plan("FoilStab", FY - 0.50, 0.40, 0.085, 0.04, 0.03, -0.01, 0.012)
fv, ff = [], []
for i in range(17):
    y = FY + 0.42 - 0.95 * i / 16; r = 0.022 * (1 - 0.4 * max(0, (i - 10) / 6))
    for j in range(8): a = 2 * math.pi * j / 8; fv.append((r * math.cos(a), y, -FMAST - 0.02 + r * math.sin(a)))
for i in range(16):
    for j in range(8): ff.append((i * 8 + j, i * 8 + (j + 1) % 8, (i + 1) * 8 + (j + 1) % 8, (i + 1) * 8 + j))
mesh_obj("FoilFuselage", fv, ff, [M_CARBON])
MAST_FOOT = Vector((0, 0.0, deck_z(0.0)))              # pivot for spins
HARNESS = False

# ---------------------------------------------------------------- wing (5 m2)
rig = bpy.data.objects.new("Rig", None); sc.collection.objects.link(rig)
SPAN, CHORD = 1.62, 1.42
def le_pt(s):            # leading edge, s in [-1, 1]: C shape, tips to leeward (+x) and swept aft
    return Vector((0.50 * s * s, -0.30 * s * s, SPAN * s * (1 - 0.06 * s * s)))
def chord(s): return 0.16 + (CHORD - 0.16) * max(0.0, 1 - s * s) ** 0.7
def canopy_pt(u, s):
    le = le_pt(s); c = chord(s)
    return le + Vector((0.10 * c * math.sin(math.pi * u) * (1 - 0.3 * abs(s)) + 0.04 * u * (1 - s * s), -c * u, -0.02 * u * abs(s)))
NU_, NS_ = 16, 40
sv, sf, sm = [], [], []
for i in range(NS_ + 1):
    for j in range(NU_ + 1): sv.append(canopy_pt(j / NU_, -1 + 2 * i / NS_))
for i in range(NS_):
    for j in range(NU_):
        a = i * (NU_ + 1) + j; sf.append((a, a + 1, a + NU_ + 2, a + NU_ + 1))
        s_, u_ = -1 + 2 * (i + 0.5) / NS_, (j + 0.5) / NU_
        win = abs(s_) < 0.30 and 0.18 < u_ < 0.55 and s_ > -0.05
        sm.append(2 if win else (1 if u_ > 0.82 or abs(s_) > 0.82 else 0))
sail = mesh_obj("Wing", sv, sf, [M_CANOPY, M_WACCENT, M_WWIN], sm)
rig_parts = []
def tube_along(name, pts, radii, m_):
    v, f = [], []
    pts = [Vector(p) for p in pts]; n = len(pts)
    for i, (p, r) in enumerate(zip(pts, radii)):
        r = float(r)
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        a_ = t.orthogonal().normalized(); b_ = t.cross(a_)
        for j in range(10):
            ang = 2 * math.pi * j / 10; v.append(p + r * (math.cos(ang) * a_ + math.sin(ang) * b_))
    for i in range(n - 1):
        for j in range(10): f.append((i * 10 + j, i * 10 + (j + 1) % 10, (i + 1) * 10 + (j + 1) % 10, (i + 1) * 10 + j))
    o = mesh_obj(name, v, f, [m_]); rig_parts.append(o); return o
ss = np.linspace(-1, 1, 41)
tube_along("WingLE", [le_pt(s) + Vector((0.02, 0.0, 0)) for s in ss], [0.085 * (1 - 0.6 * s * s) + 0.015 for s in ss], M_TUBE)
tube_along("WingStrut", [Vector((0.02, -0.02 - 1.30 * float(t), 0)) for t in np.linspace(0, 1, 12)], [0.055 - 0.03 * t for t in np.linspace(0, 1, 12)], M_TUBE)
HANDLES = (0.35, 0.95)                                 # positions along the strut (m from the leading edge)
def handle_pt(t, side): return Vector((side * 0.075, -t, 0.0))
for side in (-1,):
    for t0 in HANDLES:
        a_, b_ = handle_pt(t0 - 0.09, side), handle_pt(t0 + 0.09, side)
        tube_along("WingHandle", [a_.lerp(b_, k) for k in np.linspace(0, 1, 6)], [0.017] * 6, M_HANDLE)
        for e in (a_, b_): tube_along("WingHandleTab", [e, Vector((0.02, e.y, 0))], [0.008, 0.008], M_HANDLE)
# everything in one mesh, so the shape keys (flip to the other tack, flutter) move the tubes and handles too
bpy.ops.object.select_all(action="DESELECT")
for o in rig_parts: o.select_set(True)
sail.select_set(True); bpy.context.view_layer.objects.active = sail; bpy.ops.object.join()
sail.parent = rig
NCAN = len(sv)
sail.shape_key_add(name="Basis"); fk = sail.shape_key_add(name="flutter"); xk = sail.shape_key_add(name="flip")
for k, v in enumerate(sail.data.vertices):
    co = v.co.copy(); xk.data[k].co = Vector((-co.x, co.y, co.z))
    if k < NCAN:
        u_, s_ = (k % (NU_ + 1)) / NU_, -1 + 2 * (k // (NU_ + 1)) / NS_
        fk.data[k].co = co + Vector((0.03 * u_ ** 2 * math.sin(s_ * 9), 0, 0))

def rig_pose_matrix(a, b, w, g):
    """The wing, held in the hands: free position (rigpos, board frame) and attitude."""
    pos = Vector(lerpv(a["rigpos"], b["rigpos"], w))
    return Matrix.Translation(pos) @ Matrix.Rotation(math.radians(g("rlean")), 4, "Y") @ \
        Matrix.Rotation(math.radians(g("rake")), 4, "X") @ Matrix.Rotation(math.radians(g("sheet")), 4, "Z")

def grip_local(h):
    """("hdl", t, side): handle on the strut, t metres from the leading edge, on the side the rider holds."""
    return handle_pt(h[1], h[2]), Vector((0, -1, 0)), "bar"
