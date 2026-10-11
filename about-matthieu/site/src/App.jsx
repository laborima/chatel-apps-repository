import React, { lazy, Suspense, useEffect, useState } from 'react';
import Profile from './profile/Profile';
// the game (three.js + the 10 MB model) loads only when it is opened
const WindsurfGame = lazy(() => import('./game/WindsurfGame'));

const route = () => (window.location.hash === '#windsurf' ? 'windsurf' : 'profile');

export default function App() {
    const [page, setPage] = useState(route);
    useEffect(() => { const f = () => setPage(route()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
    const go = (p) => { window.location.hash = p === 'windsurf' ? 'windsurf' : ''; };
    if (page === 'windsurf') {
        return <Suspense fallback={<div className="loading">Gréement de la planche…</div>}><WindsurfGame onExit={() => go('profile')} /></Suspense>;
    }
    return <Profile onPlay={() => go('windsurf')} />;
}
