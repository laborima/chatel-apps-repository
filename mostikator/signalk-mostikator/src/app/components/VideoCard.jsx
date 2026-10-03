"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getStreamUrl, getDetectorViewUrl } from "../services/deviceService";

/**
 * Live MJPEG view from the ESP32-P4 with a tactical overlay:
 * region of interest, locked targets (id, velocity vector, predicted
 * position) and a centre crosshair. Star Wars targeting computer vibes.
 *
 * "Vue détecteur" shows the detector's own working grid instead (GET /detector.bmp, refreshed ~3 times a
 * second): what counts as a change in red, bright changes ignored by "objets sombres" in cyan.
 * The dashed red line is where the laser can go (fixed pan, from the aim calibration).
 */
export default function VideoCard({ status, config, targets, armed, onArm, onDisarm }) {
    const [playing, setPlaying] = useState(false);
    const [streamError, setStreamError] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [streamKey, setStreamKey] = useState(0);
    const [detOn, setDetOn] = useState(false);
    const [detView, setDetView] = useState(null);     /* object URL of the last detector picture */

    const containerRef = useRef(null);
    const imgRef = useRef(null);
    const canvasRef = useRef(null);
    const targetsRef = useRef(targets);
    useEffect(() => { targetsRef.current = targets; }, [targets]);

    const cameraReady = status?.camera?.ready;
    /* The OV5647 runs in 800x800: the frame follows the sensor's aspect instead of a fixed 16:9 */
    const camW = status?.camera?.width || 16;
    const camH = status?.camera?.height || 9;

    /* ---------- overlay ---------- */
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas) return;
        const rect = canvas.parentElement?.getBoundingClientRect();
        if (!rect || rect.width === 0) return;
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
        }
        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);

        /* object-contain letterboxes the picture (fullscreen, or before the status arrives):
         * draw in the area the image really covers, or every target lands beside its mosquito */
        const srcW = (playing && img?.naturalWidth) || camW, srcH = (playing && img?.naturalHeight) || camH;
        const scale = Math.min(rect.width / srcW, rect.height / srcH);
        const W = srcW * scale, H = srcH * scale;
        ctx.translate((rect.width - W) / 2, (rect.height - H) / 2);

        // ROI
        const roi = config?.detector?.roi;
        if (roi) {
            ctx.strokeStyle = "rgba(57,255,20,0.25)";
            ctx.setLineDash([6, 6]);
            ctx.lineWidth = 1;
            ctx.strokeRect(roi[0] * W, roi[1] * H, (roi[2] - roi[0]) * W, (roi[3] - roi[1]) * H);
            ctx.setLineDash([]);
        }

        // Laser line: the turret has no pan servo, the laser stays on one column of the picture
        const aim = config?.aim;
        const hfov = config?.detector?.hfov;
        if (aim && hfov && aim.pan_gain) {
            const camPan = (0 - aim.pan_offset) / aim.pan_gain;
            const lx = (0.5 + camPan / hfov) * W;
            if (lx >= 0 && lx <= W) {
                ctx.strokeStyle = "rgba(255,40,40,0.45)";
                ctx.setLineDash([3, 5]);
                ctx.beginPath();
                ctx.moveTo(lx, 0); ctx.lineTo(lx, H);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // Centre crosshair
        ctx.strokeStyle = "rgba(57,255,20,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W / 2 - 18, H / 2); ctx.lineTo(W / 2 - 6, H / 2);
        ctx.moveTo(W / 2 + 6, H / 2); ctx.lineTo(W / 2 + 18, H / 2);
        ctx.moveTo(W / 2, H / 2 - 18); ctx.lineTo(W / 2, H / 2 - 6);
        ctx.moveTo(W / 2, H / 2 + 6); ctx.lineTo(W / 2, H / 2 + 18);
        ctx.stroke();

        // Targets
        for (const t of targetsRef.current || []) {
            const x = t.x * W, y = t.y * H;
            const r = Math.max(14, Math.max(t.w * W, t.h * H) * 1.5);
            const color = t.confidence >= 0.6 ? "#39ff14" : "#ffb000";

            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.stroke();

            // Corner brackets
            const b = r + 6;
            ctx.beginPath();
            [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
                ctx.moveTo(x + sx * b, y + sy * (b - 8));
                ctx.lineTo(x + sx * b, y + sy * b);
                ctx.lineTo(x + sx * (b - 8), y + sy * b);
            });
            ctx.stroke();

            // Prediction vector
            if (t.px !== undefined) {
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(t.px * W, t.py * H);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(t.px * W, t.py * H, 3, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.shadowBlur = 0;

            ctx.fillStyle = color;
            ctx.font = "bold 12px ui-monospace, monospace";
            ctx.fillText(`#${t.id}  ${Number(t.pan).toFixed(1)}° / ${Number(t.tilt).toFixed(1)}°`, x + b + 4, y - b);
            ctx.fillStyle = "rgba(215,224,230,0.8)";
            ctx.font = "11px ui-monospace, monospace";
            ctx.fillText(`${Math.round(t.confidence * 100)}%`, x + b + 4, y - b + 14);
        }
    }, [config, playing, camW, camH]);

    /* Animate only while a picture is shown: an idle card must not burn a phone's battery at 60 fps */
    const live = playing || !!detView;
    useEffect(() => {
        if (!live) {
            const once = requestAnimationFrame(draw);
            return () => cancelAnimationFrame(once);
        }
        let raf;
        const loop = () => { draw(); raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [draw, live, targets]);

    /* ---------- stream control ---------- */
    const startStream = () => { setStreamError(false); setDetOn(false); setStreamKey((k) => k + 1); setPlaying(true); };
    const stopStream = () => { setPlaying(false); if (imgRef.current) imgRef.current.src = ""; };

    const toggleFullscreen = () => {
        const el = containerRef.current;
        if (!el) return;
        if (!document.fullscreenElement) {
            el.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
        } else {
            document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
        }
    };

    useEffect(() => {
        const onChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);

    /* ---------- detector view ---------- */
    useEffect(() => {
        if (!detOn) return;
        let stop = false, timer = null, current = null;
        const next = async () => {
            try {
                const r = await fetch(getDetectorViewUrl(), { cache: "no-store" });
                if (r.ok) {
                    const url = URL.createObjectURL(await r.blob());
                    if (stop) { URL.revokeObjectURL(url); return; }
                    setDetView(url);
                    if (current) URL.revokeObjectURL(current);
                    current = url;
                }
            } catch { /* device busy: next round */ }
            if (!stop) timer = setTimeout(next, 300);
        };
        next();
        return () => { stop = true; clearTimeout(timer); if (current) URL.revokeObjectURL(current); };
    }, [detOn]);
    const toggleDetView = () => {
        if (!detOn) stopStream();
        setDetView(null);
        setDetOn((on) => !on);
    };

    // Stop the stream when the tab is hidden (saves the ESP32 bandwidth)
    useEffect(() => {
        const onVisibility = () => { if (document.hidden && playing) stopStream(); };
        document.addEventListener("visibilitychange", onVisibility);
        return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [playing]);

    const stateLabel = status?.detector?.state === "armed" ? "ARMÉ"
        : status?.detector?.state === "learning" ? "CALIBRATION"
        : "DÉSARMÉ";

    return (
        <section className="mk-panel overflow-hidden">
            <div className="mk-panel-title">
                <span className="flex items-center gap-2">
                    Ordinateur de visée
                    <span className={`mk-mono text-[0.65rem] px-2 py-0.5 rounded-full border ${
                        armed ? "border-mk-alert text-mk-alert mk-armed" : "border-mk-border text-mk-muted"}`}>
                        {stateLabel}
                    </span>
                </span>
                <span className="mk-mono text-xs text-mk-muted normal-case tracking-normal">
                    {status?.camera?.width ? `${status.camera.width}×${status.camera.height}` : "caméra ?"}
                    {status?.camera?.fps ? ` · ${status.camera.fps.toFixed(0)} fps` : ""}
                    {status?.detector?.fps ? ` · det ${status.detector.fps.toFixed(0)} fps` : ""}
                </span>
            </div>

            <div
                ref={containerRef}
                className={`relative bg-black mx-auto ${isFullscreen ? "h-screen w-full" : ""}`}
                style={isFullscreen ? undefined : {
                    aspectRatio: `${camW} / ${camH}`,
                    width: `min(100%, calc(75vh * ${camW / camH}))`   /* a square frame stays on screen */
                }}
            >
                {playing && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        key={streamKey}
                        ref={imgRef}
                        src={getStreamUrl()}
                        alt="Flux caméra"
                        className="absolute inset-0 w-full h-full object-contain"
                        onError={() => { setStreamError(true); setPlaying(false); }}
                    />
                )}
                {detOn && detView && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={detView} alt="Vue détecteur" className="absolute inset-0 w-full h-full object-contain"
                        style={{ imageRendering: "pixelated" }} />
                )}
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
                {playing && <div className="mk-scanline" />}

                {!playing && !detOn && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6">
                        <div className="text-5xl">{cameraReady ? "🎯" : "📷"}</div>
                        <p className="text-mk-muted text-sm max-w-md">
                            {streamError
                                ? "Flux interrompu – le détecteur est peut-être hors ligne."
                                : cameraReady
                                    ? "Caméra prête. Lancez le flux pour voir les cibles en direct."
                                    : `Caméra non initialisée${status?.camera?.error ? ` (${status.camera.error})` : ""}.`}
                        </p>
                        <button className="mk-btn mk-btn-laser" onClick={startStream} disabled={!cameraReady}>
                            ▶ Flux vidéo
                        </button>
                    </div>
                )}

                {/* Overlay controls */}
                <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-2">
                    {playing
                        ? <button className="mk-btn text-xs" onClick={stopStream}>■ Stop</button>
                        : <button className="mk-btn text-xs" onClick={startStream} disabled={!cameraReady}>▶ Flux</button>}
                    <button className={`mk-btn text-xs ${detOn ? "mk-btn-laser" : ""}`} onClick={toggleDetView} disabled={!cameraReady}
                        title="Ce que voit le détecteur : rouge = changement compté, cyan = changement clair ignoré">
                        🔬 Vue détecteur
                    </button>
                    <button className="mk-btn text-xs" onClick={toggleFullscreen}>{isFullscreen ? "⤢ Quitter" : "⤢ Plein écran"}</button>
                    <div className="ml-auto">
                        {armed
                            ? <button className="mk-btn mk-btn-alert text-xs" onClick={onDisarm}>⏻ Désarmer</button>
                            : <button className="mk-btn mk-btn-laser text-xs" onClick={onArm} disabled={!cameraReady}>⚡ Armer</button>}
                    </div>
                </div>
            </div>
        </section>
    );
}
