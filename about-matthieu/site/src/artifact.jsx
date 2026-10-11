// Stand-alone entry used to publish the game as a claude.ai artifact: the model is published next to the page
// as base64 text (the viewer serves data files, not .glb) and turned back into a blob URL here.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import WindsurfGame from './game/WindsurfGame';
import './styles.css';

async function loadModel(path, onPct) {
    const r = await fetch(path); if (!r.ok) throw new Error(r.status);
    const total = Number(r.headers.get('content-length')) || 0; const reader = r.body.getReader(); const parts = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; if (total && onPct) onPct(Math.round(100 * got / total)); }
    const b64 = new TextDecoder().decode(await new Blob(parts).arrayBuffer()).trim();
    const bin = atob(b64); const buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
}

function Boot() {
    const [url, setUrl] = useState(null); const [wing, setWing] = useState(null); const [err, setErr] = useState(null); const [pct, setPct] = useState(0);
    useEffect(() => {
        (async () => {
            try {
                setUrl(await loadModel('models/windsurfer.txt', setPct));
                setWing(await loadModel('models/wingfoil.txt'));          // the wing foil loads while playing
            } catch (e) { setErr(String(e.message || e)); }
        })();
    }, []);
    if (err && !url) return <div className="loading">Le modèle n'a pas pu être chargé ({err}). Recharge la page.</div>;
    if (!url) return <div className="loading">Gréement de la planche… {pct ? `${pct} %` : ''}</div>;
    return <WindsurfGame modelUrls={{ windsurf: url, wing }} />;
}
createRoot(document.getElementById('root')).render(<Boot />);
