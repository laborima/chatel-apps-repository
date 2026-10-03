"use client";

import { useEffect, useRef, useState } from "react";
import { getLog } from "../services/deviceService";

const REFRESH_MS = 5000;

/**
 * Firmware log of the detection node (GET /api/log): remote diagnostics without the USB cable.
 * Collapsed by default; polled only while open.
 */
export default function DeviceLog({ disabled }) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState("");
    const [error, setError] = useState(null);
    const [follow, setFollow] = useState(true);
    const preRef = useRef(null);

    useEffect(() => {
        if (!open || disabled) return undefined;
        let alive = true;   /* a response arriving after "Masquer" must not be applied */
        const tick = async () => {
            try {
                const t = await getLog();
                if (alive) { setText(t); setError(null); }
            } catch (e) {
                if (alive) setError(e.message);
            }
        };
        const first = setTimeout(tick, 0);
        const timer = setInterval(tick, REFRESH_MS);
        return () => { alive = false; clearTimeout(first); clearInterval(timer); };
    }, [open, disabled]);

    useEffect(() => {
        if (follow && preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
    }, [text, follow]);

    return (
        <section className="mk-panel overflow-hidden">
            <div className="mk-panel-title">
                <span>Journal du détecteur</span>
                <div className="flex items-center gap-2">
                    {open && (
                        <label className="flex items-center gap-1 text-xs text-mk-muted">
                            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
                            suivre
                        </label>
                    )}
                    <button className="mk-btn text-xs" onClick={() => setOpen(!open)} disabled={disabled && !open}>
                        {open ? "Masquer" : "Afficher"}
                    </button>
                </div>
            </div>
            {open && (
                <div className="p-4">
                    {error && <p className="text-xs text-mk-alert mb-2">{error}</p>}
                    <pre ref={preRef} className="mk-mono text-[0.7rem] leading-snug max-h-96 overflow-auto whitespace-pre-wrap break-all text-mk-muted">
                        {text || "…"}
                    </pre>
                    <p className="text-xs text-mk-muted mt-2">
                        Actualisé toutes les {REFRESH_MS / 1000} s. Console complète : <span className="mk-mono">telnet &lt;ip&gt;</span> sur le réseau local.
                    </p>
                </div>
            )}
        </section>
    );
}
