// Tintin sharks (the one from Red Rackham's Treasure, built for real): they cruise around the board and must be
// avoided. Hitting one is a fall; jumping over one scores. Plain logic, frame: x east, y north (m), like physics.js.

import { tr } from '../i18n.js';

const TAU = Math.PI * 2;
export const SHARK_LEN = 3.6;                     // m, nose to tail
const HALF = SHARK_LEN / 2;
const KEEP = 4;                                   // sharks around the board
const rand = (a, b) => a + Math.random() * (b - a);

export const createSharks = () => ({ list: [], nextId: 1 });

/** Distance from point (px, py) to the shark's body segment. */
const segDist = (sh, px, py) => {
    const dx = Math.sin(sh.h), dy = Math.cos(sh.h);
    const t = Math.max(-HALF, Math.min(HALF, (px - sh.x) * dx + (py - sh.y) * dy));
    return Math.hypot(px - (sh.x + dx * t), py - (sh.y + dy * t));
};

const spawn = (pack, s, first) => {
    const fx = Math.sin(s.heading), fy = Math.cos(s.heading);
    const ahead = first ? rand(45, 140) : rand(110, 170), side = rand(-55, 55);
    pack.list.push({
        id: pack.nextId++, x: s.x + fx * ahead + fy * side, y: s.y + fy * ahead - fx * side,
        h: rand(0, TAU), v: rand(1.8, 3.4), phase: rand(0, TAU), jumped: false,
    });
};

/**
 * Move the sharks, keep a few around, and check the board against them. Pushes physics-style events
 * (key 'crash' for a hit, 'sharkJump' for a jump over) into s.events. Sets s.sharkAhead (m) when one is close ahead.
 */
export const updateSharks = (pack, s, dt) => {
    if (!pack.list.length) for (let i = 0; i < KEEP; i++) spawn(pack, s, true);
    const fx = Math.sin(s.heading), fy = Math.cos(s.heading);
    let ahead = null;
    for (const sh of pack.list) {
        sh.phase += dt;
        sh.h += Math.sin(sh.phase * 0.27 + sh.id) * 0.12 * dt;              // lazy wandering
        sh.x += Math.sin(sh.h) * sh.v * dt; sh.y += Math.cos(sh.h) * sh.v * dt;
        const d = segDist(sh, s.x, s.y);
        const along = (sh.x - s.x) * fx + (sh.y - s.y) * fy;
        if (along > 0 && along < 35 && Math.abs((sh.x - s.x) * fy - (sh.y - s.y) * fx) < 6) ahead = ahead === null ? along : Math.min(ahead, along);
        if (s.mode === 'air') {
            if (d < 2.6 && !sh.jumped && s.airTime > 0.12) {
                sh.jumped = true;
                s.score += 500;
                s.events.push({ id: s.time + Math.random(), key: 'sharkJump', text: tr('Par-dessus le requin !', 'Over the shark!'), pts: 500, t: s.time, bad: false });
            }
        } else if (s.mode === 'sail' && d < 1.25) {
            s.mode = 'crash'; s.crashT = 2.6; s.man = null; s.loopTarget = 0; s.airPitch = 0;
            s.events.push({ id: s.time + Math.random(), key: 'crash', text: tr('Croqué par le requin de Tintin !', 'Bitten by the Tintin shark!'), pts: 0, t: s.time, bad: true });
            sh.h += Math.PI * 0.6;                                          // it swims off
        }
        if (d > 6) sh.jumped = false;
    }
    if (s.events.length > 6) s.events.splice(0, s.events.length - 6);
    s.sharkAhead = ahead;
    // far behind: respawn ahead
    pack.list = pack.list.filter((sh) => Math.hypot(sh.x - s.x, sh.y - s.y) < 240);
    while (pack.list.length < KEEP) spawn(pack, s, false);
};
