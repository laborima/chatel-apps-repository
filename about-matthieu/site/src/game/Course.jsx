import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COURSE, MARK_RADIUS } from './session';
import { seaParams, waveAt } from './physics';

/**
 * Slalom marks on the water, in the sea's frame: the group turns with the heading like the sea (the board stays at
 * the origin, bow towards -Z), each mark at (east - x, height, -(north - y)) and riding the waves.
 */
const Course = ({ state, session }) => {
    const group = useRef(); const marks = useRef([]); const rings = useRef([]);
    const mats = useMemo(() => ({
        buoy: new THREE.MeshStandardMaterial({ color: '#ff5a1f', roughness: 0.45 }),
        done: new THREE.MeshStandardMaterial({ color: '#7d8a93', roughness: 0.6 }),
        finish: new THREE.MeshStandardMaterial({ color: '#d8f36b', roughness: 0.45 }),
        pole: new THREE.MeshStandardMaterial({ color: '#1b2730', roughness: 0.5 }),
        flag: new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 0.6 }),
        ring: new THREE.MeshBasicMaterial({ color: '#d8f36b', transparent: true, opacity: 0.55, depthWrite: false }),
    }), []);
    useFrame(() => {
        const s = state.current; const sess = session.current; const g = group.current; if (!g || !sess) return;
        g.visible = sess.mode === 'slalom';
        if (!g.visible) return;
        g.rotation.y = s.heading;
        const w = seaParams(s);
        COURSE.forEach((m, i) => {
            const o = marks.current[i]; if (!o) return;
            const z = waveAt(w, m.x, m.y, s.time).z;
            o.position.set(m.x - s.x, z - 0.1, -(m.y - s.y));
            o.rotation.z = 0.08 * Math.sin(s.time * 1.3 + i);
            const passed = i < sess.mark;
            o.children[0].material = passed ? mats.done : m.kind === 'finish' ? mats.finish : mats.buoy;
            const r = rings.current[i];
            if (r) {
                r.visible = i === sess.mark;
                const k = 1 + 0.12 * Math.sin(s.time * 4);
                r.scale.set(k, k, k); r.position.set(m.x - s.x, z + 0.05, -(m.y - s.y));
            }
        });
    });
    return (
        <group ref={group}>
            {COURSE.map((m, i) => (
                <group key={i} ref={(o) => { marks.current[i] = o; }}>
                    <mesh material={mats.buoy} position={[0, 0.9, 0]} castShadow>
                        <cylinderGeometry args={[0.55, 0.75, 1.9, 20]} />
                    </mesh>
                    <mesh material={mats.pole} position={[0, 2.9, 0]}><cylinderGeometry args={[0.04, 0.04, 2.2, 8]} /></mesh>
                    <mesh material={mats.flag} position={[0.45, 3.6, 0]}><planeGeometry args={[0.9, 0.55]} /></mesh>
                </group>
            ))}
            {COURSE.map((m, i) => (
                <mesh key={`r${i}`} ref={(o) => { rings.current[i] = o; }} material={mats.ring} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[MARK_RADIUS - 1.2, MARK_RADIUS, 64]} />
                </mesh>
            ))}
        </group>
    );
};
export default Course;
