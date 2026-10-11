import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { makeArmIK } from './armIK';

export const MODEL_URL = `${import.meta.env.BASE_URL}models/windsurfer.glb`;

// Manoeuvre clips, scrubbed by the simulation (port tack -> starboard tack, the last frame is the mirrored "Ride")
const MAN_CLIPS = { tack: 'Tack', jibe: 'Jibe', duck: 'Duck', heli: 'Heli', airjibe: 'AirJibe', vulcan: 'Vulcan', spock: 'Spock', flaka: 'Flaka' };
// Held poses blended over "Ride"
const POSES = ['Tuck', 'OneFoot', 'OneHand', 'OneFootHand', 'Carve', 'Crouch'];

/**
 * The rider, board and rig (one glTF). Clips: Ride (loop), Tack, Jibe, Duck, the freestyle Heli, AirJibe, Vulcan,
 * Spock, Flaka (jumps and spins baked on the root), and the poses Tuck, OneFoot, OneHand, OneFootHand, Carve.
 * Model frame: bow towards -Z, rider on the port rail (wind from port). On starboard tack the whole model is
 * mirrored; a manoeuvre clip starts on port and ends on starboard, so it is mirrored when it starts on starboard.
 * state: ref from physics.js.
 */
const Windsurfer = ({ state, url = MODEL_URL }) => {
    const group = useRef(); const weights = useRef({ Tuck: 0, OneFoot: 0, OneHand: 0, OneFootHand: 0, Carve: 0, Crouch: 0 }); const lastMan = useRef(null);
    const { scene, animations } = useGLTF(url);
    const { actions } = useAnimations(animations, group);
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
            a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); a.paused = true; a.setEffectiveWeight(0);
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
            const prev = actions[MAN_CLIPS[lastMan.current.kind]]; if (prev) prev.setEffectiveWeight(0);
            actions.Ride.time = 0;
        }
        lastMan.current = m;

        const w = weights.current; const k = Math.min(1, dt * 6);
        if (clipName && actions[clipName]) {
            const a = actions[clipName]; const u = Math.min(0.999, m.t / m.dur);
            a.time = u * a.getClip().duration;
            const fade = Math.min(1, u / 0.08);                       // short blend in from the current Ride frame
            a.setEffectiveWeight(fade);
            POSES.forEach((n) => { w[n] = 0; });
            actions.Ride.setEffectiveWeight(1 - fade);
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
            };
            let sum = 0;
            POSES.forEach((n) => { w[n] += (target[n] - w[n]) * (n === 'Crouch' ? Math.min(1, dt * 20) : k); sum += w[n]; });
            const norm = Math.max(1, sum);
            POSES.forEach((n) => actions[n]?.setEffectiveWeight(w[n] / norm));
            actions.Ride.setEffectiveWeight(Math.max(0, 1 - sum / norm));
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
        if (actions.Ride.isRunning() && actions.Ride.time > 0) armIK(1);     // after the clips have posed the rider at least once
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
