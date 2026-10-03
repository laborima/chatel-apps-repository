"use client";

import { useState, useEffect } from "react";
import { getShots, getShotImageUrl } from "../services/deviceService";

const RESULTS = {
    lost:   { label: "Cible perdue · touché ?", cls: "border-mk-laser text-mk-laser" },
    missed: { label: "Raté · toujours suivie",  cls: "border-mk-alert text-mk-alert" },
    manual: { label: "Tir manette",             cls: "border-mk-border text-mk-muted" },
    "":     { label: "Résultat…",               cls: "border-mk-amber text-mk-amber" },
};

const when = (shot) => shot.epoch > 1700000000
    ? new Date(shot.epoch * 1000).toLocaleTimeString("fr-FR")
    : `il y a ${Math.round(shot.ago_ms / 1000)} s`;

/**
 * The last shots kept by the detector (GET /shots): what it saw when it decided to fire (its working
 * grid, changes in red, the target circled) and a photo taken just after the burst.
 */
export default function ShotGallery({ disabled }) {
    const [shots, setShots] = useState([]);

    useEffect(() => {
        if (disabled) return;
        let stop = false, timer = null;
        const poll = async () => {
            if (!document.hidden) {
                try { const r = await getShots(); if (!stop) setShots(r.shots || []); } catch { /* offline */ }
            }
            if (!stop) timer = setTimeout(poll, 3000);
        };
        poll();
        return () => { stop = true; clearTimeout(timer); };
    }, [disabled]);

    return (
        <section className="mk-panel overflow-hidden">
            <div className="mk-panel-title">
                <span>Derniers tirs</span>
                <span className="text-xs text-mk-muted normal-case tracking-normal">avant (vue détecteur) · après (photo)</span>
            </div>
            <div className="p-4 flex flex-col gap-4">
                {shots.length === 0 && <p className="text-sm text-mk-muted">Aucun tir depuis le démarrage du détecteur.</p>}
                {shots.map((s) => {
                    const res = RESULTS[s.result] || RESULTS[""];
                    return (
                        <div key={s.n} className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs mk-mono">
                                <span className="text-mk-text">#{s.n}</span>
                                <span className="text-mk-muted">{when(s)}</span>
                                <span className={`px-2 py-0.5 rounded-full border ${res.cls}`}>{res.label}</span>
                                {s.auto && <span className="text-mk-muted">cible #{s.target} · tilt {s.tilt.toFixed(1)}° · anticipation {s.lead_ms} ms</span>}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="relative bg-black aspect-square">
                                    {s.before && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={getShotImageUrl(s.n, "before")} alt="Vue du détecteur au tir"
                                            className="absolute inset-0 w-full h-full object-contain" style={{ imageRendering: "pixelated" }} />
                                    )}
                                    {s.x >= 0 && (
                                        <div className="absolute rounded-full border-2 border-mk-laser"
                                            style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: 28, height: 28, transform: "translate(-50%, -50%)" }} />
                                    )}
                                </div>
                                <div className="relative bg-black aspect-square">
                                    {s.after
                                        // eslint-disable-next-line @next/next/no-img-element
                                        ? <img src={getShotImageUrl(s.n, "after")} alt="Photo après le tir" className="absolute inset-0 w-full h-full object-contain" />
                                        : <span className="absolute inset-0 flex items-center justify-center text-xs text-mk-muted">photo…</span>}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
