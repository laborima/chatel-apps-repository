import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import Sea, { DUSK } from '../game/sea/Sea';
import Windsurfer from '../game/Windsurfer';
import Spray from '../game/Spray';
import { initialState, step } from '../game/physics';

/** Sails on by itself: a planing beam reach on the swell, the camera drifting slowly round the rider. */
const Drift = ({ state, still }) => {
    const { camera } = useThree(); const look = useRef(new THREE.Vector3());
    useFrame((st, delta) => {
        const dt = Math.min(delta, 0.05); const s = state.current;
        step(s, {}, dt);
        const wide = st.size.width > 760;
        const a = still ? 0.9 : 0.9 + st.clock.elapsedTime * 0.045, r = wide ? 10.5 : 15;
        camera.position.set(Math.sin(a) * r, 2.1 + s.z * 0.5, Math.cos(a) * r - 1.5);
        // frame the rider in the right third (the copy sits on the left): aim a little to his left
        const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
        look.current.set(0, 1.5 + s.z * 0.6, -1.0).addScaledVector(right, wide ? -4.6 : 1.2);
        if (!wide) look.current.y -= 2.2;                               // phone: rider high in the frame, above the copy
        camera.lookAt(look.current);
    });
    return null;
};

const HeroScene = () => {
    const state = useRef(initialState({ windKn: 17, sea: 'houle' }));
    const box = useRef(); const [visible, setVisible] = useState(true);
    const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    useEffect(() => {
        // stop rendering when the hero is scrolled away (battery, other tabs)
        const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.02 });
        if (box.current) io.observe(box.current);
        return () => io.disconnect();
    }, []);
    return (
        <div ref={box} className="hero-canvas" aria-hidden="true">
            <Canvas frameloop={visible ? 'always' : 'never'} camera={{ position: [6, 2.2, 8], fov: 38, near: 0.1, far: 6000 }}
                    dpr={[1, 1.6]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
                <hemisphereLight args={['#5d8fb0', '#020a12', 0.55]} />
                <directionalLight position={[6, 2.2, -3]} intensity={1.6} color="#ffd9b0" />
                <directionalLight position={[-4, 3, 5]} intensity={0.5} color="#3fc8ff" />
                <Sea state={state} y={0} palette={DUSK} />
                <Suspense fallback={null}><Windsurfer state={state} /></Suspense>
                <Spray state={state} />
                <Drift state={state} still={still} />
            </Canvas>
        </div>
    );
};
export default HeroScene;
