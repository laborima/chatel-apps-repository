import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { seaParams, waveAt } from './physics';
import { SHARK_LEN } from './sharks';

/**
 * The Tintin shark (Red Rackham's Treasure), as built for real: a black-over-white torpedo hull with a wavy
 * waterline, dorsal and tail fins, pectorals, a pilot's bubble on the back and a red-ringed eye. Nose towards -Z.
 */
const makeShark = () => {
    const g = new THREE.Group();
    const L = SHARK_LEN, R = 0.42;
    // hull: a lathe along Y, then laid along Z
    const prof = [];
    for (let i = 0; i <= 28; i++) {
        const t = i / 28;                                            // 0 nose -> 1 tail
        const r = R * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08) ** 0.62), 0.9) * (1 - 0.55 * t ** 3);
        prof.push(new THREE.Vector2(Math.max(0.004, r), -L / 2 + t * L));
    }
    const hull = new THREE.LatheGeometry(prof, 40);
    hull.rotateX(Math.PI / 2);                                       // y (nose at -L/2) -> z: nose towards -Z
    const pos = hull.attributes.position; const col = [];
    const black = new THREE.Color('#0e1216'), white = new THREE.Color('#eeeeea');
    for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i), y = pos.getY(i);
        const line = -0.02 + 0.045 * Math.sin(z * 5.5);              // the wavy black / white edge
        const c = y > line ? black : white; col.push(c.r, c.g, c.b);
    }
    hull.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    hull.scale(1, 0.92, 1);
    const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1 });
    g.add(new THREE.Mesh(hull, skin));
    const finMat = new THREE.MeshStandardMaterial({ color: '#0e1216', roughness: 0.4, side: THREE.DoubleSide });
    const fin = (pts, depth = 0.04) => {
        const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(([x, y]) => sh.lineTo(x, y));
        const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); geo.translate(0, 0, -depth / 2);
        return new THREE.Mesh(geo, finMat);
    };
    // dorsal fin (curved back), shape in the y-z plane via a rotation
    const dorsal = fin([[0, 0], [0.55, 0], [0.42, 0.18], [0.12, 0.62], [-0.08, 0.66], [0.02, 0.4]]);
    dorsal.rotation.y = -Math.PI / 2; dorsal.position.set(0, 0.34, 0.05); g.add(dorsal);
    // tail: big upper lobe, small lower one
    const tail = fin([[0, 0], [0.22, 0.02], [0.62, 0.78], [0.5, 0.8], [0.12, 0.2], [0.42, -0.36], [0.32, -0.38], [0.02, -0.08]], 0.05);
    tail.rotation.y = -Math.PI / 2; tail.position.set(0, 0.0, L / 2 - 0.32); g.add(tail);
    // small second dorsal
    const d2 = fin([[0, 0], [0.22, 0], [0.12, 0.2]], 0.03); d2.rotation.y = -Math.PI / 2; d2.position.set(0, 0.22, 0.95); g.add(d2);
    // pectoral fins, angled down and back
    [-1, 1].forEach((sd) => {
        const p = fin([[0, 0], [0.42, 0.04], [0.5, -0.04], [0.06, -0.12]], 0.03);
        p.rotation.set(0, -Math.PI / 2, sd * 0.5); p.position.set(sd * 0.36, -0.2, -0.45); g.add(p);
    });
    // pilot's bubble on the back, near the front
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({ color: '#cfe8f2', transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0, depthWrite: false }));
    bubble.scale.set(1, 0.8, 1.35); bubble.position.set(0, 0.3, -0.62); g.add(bubble);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.02, 8, 30), new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 0.8, roughness: 0.3 }));
    rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.35, 1); rim.position.set(0, 0.3, -0.62); g.add(rim);
    // eyes: white disc ringed in red
    [-1, 1].forEach((sd) => {
        const e = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), new THREE.MeshBasicMaterial({ color: '#f4f4f4' }));
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.06, 20), new THREE.MeshBasicMaterial({ color: '#c0262d' }));
        [e, ring].forEach((m) => { m.position.set(sd * 0.27, 0.12, -1.28); m.rotation.y = sd * 1.25; g.add(m); });
    });
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    return g;
};

/** The sharks on the sea: same frame as the sea (group turned by the heading, the board at the origin). */
const Sharks = ({ state, pack, enabled }) => {
    const group = useRef(); const meshes = useRef(new Map());
    const proto = useMemo(() => makeShark(), []);
    useFrame(() => {
        const g = group.current; const s = state.current; const p = pack.current;
        if (!g) return;
        g.visible = !!(enabled.current && p);
        if (!g.visible) return;
        g.rotation.y = s.heading;
        const w = seaParams(s); const alive = new Set();
        for (const sh of p.list) {
            alive.add(sh.id);
            let m = meshes.current.get(sh.id);
            if (!m) { m = proto.clone(); meshes.current.set(sh.id, m); g.add(m); }
            const wave = waveAt(w, sh.x, sh.y, s.time);
            m.position.set(sh.x - s.x, wave.z - 0.3 + 0.03 * Math.sin(sh.phase * 2.1), -(sh.y - s.y));   // the white belly under water
            m.rotation.order = 'YXZ'; m.rotation.set(Math.atan(wave.gy * Math.cos(sh.h) + wave.gx * Math.sin(sh.h)) * 0.6, -sh.h, 0.05 * Math.sin(sh.phase * 1.3));
        }
        for (const [id, m] of meshes.current) if (!alive.has(id)) { g.remove(m); meshes.current.delete(id); }
    });
    return <group ref={group} />;
};
export default Sharks;
