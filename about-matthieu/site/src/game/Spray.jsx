import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const N = 700;
/**
 * Spray: a sheet of droplets off the leeward rail when planing (at the foil mast when flying), a burst on each
 * landing and a big splash on a fall. Scene frame: board at the origin, bow towards -Z, the water streams to +Z.
 */
const Spray = ({ state }) => {
    const pts = useRef(); const next = useRef(0); const lastMode = useRef('sail');
    const { geo, pos, vel, life } = useMemo(() => {
        const g = new THREE.BufferGeometry(); const p = new Float32Array(N * 3).fill(-999);
        g.setAttribute('position', new THREE.BufferAttribute(p, 3));
        return { geo: g, pos: p, vel: new Float32Array(N * 3), life: new Float32Array(N) };
    }, []);
    const mat = useMemo(() => {
        const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
        const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(0, 0, 32, 32);
        return new THREE.PointsMaterial({ color: '#ffffff', size: 0.16, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.9, depthWrite: false });
    }, []);
    const emit = (x, y, z, vx, vy, vz, l) => {
        const i = next.current; next.current = (i + 1) % N;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz; life[i] = l;
    };
    useFrame((_, delta) => {
        const s = state.current; const dt = Math.min(delta, 0.05);
        const lee = (s.man ? s.man.side : Math.sign(s.twa) || -1) > 0 ? -1 : 1;    // leeward side in the scene (+X on port tack)
        const water = s.z - 0.02, foil = (s.fh || 0) > 0.2;
        if (s.mode === 'sail' && s.speed > 3.5) {
            const n = Math.min(14, Math.floor((s.speed - 3.5) * (foil ? 0.5 : 1.6)));
            for (let k = 0; k < n; k++) {
                const z0 = foil ? 0.1 + Math.random() * 0.2 : -0.2 + Math.random() * 0.9;
                const x0 = foil ? 0 : lee * (0.32 + Math.random() * 0.05);
                emit(x0, water + 0.05, z0, lee * (0.8 + Math.random() * 1.6) + (foil ? (Math.random() - 0.5) * 2 : 0),
                     0.6 + Math.random() * (foil ? 1.2 : 2.2) + s.speed * 0.06, s.speed * (0.55 + Math.random() * 0.3), 0.5 + Math.random() * 0.5);
            }
        }
        if (lastMode.current === 'air' && s.mode !== 'air') {           // landing (or crash) splash
            const big = s.mode === 'crash';
            for (let k = 0; k < (big ? 260 : 120); k++) {
                const a = Math.random() * Math.PI * 2, r = Math.random() * (big ? 3.5 : 2.2);
                emit(Math.cos(a) * 0.6, water + 0.05, Math.sin(a) * 1.0, Math.cos(a) * r, 1.5 + Math.random() * (big ? 4 : 2.6), Math.sin(a) * r + s.speed * 0.5, 0.7 + Math.random() * 0.6);
            }
        }
        lastMode.current = s.mode;
        for (let i = 0; i < N; i++) {
            if (life[i] <= 0) { pos[i * 3 + 1] = -999; continue; }
            life[i] -= dt; vel[i * 3 + 1] -= 9.81 * dt;
            pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
            if (pos[i * 3 + 1] < water - 0.3) life[i] = 0;
        }
        geo.attributes.position.needsUpdate = true;
    });
    return <points ref={pts} geometry={geo} material={mat} frustumCulled={false} />;
};
export default Spray;
