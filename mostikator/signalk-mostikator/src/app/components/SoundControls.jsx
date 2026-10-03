"use client";

import { useState } from "react";

/**
 * Blaster volume + test shot (POST /api/sound, volume persisted on the device).
 *
 * The slider only commits on release: every change would otherwise write NVS on
 * each pixel dragged. The test button applies (and saves) the pending value before playing.
 */
export default function SoundControls({ status, onSetVolume, onTest, disabled }) {
    const deviceVolume = status?.audio?.volume;
    const audioReady = status?.audio?.ready;

    const [pending, setPending] = useState(null);
    const [busy, setBusy] = useState(false);
    const volume = pending ?? deviceVolume ?? 0;

    const commit = async (value) => {
        setBusy(true);
        try {
            await onSetVolume(value);
            setPending(null);
        } catch { /* surfaced by the hook */ } finally {
            setBusy(false);
        }
    };

    const test = async () => {
        setBusy(true);
        try {
            await onTest(volume);
            setPending(null);
        } catch { /* surfaced by the hook */ } finally {
            setBusy(false);
        }
    };

    const off = !audioReady && status != null;

    return (
        <section className="mk-panel overflow-hidden">
            <div className="mk-panel-title">
                <span>Son du blaster</span>
                <span className="text-xs text-mk-muted mk-mono">
                    {off ? "codec muet" : `${volume} %`}
                </span>
            </div>

            <div className="p-4 flex flex-col gap-4">
                {off && (
                    <p className="text-xs text-mk-amber">
                        L&apos;ES8311 n&apos;a pas répondu au démarrage : vérifier le haut-parleur sur le connecteur SPK.
                    </p>
                )}

                <label className="flex flex-col gap-2">
                    <span className="text-[0.7rem] uppercase tracking-wider text-mk-muted">Volume</span>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={volume}
                        className="w-full accent-[#39ff14]"
                        disabled={disabled || busy || off}
                        onChange={(e) => setPending(Number(e.target.value))}
                        onPointerUp={(e) => commit(Number(e.target.value))}
                        onKeyUp={(e) => {
                            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key))
                                commit(Number(e.target.value));
                        }}
                    />
                    <div className="flex justify-between text-[0.65rem] text-mk-muted mk-mono">
                        <span>0</span><span>50</span><span>100</span>
                    </div>
                </label>

                <div className="flex items-center gap-2">
                    <button
                        className="mk-btn mk-btn-laser text-xs flex-1"
                        onClick={test}
                        disabled={disabled || busy || off}
                        title="Joue le blaster sur le haut-parleur de la carte"
                    >
                        {busy ? "…" : "Tester le son"}
                    </button>
                    {pending !== null && (
                        <button className="mk-btn text-xs" onClick={() => commit(pending)} disabled={busy}>
                            Enregistrer
                        </button>
                    )}
                </div>

                <p className="text-xs text-mk-muted">
                    Le son part aussi à chaque tir, y compris ceux déclenchés à la manette PS5 depuis la tourelle.
                </p>
            </div>
        </section>
    );
}
