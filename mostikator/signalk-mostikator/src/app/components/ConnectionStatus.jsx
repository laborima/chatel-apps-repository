"use client";

import { useState, useEffect } from "react";

const formatRelative = (isoString, now) => {
    if (!isoString) return null;
    const seconds = Math.floor((now - new Date(isoString).getTime()) / 1000);
    if (seconds < 10) return "à l'instant";
    if (seconds < 60) return `il y a ${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `il y a ${minutes} min`;
    return `il y a ${Math.floor(minutes / 60)}h`;
};

const Dot = ({ ok }) => (
    <span className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-mk-laser mk-pulse" : "bg-mk-alert"}`} />
);

/**
 * Device (REST) + live stream (WebSocket) status with last update time.
 */
export default function ConnectionStatus({ deviceOnline, liveConnected, liveSource, lastUpdate }) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 10000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-mk-border bg-mk-panel">
                <Dot ok={deviceOnline} />
                <span className="font-medium">{deviceOnline ? "Détecteur" : "Détecteur hors ligne"}</span>
                {lastUpdate && <span className="text-mk-muted">• {formatRelative(lastUpdate, now)}</span>}
            </div>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-mk-border bg-mk-panel">
                <Dot ok={liveConnected} />
                <span className="font-medium">Live {liveSource === "device" ? "ESP32" : "SignalK"}</span>
            </div>
        </div>
    );
}
