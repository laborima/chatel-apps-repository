// Dev-only inspection scene (not built into the site): ?cam=x,y,z&look=x,y,z&sea=houle&wind=18&shark=1&board=1
import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import Sea from '../game/sea/Sea';
import Sharks from '../game/Sharks';
import Windsurfer from '../game/Windsurfer';
import { initialState, step } from '../game/physics';

const q = new URLSearchParams(location.search);
const v3 = (k, d) => (q.get(k) || d).split(',').map(Number);
const Cam = ({ state }) => {
    const { camera } = useThree();
    useFrame((_, dt) => { if (q.get('move') === '1') step(state.current, {}, Math.min(dt, 0.05)); else state.current.time += Math.min(dt, 0.05);
        camera.position.set(...v3('cam', '6,2,6')); camera.lookAt(new THREE.Vector3(...v3('look', '0,0.3,0'))); });
    return null;
};
const Lab = () => {
    const state = useRef(initialState({ windKn: Number(q.get('wind') || 18), sea: q.get('sea') || 'clapot' }));
    const pack = useRef({ list: q.get('shark') ? [{ id: 1, x: Number(q.get('sx') || 0), y: Number(q.get('sy') || 0), h: Number(q.get('sh') || 1.2), v: 0, phase: 0 }] : [], nextId: 2 });
    return (
        <Canvas camera={{ fov: Number(q.get('fov') || 40), near: 0.05, far: 6000 }} dpr={1}>
            <hemisphereLight args={['#dbe6ed', '#134868', 0.9]} />
            <directionalLight position={[3, 6, 4]} intensity={2.2} />
            <Sea state={state} y={0} hull={q.get("hull") === "1"} />
            <Sharks state={state} pack={pack} enabled={{ current: true }} />
            {q.get('board') ? <React.Suspense fallback={null}><Windsurfer state={state} /></React.Suspense> : null}
            <Cam state={state} />
        </Canvas>
    );
};
createRoot(document.getElementById('root')).render(<Lab />);
