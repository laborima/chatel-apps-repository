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
    hull.scale(1, 0.92, 1);
    // black over white with a wavy edge, computed per pixel from the hull's own coordinates (crisp at any size)
    const skin = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0.08 });
    skin.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHullP;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHullP = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHullP;')
            .replace('#include <color_fragment>', `#include <color_fragment>
                float edge = -0.03 + 0.05 * sin(vHullP.z * 5.5) + 0.02 * sin(vHullP.z * 13.0 + 1.0);
                float top = smoothstep(edge - 0.008, edge + 0.008, vHullP.y);
                diffuseColor.rgb = mix(vec3(0.93, 0.93, 0.91), vec3(0.04, 0.05, 0.06), top);`);
    };
    g.add(new THREE.Mesh(hull, skin));
    const finMat = new THREE.MeshStandardMaterial({ color: '#0e1216', roughness: 0.4, side: THREE.DoubleSide });
    const fin = (pts, depth = 0.04) => {
        const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(([x, y]) => sh.lineTo(x, y));
        const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); geo.translate(0, 0, -depth / 2);
        return new THREE.Mesh(geo, finMat);
    };
    // dorsal fin, swept back like the real one (shape x: towards the tail, y: up)
    const dorsal = fin([[0, 0], [0.62, 0], [0.5, 0.07], [0.26, 0.4], [0.06, 0.64], [-0.02, 0.6], [0.06, 0.3]]);
    dorsal.rotation.y = -Math.PI / 2; dorsal.position.set(0, 0.33, 0.0); g.add(dorsal);
    // tail: a crescent, big upper lobe and a smaller lower one (a simple polygon, no self-crossing)
    const tail = fin([[0, 0.06], [0.2, 0.3], [0.45, 0.72], [0.62, 0.86], [0.55, 0.62], [0.42, 0.38], [0.36, 0.12], [0.46, -0.22], [0.5, -0.38], [0.36, -0.3], [0.12, -0.1], [0, -0.06]], 0.05);
    tail.rotation.y = -Math.PI / 2; tail.position.set(0, 0.0, L / 2 - 0.3); g.add(tail);
    // small second dorsal
    const d2 = fin([[0, 0], [0.24, 0], [0.16, 0.06], [0.06, 0.2]], 0.03); d2.rotation.y = -Math.PI / 2; d2.position.set(0, 0.2, 0.95); g.add(d2);
    // pectoral fins: flat plates on the flanks, swept back and drooping
    [-1, 1].forEach((sd) => {
        const geo = new THREE.ExtrudeGeometry(new THREE.Shape([[0, 0], [0.5, 0.2], [0.56, 0.32], [0.04, 0.26]].map(([x, y]) => new THREE.Vector2(x, y))),
            { depth: 0.03, bevelEnabled: false });
        geo.translate(0, 0, -0.015); geo.rotateX(Math.PI / 2);       // plate horizontal, shape y -> towards the tail
        const p = new THREE.Mesh(geo, finMat); p.scale.x = sd;
        p.position.set(sd * 0.3, -0.16, -0.6); p.rotation.z = -sd * 0.38; g.add(p);
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
            m.position.set(sh.x - s.x, wave.z - 0.08 + 0.03 * Math.sin(sh.phase * 2.1), -(sh.y - s.y));   // afloat: black back out, white belly at the waterline
            m.rotation.order = 'YXZ'; m.rotation.set(Math.atan(wave.gy * Math.cos(sh.h) + wave.gx * Math.sin(sh.h)) * 0.6, -sh.h, 0.05 * Math.sin(sh.phase * 1.3));
        }
        for (const [id, m] of meshes.current) if (!alive.has(id)) { g.remove(m); meshes.current.delete(id); }
    });
    return <group ref={group} />;
};
export default Sharks;
