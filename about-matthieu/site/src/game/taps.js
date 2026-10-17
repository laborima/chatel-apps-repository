// Multi-tap buttons: on the water, tapping Virer / Empanner / 360 once, twice or three times in a row picks the figure
// (see TAPS in physics.js). The first tap waits a moment for the next one; it fires at once when no other figure is
// possible (the wing, or the third tap). In the air, or while popping a jump, every tap goes straight through.
import { TAPS, canDo } from './physics.js';

export const TAP_MS = 320;

export const createTaps = () => {
    const t = { pending: null };
    const fire = (input) => {
        const p = t.pending; if (!p) return;
        input[p.kinds[p.n - 1]] = true; t.pending = null;
    };
    /** A press of button k ('tack' | 'jibe' | 'carve') at time now (ms). input: the input object the physics reads. */
    t.press = (k, s, input, now) => {
        if (s.mode !== 'sail' || s.popT > 0 || s.man || !TAPS[k]) { fire(input); input[k] = true; return; }
        const kinds = TAPS[k].filter((kind, i) => i === 0 || canDo(s, kind));
        const p = t.pending;
        if (p && p.k === k && now - p.t < TAP_MS) { p.n = Math.min(kinds.length, p.n + 1); p.t = now; }
        else { fire(input); t.pending = { k, n: 1, t: now, kinds }; }
        if (t.pending.n >= kinds.length) fire(input);
    };
    /** Every frame: a tap left alone long enough becomes its figure. */
    t.tick = (input, now) => { if (t.pending && now - t.pending.t >= TAP_MS) fire(input); };
    /** What is being counted, for the HUD: { k, n, kind } or null. */
    t.status = () => (t.pending ? { k: t.pending.k, n: t.pending.n, kind: t.pending.kinds[t.pending.n - 1] } : null);
    t.reset = () => { t.pending = null; };
    return t;
};
