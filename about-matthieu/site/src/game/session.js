// Game layer on top of the physics: modes (freestyle score attack, slalom time trial, free ride), combos,
// challenges and records. Pure functions and plain objects (no React, no three.js) so it can be tested in Node.
import { KNOT } from './physics.js';

export const MODES = {
    freestyle: { label: 'Freestyle', blurb: '2 minutes pour le meilleur score. Enchaîne les figures : le combo multiplie les points, varier rapporte plus.', time: 120 },
    slalom: { label: 'Slalom', blurb: 'Parcours de bouées contre la montre : de grands largues et un empannage à chaque bouée.' },
    ride: { label: 'Balade', blurb: 'Navigation libre, sans chrono. Les défis restent actifs.' },
};

// ---------------------------------------------------------------- slalom course
// Wind from the west (physics twd = -pi/2): the course zigzags downwind (east), one broad reach per leg,
// a jibe round each mark. Marks in metres (east, north) from the start.
export const COURSE = [
    { x: 0, y: 60, kind: 'start' },
    { x: 70, y: 190 }, { x: 150, y: 40 }, { x: 230, y: 190 }, { x: 310, y: 40 }, { x: 390, y: 190 },
    { x: 470, y: 110, kind: 'finish' },
];
export const MARK_RADIUS = 16;

/** Bearing (compass rad) and distance from the board to a point. */
export const toward = (s, p) => {
    const dx = p.x - s.x, dy = p.y - s.y;
    return { dist: Math.hypot(dx, dy), bearing: Math.atan2(dx, dy) };
};

// ---------------------------------------------------------------- challenges
// test(ctx): ctx = { s, ev (the event just scored, if any), sess (this session), mode, craft }
export const CHALLENGES = [
    { id: 'plane20', label: 'Planer à 20 nœuds', test: ({ s }) => s.speed / KNOT >= 20 },
    { id: 'speed28', label: 'Pointe à 28 nœuds', test: ({ s }) => s.speed / KNOT >= 28 },
    { id: 'jump2', label: 'Saut de 2 m', test: ({ ev }) => ev?.key === 'jump' && ev.h >= 2 },
    { id: 'jump35', label: 'Saut de 3,5 m (prends une vague)', test: ({ ev }) => ev?.key === 'jump' && ev.h >= 3.5 },
    { id: 'forward', label: 'Forward loop', test: ({ ev }) => /^Forward/.test(ev?.text ?? '') },
    { id: 'double', label: 'Double forward', test: ({ ev }) => /^Double forward/.test(ev?.text ?? '') },
    { id: 'push', label: 'Push loop', test: ({ ev }) => /push loop/i.test(ev?.text ?? '') },
    { id: 'nofoot', label: 'Lâcher pied + main en l\'air', test: ({ ev }) => ev?.key === 'noFootHand' },
    { id: 'planingJibe', label: 'Empannage planant', test: ({ ev }) => ev?.key === 'planingJibe' },
    { id: 'duck', label: 'Duck jibe', test: ({ ev }) => ev?.key === 'duck' },
    { id: 'heli', label: 'Hélitack', test: ({ ev }) => ev?.key === 'heli' },
    { id: 'vulcan', label: 'Vulcan', test: ({ ev }) => ev?.key === 'vulcan' },
    { id: 'spock', label: 'Spock', test: ({ ev }) => ev?.key === 'spock' },
    { id: 'combo5', label: 'Combo ×5', test: ({ sess }) => sess.combo >= 5 },
    { id: 'sharkJump', label: 'Sauter par-dessus un requin de Tintin', test: ({ ev }) => ev?.key === 'sharkJump' },
    { id: 'free5k', label: 'Freestyle : 10 000 points', test: ({ sess, mode }) => mode === 'freestyle' && sess.score >= 10000 },
    { id: 'free15k', label: 'Freestyle : 30 000 points', test: ({ sess, mode }) => mode === 'freestyle' && sess.score >= 30000 },
    { id: 'slalom', label: 'Slalom : finir le parcours', test: ({ sess, mode }) => mode === 'slalom' && sess.finished },
    { id: 'slalom90', label: 'Slalom : moins de 1 min 30', test: ({ sess, mode }) => mode === 'slalom' && sess.finished && sess.time < 90 },
    { id: 'wingFly', label: 'Wing : 30 s de vol d\'affilée', test: ({ sess, craft }) => craft === 'wing' && sess.flyRun >= 30 },
    { id: 'wingTack', label: 'Wing : virer sans toucher l\'eau', test: ({ ev, craft, s }) => craft === 'wing' && ev?.key === 'tack' && s.planing },
];

// ---------------------------------------------------------------- persistence (per browser; the game works without it)
const KEY = 'about-matthieu.windsurf.v1';
export const loadSave = () => {
    try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { done: {}, best: {}, ...v }; } catch { return { done: {}, best: {} }; }
};
export const storeSave = (save) => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode: keep in memory */ } };

// ---------------------------------------------------------------- session
export const newSession = (mode) => ({
    mode, score: 0, combo: 0, mult: 1, lastTrick: -99, recent: [], time: 0, left: MODES[mode]?.time ?? null,
    mark: mode === 'slalom' ? 0 : null, splits: [], started: mode !== 'slalom', finished: false, over: false,
    flyRun: 0, maxSpeed: 0, maxJump: 0, tricks: 0, seen: new Set(), popups: [], newDone: [],
});

const COMBO_WINDOW = 4.5;          // s between two tricks to keep the combo going

/** Points of one physics event in this session: combo multiplier, and less for a trick repeated just before. */
const scoreEvent = (sess, ev, t) => {
    if (ev.key === 'crash') { sess.combo = 0; sess.mult = 1; return 0; }
    if (!ev.pts || ev.bad) return 0;
    sess.combo = t - sess.lastTrick < COMBO_WINDOW ? sess.combo + 1 : 1;
    sess.lastTrick = t;
    sess.mult = Math.min(5, 1 + 0.5 * (sess.combo - 1));
    const repeats = sess.recent.filter((k) => k === ev.text.split(' ')[0] + ev.key).length;
    sess.recent.push(ev.text.split(' ')[0] + ev.key); if (sess.recent.length > 6) sess.recent.shift();
    const variety = 1 / (1 + repeats);
    return Math.round(ev.pts * sess.mult * variety);
};

/**
 * Advance the session after a physics step. Mutates sess and save; returns true when something worth
 * re-rendering happened (score, mark, challenge, end).
 */
export const updateSession = (sess, s, save, dt, craft) => {
    if (sess.over) return false;
    let changed = false;
    if (sess.started) sess.time += dt;
    sess.maxSpeed = Math.max(sess.maxSpeed, s.speed);
    sess.flyRun = craft === 'wing' && s.planing && s.mode !== 'crash' ? sess.flyRun + dt : 0;
    // physics events not handled yet (the physics keeps the last few)
    const fresh = s.events.filter((e) => !sess.seen.has(e.id));
    sess.seen = new Set(s.events.map((e) => e.id));
    const events = [];
    for (const ev of fresh) {
        const h = ev.key === 'jump' ? parseFloat(ev.text.replace(/[^0-9.]/g, '')) || 0 : 0;
        const e = { ...ev, h };
        if (h) sess.maxJump = Math.max(sess.maxJump, h);
        if (sess.mode === 'freestyle') {
            const pts = scoreEvent(sess, e, s.time);
            if (pts) { sess.score += pts; sess.tricks += 1; sess.popups.push({ id: e.id, text: e.text, pts, mult: sess.mult, t: s.time }); }
            else if (e.key === 'crash') sess.popups.push({ id: e.id, text: `${e.text} Combo perdu`, pts: 0, bad: true, t: s.time });
        } else {
            sess.popups.push({ id: e.id, text: e.text, pts: e.pts, bad: e.bad, t: s.time });
            if (!e.bad && e.pts) { sess.score += e.pts; sess.tricks += 1; }
        }
        events.push(e); changed = true;
    }
    sess.popups = sess.popups.filter((p) => s.time - p.t < 3);
    // slalom: pass each mark in order; the clock starts at the start mark
    if (sess.mode === 'slalom' && !sess.finished) {
        const m = COURSE[sess.mark];
        if (toward(s, m).dist < MARK_RADIUS) {
            if (m.kind === 'start') sess.started = true;
            else sess.splits.push(sess.time);
            sess.mark += 1; changed = true;
            sess.popups.push({ id: `mark${sess.mark}`, text: m.kind === 'start' ? 'Top départ !' : m.kind === 'finish' ? 'Arrivée !' : `Bouée ${sess.mark - 1}`, pts: 0, t: s.time, mark: true });
            if (m.kind === 'finish') { sess.finished = true; sess.over = true; }
        }
    }
    // freestyle: the clock
    if (sess.left !== null) {
        sess.left = Math.max(0, MODES[sess.mode].time - sess.time);
        if (sess.left <= 0) sess.over = true;
    }
    // challenges: on each event, and continuously (speed, combo, flight)
    for (const c of CHALLENGES) {
        if (save.done[c.id]) continue;
        const ok = events.some((ev) => c.test({ s, ev, sess, mode: sess.mode, craft })) || c.test({ s, ev: null, sess, mode: sess.mode, craft });
        if (ok) {
            save.done[c.id] = Date.now(); sess.newDone.push(c.id); changed = true;
            sess.popups.push({ id: `ch-${c.id}`, text: `Défi réussi : ${c.label}`, pts: 0, t: s.time, challenge: true });
        }
    }
    if (sess.over) {
        const key = `${sess.mode}:${craft}`; const prev = save.best[key];
        if (sess.mode === 'freestyle' && (!prev || sess.score > prev)) { save.best[key] = sess.score; sess.record = true; }
        if (sess.mode === 'slalom' && sess.finished && (!prev || sess.time < prev)) { save.best[key] = sess.time; sess.record = true; }
        sess.prevBest = prev ?? null; changed = true;
    }
    if (sess.maxSpeed > (save.best[`speed:${craft}`] ?? 0)) save.best[`speed:${craft}`] = sess.maxSpeed;
    return changed;
};

export const fmtTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
