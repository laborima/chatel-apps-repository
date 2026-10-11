import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import Sea from './sea/Sea';
import Windsurfer, { MODEL_URL } from './Windsurfer';
import Course from './Course';
import Spray from './Spray';
import { createAudio } from './audio';
import { MODES, COURSE, CHALLENGES, newSession, updateSession, loadSave, storeSave, toward, fmtTime } from './session';
import { createDemo } from './demo';
import { MainMenu, EndScreen } from './Menus';

export const MODEL_URLS = { windsurf: MODEL_URL, wing: `${import.meta.env.BASE_URL}models/wingfoil.glb` };
import { initialState, step, KNOT, SEA_STATES, MANOEUVRES, COMBOS, CRAFTS, canDo, seaParams } from './physics';

const deg = (r) => Math.round(((r * 180 / Math.PI) % 360 + 360) % 360);
const FREESTYLE = [['heli', 'Hélitack', 'H'], ['airjibe', 'Air jibe', 'J'], ['vulcan', 'Vulcan', 'U'], ['spock', 'Spock', 'K'], ['flaka', 'Flaka', 'L']];
// ↑ / ↓ stay valid as combo modifiers a moment after release (pressing both keys together is never exact)
const LATCH_MS = 300;
const release = (input, k) => {
    input.current[k] = false;
    if (k === 'up' || k === 'down') { input.current[`${k}Latch`] = performance.now() + LATCH_MS; }
};
const EDGE = ['start', 'jump', 'tack', 'jibe', 'duck', 'carve', ...FREESTYLE.map((f) => f[0])];   // one-shot inputs, cleared after each step

// PlayStation (or any "standard" mapping) controller: button index -> input
const PAD_BUTTONS = { 0: 'jump', 1: 'jibe', 2: 'tack', 3: 'carve', 4: 'oneFoot', 5: 'oneHand', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const PAD_HELD = ['up', 'down', 'left', 'right', 'oneFoot', 'oneHand'];
/** Reads the first connected gamepad: held keys, edges for the one-shot actions, rumble on landings and falls. */
const usePad = () => {
    const prev = useRef({}); const held = useRef({}); const seen = useRef(0);
    const poll = (input, s) => {
        const gp = [...(navigator.getGamepads?.() || [])].find((g) => g && g.connected);
        if (!gp) { held.current = {}; return null; }
        const now = performance.now(); const h = {};
        Object.entries(PAD_BUTTONS).forEach(([i, k]) => {
            const down = !!gp.buttons[i]?.pressed;
            if (PAD_HELD.includes(k)) h[k] = down;
            else if (down && !prev.current[i]) input.current[k] = true;          // edge: one press = one action
            prev.current[i] = down;
        });
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
        h.left = h.left || ax < -0.35; h.right = h.right || ax > 0.35;
        h.up = h.up || ay < -0.55; h.down = h.down || ay > 0.55;
        ['up', 'down'].forEach((k) => { if (held.current[k] && !h[k]) input.current[`${k}Latch`] = now + LATCH_MS; });
        held.current = h;
        // rumble: light on a landed trick, strong on a fall
        if (s.events.length && s.events[s.events.length - 1].id !== seen.current) {
            const e = s.events[s.events.length - 1]; seen.current = e.id;
            gp.vibrationActuator?.playEffect?.('dual-rumble', { duration: e.bad ? 380 : 120, strongMagnitude: e.bad ? 1 : 0.35, weakMagnitude: e.bad ? 0.8 : 0.5 }).catch?.(() => {});
        }
        return h;
    };
    return poll;
};

/** Simulation tick + chase camera on the windward side (it swings across on a tack), following jumps.
 *  view: ref { yaw, pitch, dist } set by the fingers / mouse (orbit around the rider, zoom). */
const Rig = ({ state, input, view, onTick, game }) => {
    const { camera } = useThree(); const pad = usePad(); const lastMode = useRef('sail'); const heard = useRef(new Set());
    const side = useRef(-1); const look = useRef(new THREE.Vector3()); const acc = useRef(0); const target = useRef(new THREE.Vector3());
    useFrame((_, delta) => {
        const dt = Math.min(delta, 0.05); const s = state.current;
        const now = performance.now(), p = pad(input, s) || {};
        const inp = { ...input.current }; PAD_HELD.forEach((k) => { inp[k] = inp[k] || !!p[k]; });
        const g = game.current; const playing = g.phase === 'play';
        if (input.current.start) g.onStartKey();
        // in the menu and on the result screen the board just sails on (no input)
        const demo = playing && g.demo;
        const user = { ...inp, upMod: inp.up || (inp.upLatch ?? 0) > now, downMod: inp.down || (inp.downLatch ?? 0) > now };
        step(s, demo ? g.demo.next(s, dt) : playing ? user : {}, dt);
        if (demo && !view.current.active) view.current.yaw += (0.45 * Math.sin(s.time * 0.12) - view.current.yaw) * Math.min(1, dt * 0.5);
        EDGE.forEach((k) => { input.current[k] = false; });
        // sound: wind and water every frame, effects on take-off, landing, fall, tricks, marks, challenges
        g.audio.update(s);
        if (s.mode !== lastMode.current) g.audio.sfx(s.mode === 'air' ? 'jump' : s.mode === 'crash' ? 'crash' : 'land');
        lastMode.current = s.mode;
        if (playing) {
            const sess = g.session;
            updateSession(sess, s, g.demo ? g.demoSave : g.save, dt, g.craft);
            if (g.demo?.done) { g.demo.doneT = (g.demo.doneT ?? 0) + dt; if (g.demo.doneT > 3) g.onDemoEnd(); }
            for (const p of sess.popups) {
                if (heard.current.has(p.id)) continue;
                heard.current.add(p.id);
                g.audio.sfx(p.challenge ? 'challenge' : p.mark ? 'mark' : p.bad ? null : p.mult >= 2 ? 'combo' : 'trick');
            }
            if (heard.current.size > 200) heard.current = new Set(sess.popups.map((p) => p.id));
            if (sess.over) g.onEnd();
        }
        const sd = s.man ? s.man.side : (s.twa ?? -1) > 0 ? 1 : -1;
        side.current += (sd - side.current) * Math.min(1, dt * 1.2);
        const back = 7.5 + s.speed * 0.25;
        look.current.set(0, 1.3 + s.z * 0.8, -0.8);
        // chase position, then orbit it around the look point by the user's yaw / pitch / zoom
        const ox = 4.5 * side.current, oy = 1.3 + s.speed * 0.05 - s.z * 0.1, oz = back + 0.8;
        const r = Math.hypot(ox, oy, oz) * view.current.dist;
        const az = Math.atan2(ox, oz) + view.current.yaw;
        const el = Math.min(1.45, Math.max(0.02, Math.asin(oy / Math.hypot(ox, oy, oz)) + view.current.pitch));
        target.current.set(look.current.x + r * Math.cos(el) * Math.sin(az), look.current.y + r * Math.sin(el), look.current.z + r * Math.cos(el) * Math.cos(az));
        // never inside a wave: stay above the crests, whatever the orbit
        const w = seaParams(s); target.current.y = Math.max(target.current.y, w.swellAmp + w.amp * 0.5 + 1.0);
        camera.position.lerp(target.current, Math.min(1, dt * (view.current.active ? 12 : 2)));
        camera.lookAt(look.current);
        acc.current += dt;
        if (acc.current > 0.1) {
            acc.current = 0; const sess = game.current.session;
            const dm = game.current.demo;
            onTick({
                s: { ...s, events: [...s.events] }, sess: sess ? { ...sess, popups: [...sess.popups], splits: [...sess.splits] } : null,
                demo: dm ? { i: Math.min(dm.i, dm.steps.length - 1), n: dm.steps.length, step: dm.current(), done: dm.done } : null,
            });
        }
    });
    return null;
};

const Settings = ({ wind, sea, craft, onChange, onCraft, ready }) => (
    <details className="settings">
        <summary>Mer et vent</summary>
        <div className="seas" role="radiogroup" aria-label="Sport">
            {Object.entries(CRAFTS).map(([k, v]) => (
                <button key={k} role="radio" aria-checked={craft === k} className={craft === k ? 'on' : ''} disabled={!ready[k]} onClick={() => onCraft(k)}>
                    {v.label}{ready[k] ? '' : ' (chargement…)'}
                </button>
            ))}
        </div>
        <label htmlFor="wind">Vent : <b>{wind} nœuds</b></label>
        <input id="wind" type="range" min="8" max="35" step="1" value={wind} onChange={(e) => onChange({ wind: Number(e.target.value), sea })} />
        <div className="seas" role="radiogroup" aria-label="État de la mer">
            {Object.entries(SEA_STATES).map(([k, v]) => (
                <button key={k} role="radio" aria-checked={sea === k} className={sea === k ? 'on' : ''} onClick={() => onChange({ wind, sea: k })}>{v.label}</button>
            ))}
        </div>
    </details>
);

// Keys, as on the keyboard and on the touch buttons
const CAP = { up: '↑', down: '↓', jump: 'Espace', tack: 'V', jibe: 'E', carve: 'C' };
const PAD = { jump: 'Saut', tack: 'Virer', jibe: 'Empanner', carve: '360' };
const NAMES = { tack: 'Virement', jibe: 'Empannage', carve: 'Carving 360', duck: 'Duck jibe', heli: 'Hélitack', airjibe: 'Air jibe', vulcan: 'Vulcan', spock: 'Spock', flaka: 'Flaka' };
const AIR = [['↑', 'Forward loop — garder appuyé : double, triple'], ['↓', 'Back loop'], ['↓ + ← / →', 'Push loop'], ['← / →', 'Table-top'],
    ['F', 'Lâcher un pied'], ['G', 'Lâcher une main'], ['F + G', 'Lâcher pied + main']];
const Keys = ({ k }) => k.map((x, i) => <React.Fragment key={x}>{i ? ' + ' : ''}<kbd>{x}</kbd></React.Fragment>);
const comboKeys = ([mod, act]) => (mod ? [CAP[mod], CAP[act]] : [CAP[act]]);

/** Legend of every figure and the keys that make it. */
const Legend = ({ s }) => (
    <details className="legend">
        <summary>Figures</summary>
        <h4>Sur l'eau</h4>
        <ul>
            <li><Keys k={['Espace']} /> Saut</li>
            {COMBOS.filter((c) => canDo(s, c[2])).map((c) => <li key={c[2]}><Keys k={comboKeys(c)} /> {NAMES[c[2]]}{MANOEUVRES[c[2]]?.planing ? <i> · au planing</i> : null}</li>)}
        </ul>
        <h4>En l'air</h4>
        <ul>{AIR.map(([k, t]) => <li key={k}><Keys k={[k]} /> {t}</li>)}</ul>
        <p>Tactile : garder ↑ ou ↓ d'un doigt, toucher {PAD.jump}, {PAD.tack}, {PAD.jibe} ou {PAD.carve} de l'autre.</p>
        <p>Manette PlayStation : stick gauche ou croix pour diriger et ↑ ↓, ✕ saut, □ virer, ○ empanner, △ 360, L1 pied, R1 main.</p>
    </details>
);

/** What the next key does, right now. */
const hintFor = (s, inp) => {
    if (s.mode === 'air') return [['↑', 'forward'], ['↓', 'back'], ['← →', 'table-top'], ['F', 'pied'], ['G', 'main']];
    if (s.mode !== 'sail' || s.man) return null;
    const mod = inp.up ? 'up' : inp.down ? 'down' : null;
    if (mod) return COMBOS.filter((c) => c[0] === mod && canDo(s, c[2])).map((c) => [`${CAP[mod]} + ${CAP[c[1]]}`, NAMES[c[2]]]);
    if (s.ramp) return [['Espace', 'décoller haut sur la vague !']];
    return null;
};

/** Top-centre bar: clock, score and combo (freestyle), clock and next mark (slalom). */
const SessionBar = ({ s, sess }) => {
    if (!sess || sess.mode === 'ride') return null;
    if (sess.mode === 'freestyle') {
        const comboLeft = Math.max(0, 1 - (s.time - sess.lastTrick) / 4.5);
        return (
            <div className="sbar" aria-live="off">
                <span className={`clock ${sess.left < 10 ? 'hurry' : ''}`}>{Math.ceil(sess.left)}<small>s</small></span>
                <span className="sscore">{sess.score.toLocaleString('fr-FR')}<small> pts</small></span>
                {sess.combo > 1 && comboLeft > 0 ? <span className="combo">Combo ×{sess.mult}<i style={{ width: `${comboLeft * 100}%` }} /></span> : null}
            </div>
        );
    }
    const m = COURSE[Math.min(sess.mark, COURSE.length - 1)]; const tw = toward(s, m);
    const rel = (tw.bearing - s.heading) * 180 / Math.PI;
    const label = m.kind === 'start' ? 'Départ' : m.kind === 'finish' ? 'Arrivée' : `Bouée ${sess.mark} / ${COURSE.length - 2}`;
    return (
        <div className="sbar" aria-live="off">
            <span className="clock">{sess.started ? fmtTime(sess.time) : '0:00.0'}</span>
            <span className="next">
                <svg viewBox="-12 -12 24 24" width="30" height="30" aria-hidden="true"><path d="M0 -10 L7 6 L0 2 L-7 6 Z" transform={`rotate(${rel})`} /></svg>
                {label} · {Math.round(tw.dist)} m
            </span>
        </div>
    );
};

/** Demo: which figure, how to do it, and a way out. */
const DemoBanner = ({ demo, onStop }) => (
    <div className="demo-banner" role="status">
        <span className="demo-tag">Démo · {demo.done ? 'terminée' : `${demo.i + 1} / ${demo.n}`}</span>
        {demo.done ? <b>Tout y est passé !</b> : <><b>{demo.step.name}</b><span className="demo-keys">{demo.step.keys}</span></>}
        <button className="hud-btn" onClick={onStop}>Arrêter</button>
    </div>
);

const Hud = ({ s, sess, demo, onStopDemo, onExit, onReset, onMenu, input, wind, sea, craft, ready, onSettings, onCraft }) => {
    const knots = (s.speed / KNOT).toFixed(1);
    const windRel = s.twd - s.heading;
    const hold = (k) => ({
        onPointerDown: (e) => { e.preventDefault(); input.current[k] = true; },
        onPointerUp: () => { if (!EDGE.includes(k)) release(input, k); },
        onPointerLeave: () => { if (!EDGE.includes(k) && input.current[k]) release(input, k); },
        onPointerCancel: () => { if (!EDGE.includes(k)) release(input, k); },
    });
    const recent = sess ? sess.popups : s.events.filter((e) => s.time - e.t < 3);
    const status = s.mode === 'air' ? 'En l\'air' : s.mode === 'crash' ? 'Water-start…' : s.man ? MANOEUVRES[s.man.kind].label : s.planing ? (s.craft === 'wing' ? 'En vol' : 'Planing') : 'Archimède';
    return (
        <div className="hud">
            <div className="hud-top">
                <div className="hud-left">
                    {onExit ? <button className="hud-btn" onClick={onExit} aria-label="Retour à la fiche">← Retour</button> : null}
                    <button className="hud-btn ghosty" onClick={onMenu}>Menu</button>
                    <button className="hud-btn ghosty" onClick={onReset}>Recommencer</button>
                </div>
                <div className="hud-stats">
                    <div className="stat big"><span className="v">{knots}</span><span className="u">nœuds</span></div>
                    <div className="stat"><span className="v">{deg(s.heading)}°</span><span className="u">cap</span></div>
                    <div className="stat"><span className="v">{Math.abs(Math.round((s.twa ?? 0) * 180 / Math.PI))}°</span><span className="u">angle au vent</span></div>
                    <div className="stat"><span className="v">{(s.tws / KNOT).toFixed(0)}</span><span className="u">vent</span></div>
                    <div className="stat"><span className="v">{(s.topSpeed / KNOT).toFixed(1)}</span><span className="u">vitesse max</span></div>
                    {s.mode === 'air' ? <div className="stat"><span className="v">{(Math.abs(s.airPitch) / (2 * Math.PI)).toFixed(1)}</span><span className="u">tours</span></div> : null}
                    <div className="stat score"><span className="v">{s.score}</span><span className="u">points</span></div>
                </div>
                <div className="hud-right">
                    <div className="wind" title="Direction du vent par rapport à la planche">
                        <svg viewBox="-30 -30 60 60" width="60" height="60" aria-hidden="true">
                            <circle r="27" className="wind-ring" />
                            <g transform={`rotate(${windRel * 180 / Math.PI})`}><path d="M0 -24 L6 -10 L0 -14 L-6 -10 Z" className="wind-arrow" /><line x1="0" y1="-14" x2="0" y2="10" className="wind-shaft" /></g>
                            <rect x="-3" y="-12" width="6" height="24" rx="3" className="wind-board" />
                        </svg>
                        <span className={`badge ${s.planing || s.mode === 'air' ? 'on' : ''}`}>{status}</span>
                        {s.ramp && s.mode === 'sail' && !s.man ? <span className="badge ramp">Rampe !</span> : null}
                    </div>
                    <Settings wind={wind} sea={sea} craft={craft} ready={ready} onChange={onSettings} onCraft={onCraft} />
                    <Legend s={s} />
                </div>
            </div>
            {demo ? <DemoBanner demo={demo} onStop={onStopDemo} /> : <SessionBar s={s} sess={sess} />}
            <div className="tricks" aria-live="polite">
                {recent.map((e) => (
                    <div key={e.id} className={`trick ${e.bad ? 'bad' : ''} ${e.challenge ? 'challenge' : ''} ${e.mark ? 'mark' : ''}`}>
                        {e.text}{e.pts ? <b> +{e.pts.toLocaleString('fr-FR')}</b> : null}{e.mult > 1 ? <em> ×{e.mult}</em> : null}
                    </div>
                ))}
            </div>
            <div className="hud-bottom">
                {(() => { const h = hintFor(s, input.current); return h ? <div className="hint" aria-live="polite">{h.map(([k, t]) => <span key={k}><kbd>{k}</kbd> {t}</span>)}</div> : null; })()}
                <p className="help"><b>1 doigt</b> tourner la vue · <b>2 doigts</b> zoomer · ← → diriger · <b>Figures</b> en haut à droite</p>
                <div className="controls">
                    <div className="stick" role="group" aria-label="Diriger et tourner">
                        <button className="pad" {...hold('left')} aria-label="Gauche">⟲</button>
                        <div className="pad-col">
                            <button className="pad sm" {...hold('up')} aria-label="Haut : forward loop, modificateur">↑</button>
                            <button className="pad sm" {...hold('down')} aria-label="Bas : back loop, modificateur">↓</button>
                        </div>
                        <button className="pad" {...hold('right')} aria-label="Droite">⟳</button>
                    </div>
                    <div className="actions" role="group" aria-label="Actions">
                        <button className="hud-btn act jump" {...hold('jump')}>Saut</button>
                        <button className="hud-btn act" {...hold('tack')}>Virer</button>
                        <button className="hud-btn act" {...hold('jibe')}>Empanner</button>
                        <button className="hud-btn act" {...hold('carve')}>360</button>
                        <button className={`hud-btn act let ${s.oneFoot ? 'on' : ''}`} {...hold('oneFoot')}>Pied</button>
                        <button className={`hud-btn act let ${s.oneHand ? 'on' : ''}`} {...hold('oneHand')}>Main</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

/** Fingers / mouse on the 3D view: one pointer drags the orbit, two pinch the zoom, wheel zooms, double tap resets. */
const useCamGestures = (view) => {
    const ptrs = useRef(new Map()); const pinch = useRef(0); const lastTap = useRef(0);
    const onUi = (e) => e.target.closest?.('button, details, a, input, .hud-stats, .wind');
    const clampDist = (d) => Math.min(3.5, Math.max(0.3, d));
    const dist2 = () => { const [a, b] = [...ptrs.current.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    return {
        onPointerDown: (e) => {
            if (onUi(e)) return;
            ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); view.current.active = true;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            if (ptrs.current.size === 2) pinch.current = dist2();
            const now = performance.now();
            if (ptrs.current.size === 1 && now - lastTap.current < 300) Object.assign(view.current, { yaw: 0, pitch: 0, dist: 1 });
            lastTap.current = now;
        },
        onPointerMove: (e) => {
            const p = ptrs.current.get(e.pointerId); if (!p) return;
            const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
            if (ptrs.current.size === 1) {
                view.current.yaw -= dx * 0.008;
                view.current.pitch = Math.min(1.3, Math.max(-0.5, view.current.pitch + dy * 0.006));
            } else if (ptrs.current.size === 2) {
                const d = dist2(); if (pinch.current > 0) view.current.dist = clampDist(view.current.dist * pinch.current / d); pinch.current = d;
            }
        },
        onPointerUp: (e) => { ptrs.current.delete(e.pointerId); pinch.current = ptrs.current.size === 2 ? dist2() : 0; view.current.active = ptrs.current.size > 0; },
        onPointerCancel: (e) => { ptrs.current.delete(e.pointerId); view.current.active = ptrs.current.size > 0; },
        onWheel: (e) => { if (!onUi(e)) view.current.dist = clampDist(view.current.dist * Math.exp(e.deltaY * 0.001)); },
    };
};

const KEYS = { ArrowLeft: 'left', KeyA: 'left', KeyQ: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', KeyZ: 'up',
               ArrowDown: 'down', KeyS: 'down', Space: 'jump', KeyV: 'tack', KeyE: 'jibe', KeyX: 'duck', KeyC: 'carve', KeyF: 'oneFoot', KeyG: 'oneHand',
               KeyH: 'heli', KeyJ: 'airjibe', KeyU: 'vulcan', KeyK: 'spock', KeyL: 'flaka' };

/** modelUrls: { windsurf, wing } (the artifact passes blob URLs); modelUrl: the windsurf one alone (older callers). */
const WindsurfGame = ({ onExit, modelUrl, modelUrls }) => {
    const urls = { ...MODEL_URLS, ...(modelUrl ? { windsurf: modelUrl } : {}), ...(modelUrls || {}) };
    const [wind, setWind] = useState(18); const [sea, setSea] = useState('clapot'); const [craft, setCraft] = useState('windsurf');
    const [phase, setPhase] = useState('menu'); const [mode, setMode] = useState('freestyle'); const [muted, setMuted] = useState(false);
    const state = useRef(initialState({ windKn: 18, sea: 'clapot' })); const input = useRef({});
    const [snap, setSnap] = useState({ s: state.current, sess: null });
    const view = useRef({ yaw: 0, pitch: 0, dist: 1, active: false });
    const gestures = useCamGestures(view);
    // everything the frame loop needs, without re-rendering the canvas
    const game = useRef(null);
    if (!game.current) game.current = { phase: 'menu', session: null, save: loadSave(), audio: createAudio(), craft: 'windsurf' };
    const g = game.current;

    const start = (m = mode, c = craft) => {
        g.audio.start(); g.demo = null;
        state.current = initialState({ windKn: wind, sea, craft: c });
        g.session = newSession(m); g.craft = c; g.phase = 'play'; setPhase('play');
        input.current = {}; view.current.yaw = 0; view.current.pitch = 0;
    };
    const toMenu = () => { g.phase = 'menu'; g.session = null; g.demo = null; setPhase('menu'); };
    const startDemo = () => {
        g.audio.start();
        state.current = initialState({ windKn: 22, sea: 'vagues', craft });     // waves for the ramps
        g.session = newSession('ride'); g.craft = craft; g.demo = createDemo(state.current);
        g.demoSave = { done: Object.fromEntries(CHALLENGES.map((c) => [c.id, 1])), best: {} };   // the demo earns nothing
        g.phase = 'play'; setPhase('play'); input.current = {};
    };
    g.onDemoEnd = () => toMenu();
    g.onEnd = () => {
        if (g.phase !== 'play') return;
        g.phase = 'end'; storeSave(g.save); g.audio.sfx('end'); setPhase('end');
        setSnap({ s: { ...state.current }, sess: { ...g.session } });
    };
    g.onStartKey = () => { if (g.phase === 'play') toMenu(); else start(); };
    const onCraft = (c) => { setCraft(c); g.craft = c; state.current = initialState({ windKn: wind, sea, craft: c }); if (g.phase === 'play') g.session = newSession(mode); };
    const onSettings = ({ wind: w, sea: se }) => {
        setWind(w); setSea(se); state.current.baseTws = w * KNOT; state.current.sea = se;
    };
    const onMute = () => { const m = !muted; setMuted(m); g.audio.setMuted(m); };
    useEffect(() => {
        const down = (e) => {
            if (g.phase !== 'play') {
                if (e.code === 'Enter' && !e.target.closest?.('button, input, summary')) { e.preventDefault(); start(); }
                else if (e.code === 'Escape' && g.phase === 'end') toMenu();
                else if (e.code === 'Escape' && onExit) onExit();
                return;
            }
            const k = KEYS[e.code]; if (!k) { if (e.code === 'Escape') toMenu(); return; }
            if (e.repeat && EDGE.includes(k)) return;
            input.current[k] = true; e.preventDefault();
        };
        const up = (e) => { const k = KEYS[e.code]; if (k && !EDGE.includes(k)) release(input, k); };
        window.addEventListener('keydown', down); window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    });
    const ready = { windsurf: !!urls.windsurf, wing: !!urls.wing };
    return (
        <div className={`game phase-${phase}`} {...gestures}>
            <Canvas camera={{ position: [-4.5, 2.6, 7.5], fov: 45, near: 0.1, far: 6000 }} dpr={[1, 2]} gl={{ antialias: true }}>
                <hemisphereLight args={['#dbe6ed', '#134868', 0.9]} />
                <directionalLight position={[3, 6, 4]} intensity={2.2} />
                <Suspense fallback={null}>
                    <Sea state={state} y={0} />
                    <Windsurfer key={craft} state={state} url={urls[craft]} />
                </Suspense>
                <Course state={state} session={{ get current() { return g.session; } }} />
                <Spray state={state} />
                <Rig state={state} input={input} view={view} onTick={setSnap} game={game} />
            </Canvas>
            {phase === 'play' ? (
                <Hud s={snap.s} sess={snap.sess} demo={snap.demo} onStopDemo={toMenu} input={input} onExit={onExit} wind={wind} sea={sea} onSettings={onSettings}
                     craft={craft} ready={ready} onCraft={onCraft} onMenu={toMenu} onReset={() => start()} />
            ) : null}
            {phase === 'menu' ? (
                <MainMenu mode={mode} setMode={setMode} craft={craft} onCraft={onCraft} ready={ready} wind={wind} sea={sea} onSettings={onSettings}
                          save={g.save} onStart={() => start()} onDemo={startDemo} onExit={onExit} muted={muted} onMute={onMute} />
            ) : null}
            {phase === 'end' && snap.sess ? (
                <EndScreen sess={snap.sess} craft={craft} save={g.save} onAgain={() => start()} onMenu={toMenu} />
            ) : null}
        </div>
    );
};
export default WindsurfGame;
