# Windsurf gear (exec'd by windsurf_build.py): JP Magic Ride 119 board, Duotone E_Pace 6.2 rig
# ---------------------------------------------------------------- board (Magic Ride 119: 241 x 74 cm)
L, W = 2.41, 0.74
# Magic Ride deck outline measured on the maker's top view (half-width / max, nose -> tail, 41 stations)
MR = [0.092, 0.344, 0.448, 0.54, 0.613, 0.675, 0.73, 0.773, 0.822, 0.853, 0.877, 0.902, 0.926, 0.951, 0.969, 0.975, 0.982, 0.988, 0.994, 1.0,
      0.994, 0.988, 0.988, 0.982, 0.963, 0.951, 0.957, 0.933, 0.908, 0.877, 0.853, 0.828, 0.798, 0.761, 0.724, 0.693, 0.638, 0.571, 0.485, 0.374, 0.061]
MR = np.convolve(np.pad(MR, 1, mode="edge"), [0.25, 0.5, 0.25], "valid")      # light smoothing
def outline(y):          # half width vs position (y from tail -L/2 to nose +L/2)
    s_nose = 1 - (y + L / 2) / L
    return 0.37 * float(np.interp(s_nose, np.linspace(0, 1, len(MR)), MR))
def rocker(y):            # side view: flat run, nose kick from ~65 % (about 11 cm at the tip), tiny tail kick
    s = (y + L / 2) / L
    return 0.11 * max(0, (s - 0.64) / 0.36) ** 2.2 + 0.006 * max(0, (0.04 - s) / 0.04)
def thick(y):             # ~12 cm under the feet, thinner nose and tail
    s = (y + L / 2) / L
    return 0.045 + 0.075 * math.sin(math.pi * min(1, max(0, 0.08 + s * 0.9))) ** 0.7
NY, NC = 90, 28
verts, faces, fm = [], [], []
ys = np.linspace(-L / 2 + 0.005, L / 2 - 0.004, NY)
for y in ys:
    hw = max(outline(y), 0.004); t = thick(y); z0 = rocker(y)
    for j in range(NC):
        a = 2 * math.pi * j / NC
        cx, cz = math.cos(a), math.sin(a)
        x = hw * np.sign(cx) * abs(cx) ** 0.55                   # boxy rails
        z = z0 + (t * (0.5 + 0.5 * np.sign(cz) * abs(cz) ** 0.8) if cz > 0 else t * 0.5 * (1 + cz * 0.9) * 0.2)
        verts.append((x, y, z))
for i in range(NY - 1):
    for j in range(NC):
        a, b = i * NC + j, i * NC + (j + 1) % NC
        faces.append((a, b, b + NC, a + NC))
        yy = ys[i]; ang = 2 * math.pi * (j + 0.5) / NC
        top = math.sin(ang) > 0.15
        fm.append(0 if not top else (1 if yy > 0.72 else 0))
        if not top and math.sin(ang) < -0.3: fm[-1] = 2
# caps
for idx in (0, NY - 1):
    c = len(verts); verts.append(tuple(np.mean(np.array(verts[idx * NC:(idx + 1) * NC]), 0)))
    for j in range(NC):
        f = (idx * NC + j, idx * NC + (j + 1) % NC, c); faces.append(f if idx else f[::-1]); fm.append(1)
board = mesh_obj("Board", verts, faces, [M_ORANGE, M_BLACK, M_WHITE], fm)
deck_z = lambda y: rocker(y) + thick(y)
# deck pads (front pad around strap zone)
pv, pf = [], []
for k, (y0, y1, hw) in enumerate([(-1.05, -0.25, 0.30)]):
    yy = np.linspace(y0, y1, 12); xx = np.linspace(-hw, hw, 8)
    base = len(pv)
    for y in yy:
        for x in xx: pv.append((x * min(1, outline(y) / 0.37 * 1.05), y, deck_z(y) + 0.003))
    for i in range(11):
        for j in range(7): pf.append((base + i * 8 + j, base + i * 8 + j + 1, base + (i + 1) * 8 + j + 1, base + (i + 1) * 8 + j))
mesh_obj("DeckPad", pv, pf, [M_PAD])
# fin (Ride 38 G10)
fv = [(0, -1.02, 0.01), (0, -0.88, 0.01), (0, -0.98, -0.37), (0, -1.06, -0.34)]
fin = mesh_obj("Fin", fv, [(0, 1, 2, 3)], [M_FIN], smooth=False)
sol = fin.modifiers.new("t", "SOLIDIFY"); sol.thickness = 0.012
# footstraps: padded neoprene straps arched over the instep of each foot (stance of poses_windsurf: ankle
# position and foot angle), on both rails for the two tacks
M_STRAP = mat("StrapNeoprene", (0.16, 0.18, 0.21, 1), 0.7)
M_STRAPBAND = mat("StrapBand", (0.85, 0.20, 0.05, 1), 0.5)
M_SCREW = mat("StrapScrew", (0.7, 0.7, 0.72, 1), 0.3, metal=0.9)
STANCE = (("Front", -0.22, -0.47, 35.0), ("Back", -0.20, -0.95, 0.0))      # ankle x, y and toe angle (deg from +X)
def footstrap(name, ax, ay, a_deg):
    a_ = math.radians(a_deg); d = Vector((math.cos(a_), math.sin(a_), 0)); across = Vector((-d.y, d.x, 0))
    c = Vector((ax, ay, 0)) + d * 0.085                 # over the instep, 8.5 cm in front of the ankle
    span, h = 0.20, 0.072
    v, f, fm_ = [], [], []
    N, M = 22, 12
    for i in range(N + 1):
        t = i / N; s_ = (t - 0.5) * span
        z = h * math.sin(math.pi * t) ** 0.6
        p = c + across * s_
        p.z = deck_z(p.y) + z + 0.004
        tang = (across * span + Vector((0, 0, h * math.pi * math.cos(math.pi * t) * 0.6))).normalized()
        nrm = tang.cross(d).normalized()                # outward from the arch
        for j in range(M):
            ang = 2 * math.pi * j / M
            v.append(p + d * (0.026 * math.cos(ang)) + nrm * (0.011 * math.sin(ang) + 0.011))
    for i in range(N):
        for j in range(M):
            f.append((i * M + j, i * M + (j + 1) % M, (i + 1) * M + (j + 1) % M, (i + 1) * M + j))
            fm_.append(1 if 9 <= i <= 12 else 0)        # coloured band on top
    mesh_obj(name, v, f, [M_STRAP, M_STRAPBAND], fm_)
    for k_, sgn in enumerate((-1, 1)):                  # the two screw plugs
        p = c + across * (sgn * span / 2); p.z = deck_z(p.y)
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.013, depth=0.008, location=(p.x, p.y, p.z + 0.004))
        o = bpy.context.active_object; o.name = f"{name}Screw{k_}"; o.data.materials.append(M_SCREW)
for nm, ax, ay, ang in STANCE:
    footstrap(f"Strap{nm}", ax, ay, ang)
    footstrap(f"Strap{nm}2", -ax, ay, 180 - ang)        # starboard tack: mirrored
MAST_FOOT = Vector((0, 0.15, deck_z(0.15)))

# ---------------------------------------------------------------- rig (E_Pace 6.2: luff 442, boom 190, 6 battens, mast 430)
LUFF, BOOM, BOOMH = 4.42, 1.90, 1.38
rig = bpy.data.objects.new("Rig", None); sc.collection.objects.link(rig); rig.location = MAST_FOOT
def mast_pt(z):   # mast bend: top bends aft (-Y local)
    s = z / 4.30; return Vector((0, -0.10 * s ** 2, z))
# mast tube
mv, mf = [], []
NZ, NR = 40, 10
for i in range(NZ + 1):
    z = 0.05 + 4.25 * i / NZ; c = mast_pt(z); r = 0.024 - 0.008 * i / NZ
    for j in range(NR):
        a = 2 * math.pi * j / NR; mv.append((c.x + r * math.cos(a), c.y + r * math.sin(a), c.z))
for i in range(NZ):
    for j in range(NR): mf.append((i * NR + j, i * NR + (j + 1) % NR, (i + 1) * NR + (j + 1) % NR, (i + 1) * NR + j))
mast = mesh_obj("Mast", mv, mf, [M_MAST]); mast.parent = rig
# sail outline in rig-local (x: camber side, y: aft is negative, z: up)
TACK = mast_pt(0.10); MTOP = mast_pt(LUFF - 0.02)
CLEW = Vector((0, -BOOM + 0.04, BOOMH + 0.10))
HEADC = Vector((0, MTOP.y - 0.50, LUFF - 0.16))           # square head: ~50 cm wide
def luff_c(t): return mast_pt(0.10 + t * (LUFF - 0.12))
def head_c(t): return MTOP.lerp(HEADC, t) + Vector((0, 0, 0.03 * math.sin(math.pi * t)))
def leech_c(t):           # clew -> head corner, nearly straight with a little roach
    p = CLEW.lerp(HEADC, t); return p + Vector((0, -0.10 * math.sin(math.pi * t) * (1 - t * 0.3), 0))
def foot_c(t):            # tack -> clew, sweeping low to the deck
    p = TACK.lerp(CLEW, t); return p + Vector((0, -0.05 * math.sin(math.pi * t), -0.32 * math.sin(math.pi * t) * (1 - t) ** 0.3))
def sail_point(u, v):
    """Coons patch. u: 0 luff -> 1 leech, v: 0 foot -> 1 head"""
    p = ((1 - u) * luff_c(v) + u * leech_c(v) + (1 - v) * foot_c(u) + v * head_c(u)
         - ((1 - u) * (1 - v) * TACK + u * (1 - v) * CLEW + (1 - u) * v * MTOP + u * v * HEADC))
    p.z = max(p.z, 0.07)
    chord = (luff_c(v) - leech_c(v)).length
    camber = 0.095 * chord * math.sin(math.pi * u) ** 0.75 * (1 - 0.55 * v)     # draft forward, flatter and open at the head
    twist = 0.10 * v ** 1.5 * u                                                  # leech opens to leeward up high
    return Vector((camber + twist, p.y, p.z))
NU, NV = 22, 44
sv, sf, sm = [], [], []
for i in range(NV + 1):
    for j in range(NU + 1): sv.append(sail_point(j / NU, i / NV))
for i in range(NV):
    for j in range(NU):
        a = i * (NU + 1) + j; sf.append((a, a + 1, a + NU + 2, a + NU + 1))
        v_, u_ = (i + 0.5) / NV, (j + 0.5) / NU
        win = 0.14 < v_ < 0.44 and 0.22 < u_ < 0.80                  # x-ply window, framed in yellow
        frame = (0.12 < v_ < 0.46 and 0.20 < u_ < 0.82) and not win
        if u_ < 0.045: sm.append(4)                                   # luff sleeve
        elif win: sm.append(1)
        elif frame: sm.append(3)
        elif v_ < 0.10 or u_ > 0.84 and v_ < 0.62 or (u_ > 0.90): sm.append(2)   # purple foot and leech
        else: sm.append(0)
sail = mesh_obj("Sail", sv, sf, [M_FILM, M_XPLY, M_DARK, M_TAPE, M_LUFF], sm); sail.parent = rig
# battens (6)
bv, bf = [], []
for vb in (0.12, 0.30, 0.47, 0.62, 0.77, 0.91):
    base = len(bv)
    for j in range(NU + 1):
        p = sail_point(j / NU, vb)
        bv += [tuple(p + Vector((0.004, 0, -0.008))), tuple(p + Vector((0.004, 0, 0.008)))]
    for j in range(NU): bf.append((base + 2 * j, base + 2 * j + 2, base + 2 * j + 3, base + 2 * j + 1))
batt = mesh_obj("Battens", bv, bf, [M_BATTEN]); batt.parent = rig
# battens joined into the sail so the shape keys move them too
bpy.ops.object.select_all(action="DESELECT"); batt.select_set(True); sail.select_set(True)
bpy.context.view_layer.objects.active = sail; bpy.ops.object.join()
# shape keys: "flutter" (leech waves) and "flip" (camber on the other side: the sail after a tack or a jibe)
sail.shape_key_add(name="Basis"); fk = sail.shape_key_add(name="flutter"); xk = sail.shape_key_add(name="flip")
for k, v in enumerate(sail.data.vertices):
    co = v.co.copy(); xk.data[k].co = Vector((-co.x, co.y, co.z))
    if k < len(sv):
        u_, v_ = (k % (NU + 1)) / NU, (k // (NU + 1)) / NV
        fk.data[k].co = co + Vector((0.035 * u_ ** 3 * math.sin(v_ * 26), 0, 0))
# boom (wishbone): two arms from the mast at BOOMH to the clew, spread 0.26
def boom_pt(t, side):
    p = mast_pt(BOOMH).lerp(Vector((0, -BOOM, BOOMH + 0.08)), t)
    return p + Vector((side * 0.27 * math.sin(math.pi * t) ** 0.75, 0, 0.02 * math.sin(math.pi * t)))
for side, nm in ((-1, "BoomWindward"), (1, "BoomLeeward")):
    bv2, bf2 = [], []
    N = 30; R = 0.016
    for i in range(N + 1):
        c = boom_pt(i / N, side)
        for j in range(8):
            a = 2 * math.pi * j / 8; bv2.append((c.x + R * math.cos(a), c.y, c.z + R * math.sin(a)))
    for i in range(N):
        for j in range(8): bf2.append((i * 8 + j, i * 8 + (j + 1) % 8, (i + 1) * 8 + (j + 1) % 8, (i + 1) * 8 + j))
    ob = mesh_obj(nm, bv2, bf2, [M_BOOM]); ob.parent = rig
# boom head + harness lines
def tube(name, a, b, r, m_):
    a, b = Vector(a), Vector(b); d = b - a; q = d.to_track_quat("Z", "Y")
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=r, depth=d.length, location=(a + b) / 2, rotation=q.to_euler())
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m_); return o
for nm, a, b, r, m_ in (("BoomHead", mast_pt(BOOMH) + Vector((0, 0.02, 0)), mast_pt(BOOMH) + Vector((0, -0.12, 0)), 0.03, M_GRIP),
                        ("Extension", (0, 0, -0.03), (0, 0, 0.06), 0.03, M_MAST)):
    o = tube(nm, a, b, r, m_); o.parent = rig
# harness line anchors on the windward wishbone arm: the game draws the line to the rider's hook (or hanging)
HARNESS = True
for nm, t0 in (("LineFwd", 0.29), ("LineAft", 0.43)):
    e = bpy.data.objects.new(nm, None); sc.collection.objects.link(e); e.parent = rig; e.location = boom_pt(t0, -1); e.empty_display_size = 0.03

def rig_matrix(lean, rake, sheet):
    return Matrix.Translation(MAST_FOOT) @ Matrix.Rotation(lean, 4, "Y") @ Matrix.Rotation(rake, 4, "X") @ Matrix.Rotation(sheet, 4, "Z")



def rig_pose_matrix(a, b, w, g):
    return rig_matrix(math.radians(g("rlean")), math.radians(g("rake")), math.radians(g("sheet")))

RIG_GIVE = 0.5                                   # half the reach comes from the rig, pulled to windward
def give_rig(d):
    """Tilt the rig round the mast foot so the boom moves about d (board frame) across the board."""
    th = d.x / BOOMH
    rig.matrix_basis = Matrix.Translation(MAST_FOOT) @ Matrix.Rotation(th, 4, "Y") @ Matrix.Translation(-MAST_FOOT) @ rig.matrix_basis

def grip_local(h):
    """Hand hold in rig space: (point, bar/pole direction, kind)."""
    if h[0] == "boom":
        return boom_pt(h[1], h[2]), boom_pt(min(1, h[1] + 0.01), h[2]) - boom_pt(max(0, h[1] - 0.01), h[2]), "bar"
    return mast_pt(h[1]) + Vector((0, 0.03, 0)), Vector((0, 0, 1)), "pole"
