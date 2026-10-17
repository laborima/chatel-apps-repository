// Demo autopilot: chains every figure the current craft can do, showing its name and keys. It drives the
// physics with the same inputs a player would give (so it also checks that every figure works).
import { canDo, craftOf } from './physics.js';

const D2R = Math.PI / 180;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// name, keys: [French, English]. kind: 'man' (manoeuvre on the water), 'jump' (in the air: held keys), 'pump' (pump until the foil flies)
export const DEMO_STEPS = [
    { id: 'pump', name: ['Pumping : décoller', 'Pumping: take off'], keys: ['Pomper en rythme (ou garder appuyé)', 'Pump in rhythm (or hold it)'], kind: 'pump' },
    { id: 'tack', name: ['Virement', 'Tack'], keys: ['Virer', 'Tack'], kind: 'man', input: { tack: true } },
    { id: 'jibe', name: ['Empannage planant', 'Planing jibe'], keys: ['Empanner', 'Jibe'], kind: 'man', input: { jibe: true }, planing: true },
    { id: 'jump', name: ['Saut', 'Jump'], keys: ['Saut', 'Jump'], kind: 'jump', air: {} },
    { id: 'forward', name: ['Forward loop', 'Forward loop'], keys: ['Saut ×2 (puis Forward)', 'Jump ×2 (then Forward)'], kind: 'jump', air: { up: true }, hold: 0.25 },
    { id: 'back', name: ['Back loop', 'Back loop'], keys: ['Saut, puis Back', 'Jump, then Back'], kind: 'jump', air: { down: true }, hold: 0.25 },
    { id: 'table', name: ['Table-top', 'Table-top'], keys: ['Saut, puis garder Table', 'Jump, then hold Table'], kind: 'jump', air: { right: true }, until: 'apex' },
    { id: 'foot', name: ['One-footer (lâcher un pied)', 'One-footer (one foot out)'], keys: ['Saut, puis Lâcher', 'Jump, then Let go'], kind: 'jump', air: { oneFoot: true }, until: 'land' },
    { id: 'hand', name: ['One-hander (lâcher une main)', 'One-hander (one hand off)'], keys: ['Saut, puis G (clavier) ou R1', 'Jump, then G (keyboard) or R1'], kind: 'jump', air: { oneHand: true }, until: 'land' },
    { id: 'nofoot', name: ['Lâcher pied + main', 'No foot, no hand'], keys: ['Saut, puis Lâcher ×2', 'Jump, then Let go ×2'], kind: 'jump', air: { oneFoot: true, oneHand: true }, until: 'land' },
    { id: 'push', name: ['Push loop', 'Push loop'], keys: ['Saut, puis Back en gardant Table', 'Jump, then Back while holding Table'], kind: 'jump', air: { down: true, right: true }, hold: 0.35 },
    { id: 'double', name: ['Double forward (sur une vague)', 'Double forward (off a wave)'], keys: ['Saut sur « Rampe ! », puis Forward ×2', 'Jump on “Ramp!”, then Forward ×2'], kind: 'jump', air: { up: true }, until: 'land', ramp: true },
    { id: 'carve', name: ['Carving 360', 'Carve 360'], keys: ['360', '360'], kind: 'man', input: { carve: true }, planing: true },
    { id: 'duck', name: ['Duck jibe', 'Duck jibe'], keys: ['Empanner ×2', 'Jibe ×2'], kind: 'man', input: { duck: true }, planing: true },
    { id: 'heli', name: ['Hélitack', 'Helitack'], keys: ['Virer ×2', 'Tack ×2'], kind: 'man', input: { heli: true } },
    { id: 'airjibe', name: ['Air jibe', 'Air jibe'], keys: ['Empanner ×3', 'Jibe ×3'], kind: 'man', input: { airjibe: true }, planing: true },
    { id: 'vulcan', name: ['Vulcan', 'Vulcan'], keys: ['360 ×2', '360 ×2'], kind: 'man', input: { vulcan: true }, planing: true },
    { id: 'spock', name: ['Spock', 'Spock'], keys: ['360 ×3', '360 ×3'], kind: 'man', input: { spock: true }, planing: true },
    { id: 'flaka', name: ['Flaka', 'Flaka'], keys: ['Virer ×3', 'Tack ×3'], kind: 'man', input: { flaka: true }, planing: true },
];

/** The steps the craft can do (the wing has no duck jibe / helitack / freestyle spins). */
export const demoSteps = (s) => DEMO_STEPS.filter((st) => st.kind === 'jump' || (st.kind === 'pump' ? craftOf(s).pumpToFly : canDo(s, st.id)));

/**
 * Autopilot. next(s, dt) returns the input for this step and keeps { step, label, keys, phase } for the HUD.
 * Between figures it steers a fast beam-to-broad reach and waits to be planing and settled.
 */
export const createDemo = (s0) => {
    const steps = demoSteps(s0);
    const d = { i: 0, phase: 'prep', t: 0, airT: 0, wasAir: false, steps, done: false, results: [] };
    d.current = () => steps[Math.min(d.i, steps.length - 1)];
    const steer = (s, twaWant) => {
        const side = Math.sign(s.twa) || -1; const err = wrapA(side * twaWant - s.twa);
        // twa = twd - heading: to increase twa, decrease heading (turn left)
        return err > 0.05 ? { left: true } : err < -0.05 ? { right: true } : {};
    };
    d.next = (s, dt) => {
        if (d.done) return {};
        const st = d.current(); d.t += dt;
        const inp = {};
        if (st.kind === 'pump') {
            // pump in rhythm (button held) on a beam reach until the foil flies
            Object.assign(inp, steer(s, 95 * D2R), { jumpHeld: !s.planing });
            if (s.planing && d.t > 1) { d.results.push({ id: st.id, ok: true }); d.i += 1; d.t = 0; }
            if (d.t > 25) { d.results.push({ id: st.id, ok: false, why: 'pas décollé' }); d.i += 1; d.t = 0; }
            if (d.i >= steps.length) d.done = true;
            return inp;
        }
        // between figures, the wing pumps back up onto the foil after a touch-down
        if (!s.planing && craftOf(s).pumpToFly && s.mode === 'sail' && !s.man) inp.jumpHeld = true;
        if (d.phase === 'prep') {
            // settle: on the water, no manoeuvre, fast (planing when needed), for a moment
            Object.assign(inp, steer(s, (st.planing || st.kind === 'jump' ? 110 : 95) * D2R));
            const ready = s.mode === 'sail' && !s.man && (!st.planing || s.planing) && s.speed > (st.kind === 'jump' ? 5 : 2.5) && d.t > 2.2;
            const rampOk = !st.ramp || s.ramp || d.t > 16;
            if (ready && rampOk) {
                d.phase = 'go'; d.t = 0;
                if (st.kind === 'man') Object.assign(inp, st.input);
                else inp.jump = true;
            }
            if (d.t > 25) { d.results.push({ id: st.id, ok: false, why: 'pas prêt' }); d.i += 1; d.t = 0; }
            return inp;
        }
        // go
        if (st.kind === 'man') {
            if (!s.man && d.t > 0.5) { d.results.push({ id: st.id, ok: true }); d.i += 1; d.phase = 'prep'; d.t = 0; }
        } else {
            if (s.mode === 'air') {
                d.wasAir = true; d.airT += dt;
                const holdOk = st.until === 'land' || (st.until === 'apex' ? s.vz > 0 : d.airT < (st.hold ?? 0.3));
                if (holdOk) Object.assign(inp, st.air);
            } else if (d.wasAir || d.t > 3) {
                d.results.push({ id: st.id, ok: d.wasAir && s.mode !== 'crash' });
                d.wasAir = false; d.airT = 0; d.i += 1; d.phase = 'prep'; d.t = 0;
            }
        }
        if (d.i >= steps.length) d.done = true;
        return inp;
    };
    return d;
};
