import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GLTFLoader } from 'three-stdlib';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { seaParams, waveAt } from './physics';
import { SHARK_LEN } from './sharks';

/**
 * The Tintin shark (Red Rackham's Treasure), as Matthieu built it for real (photos in the profile): a slender
 * black-over-white hull with a wavy waterline, a blunt rounded snout carried low, small white eyes ringed in black,
 * a hooked dorsal fin, an open oval cockpit behind a clear windscreen, a crescent tail. Nose towards -Z. The pilot
 * sits in the group named 'hatch'.
 */
const makeShark = () => {
    const g = new THREE.Group();
    const L = SHARK_LEN, R = 0.42;
    const radius = (t) => (t < 0.26 ? Math.pow(1 - (1 - t / 0.26) ** 2, 0.5) : t < 0.5 ? 1 : 1 - Math.pow((t - 0.5) / 0.5, 1.5) * 0.9);
    // hull: a lathe along Y laid along Z, then a shark's head: the snout lifted a little, the underside flattened
    const prof = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40; prof.push(new THREE.Vector2(Math.max(0.004, R * radius(t)), -L / 2 + t * L)); }
    const hull = new THREE.LatheGeometry(prof, 44);
    hull.rotateX(Math.PI / 2);                                       // nose at -L/2 on z
    const pos = hull.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const t = (pos.getZ(i) + L / 2) / L; let y = pos.getY(i) * 0.94;
        // the top line slopes down to the nose, the belly stays nearly straight: the snout sits low
        if (t < 0.34) { const k = 1 - t / 0.34; if (y > 0) y *= 1 - 0.3 * k; else y *= 1 - 0.1 * k; y -= 0.08 * k * k; }
        pos.setY(i, y);
    }
    hull.computeVertexNormals();
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
        const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 });
        geo.translate(0, 0, -depth / 2);
        return new THREE.Mesh(geo, finMat);
    };
    // dorsal fin behind the hatch, swept back (shape x: towards the tail, y: up)
    const dorsal = fin([[0, 0], [0.6, 0], [0.46, 0.1], [0.34, 0.28], [0.34, 0.46], [0.46, 0.64], [0.26, 0.6], [0.08, 0.42], [-0.02, 0.16]]);
    dorsal.rotation.y = -Math.PI / 2; dorsal.position.set(0, 0.34, 0.15); g.add(dorsal);   // hooked back, like the real one
    // tail: a crescent, big upper lobe and a smaller lower one
    const tail = fin([[0, 0.06], [0.2, 0.3], [0.45, 0.72], [0.62, 0.86], [0.55, 0.62], [0.42, 0.38], [0.36, 0.12], [0.46, -0.22], [0.5, -0.38], [0.36, -0.3], [0.12, -0.1], [0, -0.06]], 0.05);
    tail.rotation.y = -Math.PI / 2; tail.position.set(0, 0.0, L / 2 - 0.3); g.add(tail);
    const d2 = fin([[0, 0], [0.24, 0], [0.16, 0.06], [0.06, 0.2]], 0.03); d2.rotation.y = -Math.PI / 2; d2.position.set(0, 0.2, 1.05); g.add(d2);
    // pectoral fins: flat plates on the flanks, swept back and drooping
    [-1, 1].forEach((sd) => {
        const geo = new THREE.ExtrudeGeometry(new THREE.Shape([[0, 0], [0.5, 0.2], [0.56, 0.32], [0.04, 0.26]].map(([x, y]) => new THREE.Vector2(x, y))),
            { depth: 0.03, bevelEnabled: false });
        geo.translate(0, 0, -0.015); geo.rotateX(Math.PI / 2);
        const p = new THREE.Mesh(geo, finMat); p.scale.x = sd;
        p.position.set(sd * 0.32, -0.17, -0.42); p.rotation.z = -sd * 0.38; g.add(p);
    });
    const at = (t) => -L / 2 + t * L;
    [-1, 1].forEach((sd) => {
        // eyes: small white discs ringed in black, on the sides of the head
        const t = 0.1, r = R * radius(t);
        const e = new THREE.Group();
        e.add(new THREE.Mesh(new THREE.CircleGeometry(0.035, 18), new THREE.MeshBasicMaterial({ color: '#f2f2f0' })));
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 22), new THREE.MeshBasicMaterial({ color: '#1a1d22' })); ring.position.z = 0.001; e.add(ring);
        const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.014, 12), new THREE.MeshBasicMaterial({ color: '#0b0b0b' })); pupil.position.set(0, 0, 0.002); e.add(pupil);
        e.position.set(sd * (r * 0.86 + 0.006), 0.04, at(t)); e.rotation.y = sd * Math.PI / 2 * 0.8; g.add(e);
    });
    // the open cockpit: a long oval coaming, a clear curved windscreen in front of it with its alloy handle
    const hatchZ = -0.45;
    const alloy = new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 0.8, roughness: 0.3 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.022, 8, 34), alloy);
    rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.7, 1); rim.position.set(0, 0.37, hatchZ); g.add(rim);
    const well = new THREE.Mesh(new THREE.CircleGeometry(0.245, 24), new THREE.MeshBasicMaterial({ color: '#050607' }));
    well.rotation.x = -Math.PI / 2; well.scale.set(1, 1.7, 1); well.position.set(0, 0.36, hatchZ); g.add(well);
    const screen = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.24, 24, 1, true, -Math.PI * 0.42, Math.PI * 0.84),
        new THREE.MeshPhysicalMaterial({ color: '#d8ecf4', transparent: true, opacity: 0.35, roughness: 0.04, side: THREE.DoubleSide, depthWrite: false }));
    screen.rotation.set(-0.35, Math.PI, 0); screen.position.set(0, 0.48, hatchZ - 0.4); g.add(screen);
    const bar = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.014, 6, 20, Math.PI), alloy);
    bar.rotation.set(-0.35, 0, 0); bar.position.set(0, 0.4, hatchZ - 0.34); g.add(bar);
    const hatch = new THREE.Group(); hatch.name = 'hatch'; hatch.position.set(0, 0.28, hatchZ); g.add(hatch);
    // no pilot model (older builds): the glass bubble of the original
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({ color: '#cfe8f2', transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0, depthWrite: false }));
    bubble.name = 'bubble'; bubble.scale.set(1, 0.8, 1.2); bubble.position.set(0, 0.37, hatchZ); g.add(bubble);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    return g;
};

export const HEAD_URL = `${import.meta.env.BASE_URL}models/head.glb`;

/** Put a copy of the pilot (head and shoulders) in the shark's hatch, and hide the glass bubble. */
const addPilot = (m, pilot) => {
    if (m.userData.pilot) return;
    const hatch = m.getObjectByName('hatch'), bubble = m.getObjectByName('bubble'); if (!hatch) return;
    const p = pilot.clone(true); p.rotation.y = Math.PI;              // the model faces +Z, the shark's nose is -Z
    p.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    hatch.add(p); m.userData.pilot = p; if (bubble) bubble.visible = false;
};

/** The sharks on the sea: same frame as the sea (group turned by the heading, the board at the origin). */
const Sharks = ({ state, pack, enabled, headUrl = HEAD_URL }) => {
    const group = useRef(); const meshes = useRef(new Map());
    const proto = useMemo(() => makeShark(), []);
    // Matthieu in the hatch (optional: without the model the shark keeps its glass bubble)
    const [pilot, setPilot] = useState(null);
    useEffect(() => {
        let live = true;
        new GLTFLoader().load(headUrl, (gl) => { if (live) setPilot(gl.scene); }, undefined, () => {});
        return () => { live = false; };
    }, [headUrl]);
    useEffect(() => {
        if (!pilot) return;
        for (const m of meshes.current.values()) addPilot(m, pilot);      // never on the prototype: clone() would copy userData as JSON
    }, [pilot]);
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
            if (!m) { m = proto.clone(); if (pilot) addPilot(m, pilot); meshes.current.set(sh.id, m); g.add(m); }
            const wave = waveAt(w, sh.x, sh.y, s.time);
            m.position.set(sh.x - s.x, wave.z + 0.07 + 0.03 * Math.sin(sh.phase * 2.1), -(sh.y - s.y));   // afloat: black back out, a line of white belly at the waterline
            m.rotation.order = 'YXZ'; m.rotation.set(Math.atan(wave.gy * Math.cos(sh.h) + wave.gx * Math.sin(sh.h)) * 0.6, -sh.h, 0.05 * Math.sin(sh.phase * 1.3));
            // the pilot keeps an eye on the board (head turned towards it, within his neck's reach)
            const head = m.userData.pilot;
            if (head) {
                const b = Math.atan2(s.x - sh.x, s.y - sh.y) - sh.h, rel = Math.atan2(Math.sin(b), Math.cos(b));
                const want = Math.max(-1.6, Math.min(1.6, -rel));
                head.rotation.y += (Math.PI + want - head.rotation.y) * 0.08;
            }
        }
        for (const [id, m] of meshes.current) if (!alive.has(id)) { g.remove(m); meshes.current.delete(id); }
    });
    return <group ref={group} />;
};
export default Sharks;
