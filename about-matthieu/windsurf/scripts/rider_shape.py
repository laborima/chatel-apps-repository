# Rider's build (exec'd by windsurf_build.py on an Avaturn avatar, before anything is posed): real height and a
# windsurfer's build, from the photos of Matthieu on the water (1.78 m, broad shoulders, thick arms and forearms,
# strong thighs, a slim waist). Everything happens in the rest pose: bones and vertices move together, the skin
# weights, UVs and the wetsuit texture are kept.
# Knobs (environment): RIDER_H (m, top of the head, default 1.78), BULK (0 = the avatar as it is, 1 = default build),
# SHOULDERS (m added to each side, default 0.03).

def reshape_rider(arm):
    H = float(os.environ.get("RIDER_H", "1.78")); K = float(os.environ.get("BULK", "1")); DX = float(os.environ.get("SHOULDERS", "0.03")) * K
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.parent == arm]
    def keyed_coords(o):
        me = o.data
        return [kb.data for kb in me.shape_keys.key_blocks] if me.shape_keys else [me.vertices]
    # ---- height: the head's skin (hair excluded) at H; the soles stay at z = 0
    top = max(v.co.z for o in meshes if o.name in ("Head_Mesh", "Body_Mesh") for v in o.data.vertices)
    f = H / top
    for o in meshes:
        for data in keyed_coords(o):
            for v in data: v.co = v.co * f
    bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode="EDIT")
    for eb in arm.data.edit_bones: eb.head = eb.head * f; eb.tail = eb.tail * f
    bpy.ops.object.mode_set(mode="OBJECT")
    print("rider height", round(top, 3), "->", H, "scale", round(f, 3))
    if K <= 0: return
    # ---- muscle: each vertex pushed away from its bones' axes, by profiles along each bone (t = 0 head, 1 tail)
    bump = lambda t, c, w: math.exp(-((t - c) / w) ** 2)
    PROFILE = {
        "Arm": lambda t: 1 + 0.16 + 0.22 * bump(t, 0.45, 0.30) + 0.10 * bump(t, 0.0, 0.18),   # deltoid, biceps / triceps
        "ForeArm": lambda t: 1 + 0.06 + 0.22 * bump(t, 0.22, 0.30),                              # forearms of a windsurfer
        "Shoulder": lambda t: 1 + 0.10 + 0.10 * t,                                               # trapezius, top of the deltoid
        "Spine2": lambda t: 1.11,                                                                # chest and upper back
        "Spine1": lambda t: 1.05,
        "Spine": lambda t: 1.0,                                                                  # the waist stays slim
        "Neck": lambda t: 1.08,
        "UpLeg": lambda t: 1 + 0.05 + 0.11 * bump(t, 0.30, 0.35),                                # quads
        "Leg": lambda t: 1 + 0.02 + 0.12 * bump(t, 0.28, 0.25),                                  # calves
    }
    bones = arm.data.bones
    def prof(name):
        for sd in ("Left", "Right"):
            if name.startswith(sd): name = name[len(sd):]
        return PROFILE.get(name)
    segs = {b.name: (b.head_local.copy(), b.tail_local.copy(), prof(b.name)) for b in bones}
    side_of = lambda n: 1 if n.startswith("Left") else (-1 if n.startswith("Right") else 0)
    ARMCHAIN = ("Arm", "ForeArm", "Hand")
    for o in meshes:
        gi = {g.index: g.name for g in o.vertex_groups}
        base = o.data.vertices
        disp = []
        for v in base:
            d = Vector(); ws = [(gi.get(g.group), g.weight) for g in v.groups if g.weight > 0 and gi.get(g.group) in segs]
            tot = sum(w for _, w in ws) or 1.0
            for n, w in ws:
                w /= tot; h, t_, pf = segs[n]
                sh = side_of(n)
                core = n[len("Left"):] if sh > 0 else (n[len("Right"):] if sh < 0 else n)
                # broader shoulders: the arm chain (and half the clavicle) moves outwards
                if sh and (core in ARMCHAIN or core.startswith("Hand")): d.x += sh * DX * w
                elif sh and core == "Shoulder": d.x += sh * DX * 0.6 * w
                if pf is None: continue
                ax = t_ - h; L2 = ax.length_squared
                tt = max(0.0, min(1.0, (v.co - h).dot(ax) / L2)) if L2 > 1e-9 else 0.0
                r = v.co - (h + ax * tt)
                d += r * ((pf(tt) - 1) * K * w)
            disp.append(d)
        for data in keyed_coords(o):
            for v, d in zip(data, disp): v.co = v.co + d
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    for sd, sg in (("Left", 1), ("Right", -1)):
        eb[sd + "Shoulder"].tail.x += sg * DX
        for b in [eb[sd + "Arm"]] + list(eb[sd + "Arm"].children_recursive):
            b.head.x += sg * DX; b.tail.x += sg * DX
    bpy.ops.object.mode_set(mode="OBJECT")
    print("rider build: bulk", K, "shoulders +", round(DX, 3), "m a side")

reshape_rider(arm)
