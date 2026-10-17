// Windsurf game model: sailing polar, waves the board rides, jumps, loops, tacks and jibes.
// Angles are compass radians (0 = north, clockwise). The wind direction is where it blows FROM.
// Frame: x east, y north (metres), z up.

export const KNOT = 0.514444;
const TAU = Math.PI * 2;
const G = 9.81;
export const wrap = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

// ---------------------------------------------------------------- sea
// swellLen / swellAmp / swellSteep: the wave sets the board surfs and jumps off (steepness k*a ~ 0.26 in "vagues": real ramps)
export const SEA_STATES = {
    plate: { label: 'Plate', amp: 0.25, len: 0.7, swellLen: 60, swellAmp: 0.08, swellSteep: 0.2 },
    clapot: { label: 'Clapot', amp: 1.0, len: 1.0, swellLen: 70, swellAmp: 0.25, swellSteep: 0.2 },
    houle: { label: 'Houle', amp: 0.9, len: 1.2, swellLen: 52, swellAmp: 0.95, swellSteep: 0.6 },
    vagues: { label: 'Grosses vagues', amp: 1.0, len: 1.3, swellLen: 34, swellAmp: 1.4, swellSteep: 1.2 },
};

/** Wave field parameters, shared by the sea shader and the board (keep them identical). */
export const seaParams = (s) => {
    const st = SEA_STATES[s.sea] || SEA_STATES.clapot;
    const u = s.baseTws ?? s.tws;          // the mean wind: gusts must not reshape the wave field (it would jump under the board)
    const hs = Math.max(0.15, Math.min(0.21 * u * u / G, 1.6)) * st.amp;
    return {
        amp: hs, chop: 0.4 + 0.5 * smooth(u, 3, 13), len: Math.min(40, Math.max(6, 0.5 * u * u)) * st.len,
        whitecaps: smooth(u, 3.5, 13), dir: s.twd + Math.PI,
        swellLen: st.swellLen, swellAmp: st.swellAmp, swellSteep: st.swellSteep,
    };
};
const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Same Gerstner spectrum as the shader (vertical part): height and slope at a point of the sea
const WL = [1.0, 0.74, 0.58, 0.45, 0.36, 0.29], WA = [0.46, 0.30, 0.22, 0.15, 0.11, 0.08];
const WD = [0.0, 0.43, -0.37, 0.86, -0.74, 0.18], WP = [0.0, 1.7, 4.1, 2.3, 5.2, 0.9];
export const waveAt = (w, x, y, t) => {
    let z = 0, gx = 0, gy = 0;
    const add = (ang, L, a, phase) => {
        const dx = Math.sin(ang), dy = Math.cos(ang), k = TAU / L, c = Math.sqrt(G / k);
        const f = k * (dx * x + dy * y - c * t) + phase;
        z += a * Math.sin(f); gx += dx * k * a * Math.cos(f); gy += dy * k * a * Math.cos(f);
    };
    for (let i = 0; i < 6; i++) add(w.dir + WD[i], w.len * WL[i], w.amp * WA[i], WP[i]);
    add(w.dir + 0.55, w.swellLen, w.swellAmp, 0);
    return { z, gx, gy };
};

// ---------------------------------------------------------------- crafts
// polar: speed factor, takeoff / drop: planing (or foil flight) thresholds in m/s, slow: speed factor before,
// foil: flight height of the board (m), moves: manoeuvres the model has clips for,
// pump: speed gained per pumping stroke (m/s), pumpToFly: the foil only takes off after a few strokes (below selfLaunch m/s of wind)
export const CRAFTS = {
    windsurf: { label: 'Planche à voile', polar: 1.0, takeoff: 4.0, drop: 3.3, slow: 0.55, foil: 0, jump: 1.0, moves: null, pump: 0.7 },
    wing: { label: 'Wing foil', polar: 0.82, takeoff: 3.6, drop: 2.8, slow: 0.5, foil: 0.62, jump: 1.2, moves: ['tack', 'jibe', 'carve'],      // the wing lifts the jumps
            pump: 0.5, pumpToFly: true, selfLaunch: 12 },
};
// pumping: one stroke (pull then recover), the part of it that drives, and the lift a stroke gives the foil (3 in a row to fly)
export const PUMP_DUR = 0.62;
const PUMP_DRIVE = 0.45, PUMP_LIFT = 0.4, PUMP_LIFT_DECAY = 0.3;
export const craftOf = (s) => CRAFTS[s.craft] || CRAFTS.windsurf;
export const canDo = (s, kind) => { const m = craftOf(s).moves; return !m || m.includes(kind); };

// ---------------------------------------------------------------- sailing
// Board speed / true wind speed, by true wind angle (degrees, 0 = head to wind)
const POLAR = [[0, 0], [38, 0], [45, 0.45], [60, 0.85], [90, 1.15], [115, 1.25], [140, 1.1], [165, 0.8], [180, 0.65]];
export const polar = (twaDeg) => {
    const a = Math.min(180, Math.abs(twaDeg));
    for (let i = 1; i < POLAR.length; i++) {
        const [a0, k0] = POLAR[i - 1], [a1, k1] = POLAR[i];
        if (a <= a1) return k0 + (k1 - k0) * (a - a0) / (a1 - a0);
    }
    return 0;
};

export const TRICKS = {
    jump: 'Saut', forward: 'Forward loop', back: 'Back loop', tabletop: 'Table-top',
    tack: 'Virement', jibe: 'Empannage', planingJibe: 'Empannage planant', duck: 'Duck jibe', carve: 'Carving 360',
    oneFooter: 'One-footer', doubleForward: 'Double forward', doubleBack: 'Double back loop', push: 'Push loop',
    surf: 'Surf', bottomTurn: 'Bottom turn', oneHander: 'One-hander', noFootHand: 'Lâcher pied + main', pumpOff: 'Décollage au pumping',
    heli: 'Hélitack', airjibe: 'Air jibe', vulcan: 'Vulcan', spock: 'Spock', flaka: 'Flaka', needPlaning: 'Il faut planer !',
    crash: 'Chute !',
};

// Manoeuvres on the water, played as baked animations (the model's clips). dur in seconds.
// The board turns so that it crosses the wind (tack) or dead downwind (jibes) half way, when the sail flips in the clip.
export const MANOEUVRES = {
    tack: { label: 'Virement…', dur: 3.0 },
    jibe: { label: 'Empannage…', dur: 2.6 },
    duck: { label: 'Duck jibe…', dur: 2.6 },
    carve: { label: 'Carving 360…', dur: 3.4 },
    // freestyle (baked spins: the board turns under the rig)
    heli: { label: 'Hélitack…', dur: 3.3 },
    airjibe: { label: 'Air jibe…', dur: 2.25, planing: true },
    vulcan: { label: 'Vulcan…', dur: 2.5, planing: true },
    spock: { label: 'Spock…', dur: 3.5, planing: true },
    flaka: { label: 'Flaka…', dur: 2.7, planing: true },
};
const POP_TIME = 0.16, LAND_TIME = 0.32;                     // s: crouch before the pop, absorbing the landing
const LOOP_RATE = TAU / 0.75, LOOP_MAX = TAU / 0.5;          // rad/s: a relaxed loop, the fastest rotation
const POINTS = { heli: 400, airjibe: 600, vulcan: 800, flaka: 1000, spock: 1200 };
const D2R = Math.PI / 180;
const ease = (u) => u * u * (3 - 2 * u);

/** Taps on the water: the same button tapped 1, 2 or 3 times in a row (the game counts the taps, see taps.js). */
export const TAPS = {
    tack: ['tack', 'heli', 'flaka'],
    jibe: ['jibe', 'duck', 'airjibe'],
    carve: ['carve', 'vulcan', 'spock'],
};
const KINDS = ['tack', 'jibe', 'carve', 'duck', 'heli', 'airjibe', 'vulcan', 'spock', 'flaka'];
const manoeuvreFor = (input, s) => KINDS.find((k) => input[k] && canDo(s, k)) ?? null;

const startManoeuvre = (s, kind) => {
    if (!canDo(s, kind)) return;
    if (MANOEUVRES[kind].planing && !s.planing) { award(s, 'needPlaning', 0); return; }
    const side = Math.sign(s.twa) || s.lastSide, a0 = s.twa;
    let a1, cross = null;
    if (kind === 'tack' || kind === 'heli') { a1 = -side * 55 * D2R; cross = 0; }
    else if (kind === 'carve') a1 = a0 + side * TAU;
    else if (kind === 'flaka') a1 = a0;                                  // spins on the spot, same tack                     // bear away, through the wind twice, same tack
    else { a1 = -side * 120 * D2R + side * TAU; cross = side * Math.PI; } // jibes: through dead downwind
    const dur = MANOEUVRES[kind].dur * (kind === 'jibe' && !s.planing ? 1.25 : 1);
    s.man = { kind, side, a0, a1, cross, t: 0, dur, v0: s.speed, planing: s.planing };
};

/** Heading during a manoeuvre: twa from a0 to the crossing at u = 0.5 (pause head to wind on a tack), then to a1. */
const manTwa = (m, u) => {
    if (m.cross === null) return m.a0 + (m.a1 - m.a0) * ease(u);
    const f = m.kind === 'tack' || m.kind === 'heli' ? ease : (x) => x;
    return u < 0.5 ? m.a0 + (m.cross - m.a0) * f(u * 2) : m.cross + (m.a1 - m.cross) * f(u * 2 - 1);
};
const manSpeed = (m, u) => m.kind === 'tack' || m.kind === 'heli' ? 1 - 0.75 * Math.sin(Math.PI * Math.min(1, u * 1.3))
    : POINTS[m.kind] ? 1 - 0.35 * Math.sin(Math.PI * u)
    : m.planing ? (m.kind === 'carve' ? 0.82 : 0.88) : 0.7;

const finishManoeuvre = (s) => {
    const m = s.man; s.man = null;
    s.lastSide = Math.sign(s.twa) || s.lastSide;
    if (m.kind === 'tack') award(s, 'tack', 50);
    else if (m.kind === 'jibe') award(s, m.planing ? 'planingJibe' : 'jibe', m.planing ? 200 : 80);
    else if (m.kind === 'duck') award(s, 'duck', m.planing ? 350 : 150);
    else if (POINTS[m.kind]) award(s, m.kind, POINTS[m.kind]);
    else award(s, 'carve', m.planing ? 300 : 100);
};

/** Initial state: wind from the west, heading north on a beam reach. */
export const initialState = (opts = {}) => ({
    heading: 0, x: 0, y: 0, speed: 3, baseTws: (opts.windKn ?? 16) * KNOT, tws: (opts.windKn ?? 16) * KNOT, twd: -Math.PI / 2,
    sea: opts.sea ?? 'clapot', craft: opts.craft ?? 'windsurf', fh: 0, turn: 0, distance: 0, topSpeed: 0, planing: false, gust: 0, time: 0,
    mode: 'sail', z: 0, vz: 0, pitch: 0, roll: 0, airPitch: 0, airRoll: 0, loop: 0, airTime: 0, maxZ: 0,
    crashT: 0, man: null, score: 0, events: [], twa: -Math.PI / 2, lastSide: -1, tables: 0, oneFoot: false, oneHand: false,
    oneFootT: 0, oneHandT: 0, bothT: 0, loopTarget: 0, loopDir: 0, pushed: false, surfT: 0, surfed: false, turned: false, ramp: false,
    pumpT: -1, pumpNext: false, pumpLift: 0, loopAsk: 0, letGo: 0,
});

const award = (s, key, pts, extra = '') => {
    s.score += pts;
    s.events.push({ id: s.time + Math.random(), key, text: (TRICKS[key] ?? key) + extra, pts, t: s.time, bad: key === 'crash' || key === 'needPlaning' });
    if (s.events.length > 6) s.events.shift();
};

/**
 * One simulation step. input: { left, right, up, down, oneFoot, oneHand, jumpHeld, jibeHeld } (held) and
 * { jump, tack, jibe, carve, duck, heli, airjibe, vulcan, spock, flaka } (edges: the caller resets them after the step).
 * On the water, jump pumps until planing (or flying) and jumps once planing. In the air the same buttons do the figures:
 * jump = one more forward loop per tap, tack = back loop, jibe held = table-top, carve = let go (1 tap a foot, 2 a foot and a hand).
 * Mutates s.
 */
export const step = (s, input, dt) => {
    s.time += dt;
    // gusty wind, +-20 %
    s.gust += (Math.random() - 0.5) * dt * 0.6; s.gust *= 1 - dt * 0.2;
    s.tws = s.baseTws * (1 + 0.12 * Math.sin(s.time * 0.21) + 0.06 * Math.sin(s.time * 0.67 + 1) + s.gust);
    const w = seaParams(s);
    const wave = waveAt(w, s.x, s.y, s.time);
    const bowX = Math.sin(s.heading), bowY = Math.cos(s.heading);
    const slopeBow = wave.gx * bowX + wave.gy * bowY;            // >0: water rises ahead
    const slopeSide = wave.gx * bowY - wave.gy * bowX;          // >0: rises to starboard

    if (s.mode === 'crash') {
        s.crashT -= dt; s.speed *= 1 - dt * 2; s.z = wave.z - 0.05;
        s.fh += (0 - s.fh) * Math.min(1, dt * 4);                  // off the foil, in the water
        s.popT = 0; s.landT = 0; s.load = 0; s.pumpT = -1; s.pumpLift = 0; s.loopAsk = 0;
        if (s.crashT <= 0) { s.mode = 'sail'; s.speed = 1.2; s.airPitch = 0; s.airRoll = 0; s.zsPrev = undefined; s.vsPrev = undefined; }
        return;
    }

    if (s.mode === 'air') {
        s.airTime += dt; s.vz -= G * dt; s.z += s.vz * dt; s.maxZ = Math.max(s.maxZ, s.z - wave.z);
        // the board follows its flight: nose up off the lip, levelling, nose slightly down to land
        s.pitch += (Math.max(-0.3, Math.min(0.45, Math.atan2(s.vz, Math.max(5, s.speed)) * 0.8)) - s.pitch) * Math.min(1, dt * 6);
        // time left before touching the water again (the rider prepares the landing just before)
        // (with a margin: a wave can rise under the board before it comes down)
        const zw = wave.z + 0.35, tl = (s.vz + Math.sqrt(Math.max(0, s.vz * s.vz + 2 * G * (s.z - zw)))) / G;
        // let-go and table-top are caught again just before touching the water (no wave margin here)
        const tl0 = (s.vz + Math.sqrt(Math.max(0, s.vz * s.vz + 2 * G * (s.z - wave.z)))) / G;
        const landing = tl0 < 0.2;
        // loops: one press = one full turn that completes on its own; keep the key held to chain turns,
        // added only while there is the height to finish them
        // taps queue loops: jump = forward, tack = back (a tap during the pop counts too, see below)
        if (input.jump) s.loopAsk -= 1;
        if (input.tack) s.loopAsk += 1;
        if (input.carve) s.letGo = Math.min(2, s.letGo + 1);
        const ask = Math.sign(s.loopAsk);
        const want = (input.up ? -1 : 0) + (input.down ? 1 : 0) || ask;
        if (want && (!s.loopDir || s.loopDir === want)) {
            const left = Math.abs(s.loopTarget - s.airPitch);
            if ((s.loopTarget === 0 || left < TAU * 0.5) && left + TAU <= LOOP_MAX * Math.max(0, tl - 0.12)) {
                s.loopDir = want; s.loopTarget += want * TAU;
                if (ask === want) s.loopAsk -= ask;
            }
        }
        if (ask && s.loopDir && ask !== s.loopDir) s.loopAsk = 0;          // the other way round: not in the same jump
        if (s.loopDir) {
            const left = s.loopTarget - s.airPitch;
            const rate = Math.min(LOOP_MAX, Math.max(LOOP_RATE, Math.abs(left) / Math.max(0.15, tl - 0.12)));
            s.airPitch += Math.sign(left) * Math.min(Math.abs(left), rate * dt);
        }
        // table-top / push: roll held with the arrows, brought back for the landing
        const rollTarget = landing ? 0 : ((input.left ? -1 : 0) + (input.right ? 1 : 0) || (input.jibeHeld ? -(Math.sign(s.twa) || s.lastSide) : 0));
        s.airRoll += (rollTarget * 1.15 - s.airRoll) * Math.min(1, dt * (landing ? 9 : 4));
        if (Math.abs(s.airRoll) > 0.85) s.tables = 1;
        if (s.loopDir === 1 && Math.abs(s.airRoll) > 0.5) s.pushed = true;
        // let go: back foot out of the strap, back hand off the boom (caught again for the landing)
        s.oneFoot = (!!input.oneFoot || s.letGo >= 1) && !landing; s.oneHand = (!!input.oneHand || s.letGo >= 2) && !landing;
        if (s.oneFoot) s.oneFootT += dt; if (s.oneHand) s.oneHandT += dt; if (s.oneFoot && s.oneHand) s.bothT += dt;
        s.speed *= 1 - dt * 0.15;
        if (s.z <= wave.z && s.vz < 0) {                         // touch down
            const n = Math.round(Math.abs(s.loopTarget) / TAU), dir = Math.sign(s.loopTarget);
            const off = Math.abs(s.airPitch - s.loopTarget), r = Math.abs(s.airRoll);
            const sloppy = off > 0.6 && off < 1.7 && r < 0.9;            // nearly round: lands it, hard
            if (!sloppy && (off > 0.6 || r > 0.6)) {
                s.mode = 'crash'; s.crashT = 2.6; award(s, 'crash', 0);
            } else {
                s.mode = 'sail';
                const h = s.maxZ;
                if (h > 0.6) award(s, 'jump', Math.round(h * 60), ` ${h.toFixed(1)} m`);
                if (n > 0) {
                    const fwd = dir < 0, k = Math.min(n, 4) - 1;
                    const name = (fwd ? ['Forward loop', 'Double forward', 'Triple forward', 'Quadruple forward']
                        : s.pushed ? ['Push loop', 'Double push loop', 'Triple push loop', 'Quadruple push loop']
                            : ['Back loop', 'Double back loop', 'Triple back loop', 'Quadruple back loop'])[k];
                    const pts = (fwd ? [600, 1500, 3000, 6000] : s.pushed ? [700, 1700, 3400, 6800] : [450, 1200, 2500, 5000])[k];
                    award(s, name, sloppy ? Math.round(pts / 2) : pts, sloppy ? ' (réception limite)' : '');
                }
                if (s.tables && !s.pushed) award(s, 'tabletop', 250);
                if (s.bothT > 0.25) award(s, 'noFootHand', 400);
                else {
                    if (s.oneFootT > 0.25) award(s, 'oneFooter', 150);
                    if (s.oneHandT > 0.25) award(s, 'oneHander', 120);
                }
            }
            s.airPitch = 0; s.loopTarget = 0; s.loopDir = 0; s.oneFoot = false; s.oneHand = false; s.loopAsk = 0; s.letGo = 0;
            s.z = wave.z; s.vz = 0; s.zsPrev = wave.z; s.vsPrev = 0; s.landT = LAND_TIME;   // legs absorb the landing
        }
    } else {
        // on the water: a manoeuvre in progress drives the heading, otherwise the arrows steer
        let jumpReq = input.jump;
        if (!s.man && !(s.popT > 0)) {
            const pick = manoeuvreFor(input, s);
            if (pick) { startManoeuvre(s, pick); jumpReq = false; }
        }
        const cr = craftOf(s);
        // pumping: below planing (or before the foil flies) the jump button pumps: a tap = one stroke (a tap during a stroke
        // queues the next one), held = strokes back to back. A stroke always runs to its end: the next starts where it ends.
        const wantPump = !s.planing && !s.man && s.mode === 'sail' && (input.jump || input.jumpHeld);
        if (wantPump && s.pumpT < 0) { s.pumpT = 0; s.pumpLift = Math.min(1.4, s.pumpLift + PUMP_LIFT); }
        else if (input.jump && s.pumpT >= 0) s.pumpNext = true;
        if (!s.planing) jumpReq = false;
        if (s.pumpT >= 0) {
            if (s.pumpT < PUMP_DRIVE * PUMP_DUR) s.speed += (cr.pump ?? 0.5) / (PUMP_DRIVE * PUMP_DUR) * dt;   // the pull drives
            s.pumpT += dt;
            if (s.man) { s.pumpT = -1; s.pumpNext = false; }
            else if (s.pumpT >= PUMP_DUR) {
                const again = !s.planing && (s.pumpNext || input.jumpHeld);
                s.pumpNext = false;
                if (again) { s.pumpT -= PUMP_DUR; s.pumpLift = Math.min(1.4, s.pumpLift + PUMP_LIFT); } else s.pumpT = -1;
            }
        }
        s.pumpLift = Math.max(0, s.pumpLift - PUMP_LIFT_DECAY * dt);
        let twa;
        if (s.man) {
            const m = s.man; m.t += dt; const u = Math.min(1, m.t / m.dur);
            const a = manTwa(m, u);
            s.heading = wrap(s.twd - a); twa = wrap(a); s.twa = twa; s.turn *= 1 - Math.min(1, dt * 4);
            s.speed += (m.v0 * manSpeed(m, u) - s.speed) * Math.min(1, dt * 2);
            if (u >= 1) finishManoeuvre(s);
        } else {
            const target = (input.left ? -1 : 0) + (input.right ? 1 : 0);
            s.turn += (target - s.turn) * Math.min(1, dt * 4);
            s.heading = wrap(s.heading + s.turn * (0.35 + Math.min(1, s.speed / 6) * 0.5) * dt);
            twa = wrap(s.twd - s.heading);
            // steering into the wind or dead downwind starts the matching manoeuvre
            const a = Math.abs(twa);
            if (a < 20 * D2R) { s.twa = twa; startManoeuvre(s, 'tack'); }
            else if (a > 168 * D2R) { s.twa = twa; startManoeuvre(s, 'jibe'); }
            s.twa = twa;
        }
        const k = polar(twa * 180 / Math.PI);
        // overpowered above ~20 kn: the rider sheets out, the speed no longer follows the wind (6.2 m2 sail, 5 m2 wing)
        const KNEE = 20 * KNOT, power = s.tws < KNEE ? s.tws : KNEE + (s.tws - KNEE) * 0.45;
        const targetSpeed = k * power * (s.planing ? 1 : cr.slow) * cr.polar;
        // planing, or the foil takes off (the wing needs a few pumps unless the wind is strong)
        const pumped = s.pumpLift >= 1;
        if (!s.planing && s.speed > cr.takeoff && k > 0.8 && (!cr.pumpToFly || pumped || s.tws > cr.selfLaunch)) {
            s.planing = true;
            if (cr.pumpToFly && pumped && s.tws <= cr.selfLaunch) award(s, 'pumpOff', 60);
            s.pumpLift = 0;
        }
        if (s.planing && s.speed < cr.drop) s.planing = false;
        const accel = targetSpeed > s.speed ? (s.planing ? 1.4 : 0.8) : 1.8;
        if (!s.man) s.speed += (targetSpeed - s.speed) * Math.min(1, dt * accel * 0.5);
        s.speed = Math.max(0, s.speed);
        // surfing: gravity along the wave face (faster down the face, slower up it)
        if (!s.man) s.speed = Math.max(0, s.speed - G * slopeBow * 0.55 * dt);
        if (slopeBow < -0.08 && s.speed > 5) {
            s.surfT += dt;
            if (s.surfT > 1.6 && !s.surfed) { s.surfed = true; award(s, 'surf', 120); }
            if (s.surfT > 0.8 && Math.abs(s.turn) > 0.7 && !s.turned) { s.turned = true; award(s, 'bottomTurn', 150); }
        } else if (slopeBow > 0.05) { s.surfT = 0; s.surfed = false; s.turned = false; }
        // ramp ahead: the face rises in front of the board (jump now)
        s.ramp = s.speed > 5 && slopeBow > 0.09;
        // board on the water: height and attitude from the waves
        const planeLift = s.planing && !cr.foil ? 0.04 : 0;
        // foil: the board flies above the water and only follows the long waves, softly
        const flying = cr.foil && s.planing, follow = flying ? 0.35 : 1;
        s.fh += ((flying ? cr.foil : 0) - s.fh) * Math.min(1, dt * 1.5);
        s.z += (wave.z * follow + planeLift - s.z) * Math.min(1, dt * (flying ? 3 : 12));
        s.pitch += (Math.atan(slopeBow) * 0.9 * follow - s.pitch) * Math.min(1, dt * 6);
        s.roll += (Math.atan(slopeSide) * 0.5 * follow - s.roll) * Math.min(1, dt * 4);
        // vertical speed of the water under the moving board (wave motion + running up a face)
        const zs = wave.z, vs = s.zsPrev === undefined ? 0 : (zs - s.zsPrev) / dt;
        const accS = s.vsPrev === undefined ? 0 : (vs - s.vsPrev) / dt;
        s.zsPrev = zs; s.vsPrev = vs;
        // jump: a small pop on flat water, a launch off a wave face (the steeper and faster, the higher);
        // fast over a sharp crest the board also takes off on its own
        // jump in three beats: load (crouch, tail pressed, nose up), pop, then the board is pulled up under the rider
        if (input.jump && s.popT > 0) s.loopAsk -= 1;                    // double tap: the second one is a forward loop
        if (jumpReq && s.speed > 1.5 && !s.man && !(s.popT > 0)) { s.popT = POP_TIME; s.loopAsk = 0; s.letGo = 0; }
        let popped = false;
        if (s.popT > 0) {
            s.popT -= dt; s.pitch += (0.14 - s.pitch) * Math.min(1, dt * 14);
            if (s.popT <= 0) { s.popT = 0; popped = true; }
        }
        if (s.landT > 0) s.landT = Math.max(0, s.landT - dt);
        s.load = s.popT > 0 ? 1 - s.popT / POP_TIME * 0.3 : s.landT / LAND_TIME;
        const crest = !s.man && s.planing && !cr.foil && vs > 1.2 && accS < -G * 1.1;
        if (popped || crest) {
            s.mode = 'air';
            // a real jump anywhere (about 1 m, 1 s), much higher off a wave face
            s.vz = popped ? (3.8 + 0.12 * s.speed + Math.max(0, vs) * 1.0 + Math.max(0, slopeBow) * s.speed * 0.9) * (cr.jump ?? 1) : vs;
            s.airTime = 0; s.maxZ = 0; s.tables = 0; s.airPitch = 0; s.loopTarget = 0; s.loopDir = 0; s.airRoll = 0; s.pushed = false;
            s.oneFootT = 0; s.oneHandT = 0; s.bothT = 0; s.ramp = false; s.load = 0;
        }
    }
    const slip = (1 - Math.min(1, s.speed / 5)) * 0.15 * Math.sign(s.twa);
    const course = s.heading - slip;
    s.x += Math.sin(course) * s.speed * dt;
    s.y += Math.cos(course) * s.speed * dt;
    s.distance += s.speed * dt;
    s.topSpeed = Math.max(s.topSpeed, s.speed);
};
