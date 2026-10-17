import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { makeArmIK } from './armIK';
import { PUMP_DUR } from './physics';

/** Set a clip's weight; a clip at zero is disabled, so the mixer does not interpolate its ~300 tracks for nothing. */
const weigh = (a, v) => {
    if (!a) return;
    const on = v > 0.001;
    if (a.enabled !== on) a.enabled = on;
    if (on) a.setEffectiveWeight(v);
};

export const MODEL_URL = `${import.meta.env.BASE_URL}models/windsurfer.glb`;

// Manoeuvre clips, scrubbed by the simulation (port tack -> starboard tack, the last frame is the mirrored "Ride")
const MAN_CLIPS = { tack: 'Tack', jibe: 'Jibe', duck: 'Duck', heli: 'Heli', airjibe: 'AirJibe', vulcan: 'Vulcan', spock: 'Spock', flaka: 'Flaka' };
// Held poses blended over "Ride"
// Held poses blended over "Ride"; Pump is a stroke cycle, scrubbed by the physics' pumping phase
const POSES = ['Tuck', 'OneFoot', 'OneHand', 'OneFootHand', 'Carve', 'Crouch', 'Pump'];

/** Cuts in the manoeuvre clips: two keys where the rig turns over at once (the wing swapping tack overhead: the same
 *  shape seen mirrored). Interpolating there would swing the wing through 90 degrees for a frame: the game jumps over them. */
const findCuts = (clip) => {
    const tr = clip.tracks.find((t) => /^Rig\.quaternion$/.test(t.name)); if (!tr) return [];
    const cuts = []; const v = tr.values, q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
    for (let i = 0; i + 1 < tr.times.length; i++) {
        q0.fromArray(v, i * 4); q1.fromArray(v, i * 4 + 4);
        if (q0.angleTo(q1) > 1.0) cuts.push([tr.times[i], tr.times[i + 1]]);
    }
    return cuts;
};
const skipCuts = (t, cuts) => {
    for (const [a, b] of cuts) if (t > a && t < b) return t - a < b - t ? a : b;
    return t;
};

/**
 * The rider, board and rig (one glTF). Clips: Ride (loop), Tack, Jibe, Duck, the freestyle Heli, AirJibe, Vulcan,
 * Spock, Flaka (jumps and spins baked on the root), and the poses Tuck, OneFoot, OneHand, OneFootHand, Carve.
 * Model frame: bow towards -Z, rider on the port rail (wind from port). On starboard tack the whole model is
 * mirrored; a manoeuvre clip starts on port and ends on starboard, so it is mirrored when it starts on starboard.
 * state: ref from physics.js.
 */
const Windsurfer = ({ state, url = MODEL_URL }) => {
    const group = useRef(); const weights = useRef(Object.fromEntries(POSES.map((n) => [n, 0]))); const lastMan = useRef(null); const posed = useRef(false);
    const { scene, animations } = useGLTF(url);
    const { actions, mixer } = useAnimations(animations, group);
    const cuts = useMemo(() => Object.fromEntries(animations.map((c) => [c.name, findCuts(c)])), [animations]);
    // hands locked on the gear after the clips are blended (see armIK.js)
    const armIK = useMemo(() => makeArmIK(scene), [scene]);
    // harness lines: from the two anchors on the wishbone to the hook on the rider's harness, or hanging when unhooked
    const harness = useMemo(() => {
        const hook = scene.getObjectByName('HarnessHook'), a = scene.getObjectByName('LineFwd'), b = scene.getObjectByName('LineAft');
        if (!hook || !a || !b) return null;
        const mat = new THREE.MeshStandardMaterial({ color: '#16191c', roughness: 0.7 });
        const geo = new THREE.CylinderGeometry(0.0065, 0.0065, 1, 6);
        const segs = [new THREE.Mesh(geo, mat), new THREE.Mesh(geo, mat)];
        segs.forEach((m) => { m.frustumCulled = false; scene.add(m); });
        return { hook, a, b, segs, w: 0, pa: new THREE.Vector3(), pb: new THREE.Vector3(), ph: new THREE.Vector3(), low: new THREE.Vector3() };
    }, [scene]);
    useEffect(() => () => { harness?.segs.forEach((m) => m.removeFromParent()); }, [harness]);

    useEffect(() => {
        const ride = actions.Ride; if (!ride) return undefined;
        ride.setLoop(THREE.LoopRepeat, Infinity).play();
        [...Object.values(MAN_CLIPS), ...POSES].forEach((n) => {
            const a = actions[n]; if (!a) return;
            a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); a.paused = true; weigh(a, 0);
        });
        scene.traverse((o) => {
            if (!o.isMesh) return;
            o.castShadow = true; o.frustumCulled = false;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => { if (m.name.startsWith('Sail')) { m.side = THREE.DoubleSide; m.depthWrite = !m.transparent; } });
        });
        return () => Object.values(actions).forEach((a) => a?.stop());
    }, [actions, scene]);

    useFrame((_, dt) => {
        const s = state.current; const g = group.current; if (!g || !actions.Ride) return;
        const m = s.man; const clipName = m && MAN_CLIPS[m.kind];
        // side the rig is on: wind from starboard (twa > 0) -> mirrored model
        const side = m ? m.side : (Math.sign(s.twa) || s.lastSide);
        g.scale.set(side > 0 ? -1 : 1, 1, 1);

        // manoeuvre ended: back to "Ride" from its first frame (the clip's last frame is that pose, mirrored)
        if (lastMan.current && lastMan.current !== m) {
            const prev = actions[MAN_CLIPS[lastMan.current.kind]]; if (prev) weigh(prev, 0);
            actions.Ride.time = 0;
        }
        lastMan.current = m;

        const w = weights.current; const k = Math.min(1, dt * 6);
        if (clipName && actions[clipName]) {
            const a = actions[clipName]; const u = Math.min(0.999, m.t / m.dur);
            a.time = skipCuts(u * a.getClip().duration, cuts[clipName] || []);
            const fade = Math.min(1, u / 0.08);                       // short blend in from the current Ride frame
            weigh(a, fade);
            POSES.forEach((n) => { w[n] = 0; });
            weigh(actions.Ride, 1 - fade);
        } else {
            const air = s.mode === 'air';
            const bearAway = s.planing && s.turn * -side > 0.4;   // carving the leeward rail
            const target = {
                Tuck: air && !s.oneFoot && !s.oneHand ? 1 : 0,
                OneFoot: air && s.oneFoot && !s.oneHand ? 1 : 0,
                OneHand: air && s.oneHand && !s.oneFoot ? 1 : 0,
                OneFootHand: air && s.oneFoot && s.oneHand ? 1 : 0,
                Crouch: air ? 0 : (s.load || 0),                            // loading the pop, absorbing a landing
                Carve: (m?.kind === 'carve' ? 1 : 0) || (!air && bearAway ? Math.min(1, Math.abs(s.turn)) * 0.8 : 0),
                Pump: !air && s.pumpT >= 0 ? 1 : 0,
            };
            // a pumping stroke plays at the physics' pace (the clip is one stroke: pull, then recover)
            if (actions.Pump && s.pumpT >= 0) actions.Pump.time = Math.min(0.999, s.pumpT / PUMP_DUR) * actions.Pump.getClip().duration;
            let sum = 0;
            const rate = { Crouch: Math.min(1, dt * 20), Pump: Math.min(1, dt * 9) };
            POSES.forEach((n) => { w[n] += (target[n] - w[n]) * (rate[n] ?? k); sum += w[n]; });
            const norm = Math.max(1, sum);
            POSES.forEach((n) => weigh(actions[n], w[n] / norm));
            weigh(actions.Ride, Math.max(0, 1 - sum / norm));
        }

        g.rotation.order = 'YXZ';
        if (s.mode === 'crash') {
            // catapult: rig and rider in the water to leeward
            g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, 1.25 * (side > 0 ? -1 : 1), Math.min(1, dt * 3));
            g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, 0.15, k);
        } else {
            // waves (pitch/roll), carving heel, and the moves in the air (loops, table-top)
            g.rotation.x = s.pitch + s.airPitch;
            const carve = s.mode === 'air' ? 0 : -s.turn * (s.planing ? 0.32 : 0.12);   // rail to rail when planing
            g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, s.roll + carve + s.airRoll, Math.min(1, dt * 8));
        }
        g.position.y = s.z - 0.04 + (s.fh || 0);             // foil: the board flies above the water
        actions.Ride.timeScale = s.mode === 'air' ? 0.25 : 0.55 + Math.min(1.2, s.speed / 9);
        // the mixer has already run this frame (useAnimations updates it first): apply the weights and times set above
        // now, or the pose lags one frame behind the mirroring (a one-frame flash on the wrong side after each tack)
        mixer.update(0);
        if (window.__ride) window.__ride.anim = { w: { ...w }, ride: actions.Ride.time, man: clipName || null };    // headless checks (?test)
        // hands and feet on the gear in every state (it used to stop whenever "Ride" weighed nothing: in the air and during
        // manoeuvres, and to snap back on at the landing); from the second frame, once the clips have posed the rider
        if (posed.current) armIK(1);
        posed.current = true;
        if (harness) {
            // hooked in when planing on a reach; unhooked in the air, in manoeuvres, after a fall or slow
            const hooked = s.mode === 'sail' && !s.man && s.planing;
            harness.w += ((hooked ? 1 : 0) - harness.w) * Math.min(1, dt * 5);
            scene.updateMatrixWorld(true);
            const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
            const local = (o, v) => o.getWorldPosition(v).applyMatrix4(inv);
            local(harness.a, harness.pa); local(harness.b, harness.pb); local(harness.hook, harness.ph);
            const hang = harness.low.lerpVectors(harness.pa, harness.pb, 0.5); hang.y -= 0.32;
            hang.lerp(harness.ph, harness.w);
            [[harness.pa, hang], [hang, harness.pb]].forEach(([p0, p1], i) => {
                const m = harness.segs[i]; const d = new THREE.Vector3().subVectors(p1, p0); const len = d.length();
                m.position.lerpVectors(p0, p1, 0.5); m.scale.set(1, Math.max(0.01, len), 1);
                m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
            });
        }
    });

    return <primitive ref={group} object={scene} />;
};

export default Windsurfer;
