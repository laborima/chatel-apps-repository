"use client";

import { useState } from "react";

const DETECTOR_FIELDS = [
    { key: "threshold", label: "Seuil (luma)", min: 1, max: 255, step: 1, help: "Différence avec le fond pour marquer un pixel" },
    { key: "min_area", label: "Aire min (px)", min: 1, max: 500, step: 1, help: "Taille mini d'un blob (grille réduite)" },
    { key: "max_area", label: "Aire max (px)", min: 1, max: 5000, step: 1, help: "Au-delà : oiseau, main, chat…" },
    { key: "confirm_frames", label: "Images pour confirmer", min: 1, max: 30, step: 1 },
    { key: "miss_frames", label: "Images avant perte", min: 1, max: 60, step: 1 },
    { key: "max_match_dist", label: "Distance de suivi (px)", min: 1, max: 200, step: 1 },
    { key: "learn_shift", label: "Apprentissage fond (1/2ⁿ)", min: 1, max: 10, step: 1 },
    { key: "warmup_frames", label: "Images de calibration", min: 1, max: 300, step: 1 },
    { key: "noise_k", label: "Anti-bruit (K)", min: 0, max: 20, step: 1, help: "Seuil par pixel = seuil + K × bruit propre du pixel (bords, scintillement). 0 = désactivé" },
    { key: "global_change_pct", label: "Changement global (%)", min: 1, max: 100, step: 1, help: "Au-delà de ce % de l'image qui change d'un coup (vibration, exposition), l'image est ignorée" },
    { key: "lead_ms", label: "Anticipation (ms)", min: 0, max: 1000, step: 10, help: "Avance de tir envoyée à la tourelle" },
    { key: "downscale", label: "Réduction (1/N)", min: 2, max: 8, step: 1, help: "Grille de travail = image / N" },
    { key: "hfov", label: "Champ horizontal (°)", min: 10, max: 180, step: 0.5 },
    { key: "vfov", label: "Champ vertical (°)", min: 10, max: 180, step: 0.5 },
];

const CAMERA_FIELDS = [
    { key: "quality", label: "Qualité JPEG", min: 1, max: 100, step: 1 },
    { key: "gain", label: "Gain (-1 = auto)", min: -1, max: 1000, step: 1 },
    { key: "exposure", label: "Exposition (-1 = auto)", min: -1, max: 100000, step: 1 },
];

const formFromConfig = (config) => {
    const d = config?.detector || {};
    const c = config?.camera || {};
    return {
        threshold: d.threshold, min_area: d.min_area, max_area: d.max_area,
        confirm_frames: d.confirm_frames, miss_frames: d.miss_frames, max_match_dist: d.max_match_dist,
        learn_shift: d.learn_shift, warmup_frames: d.warmup_frames, lead_ms: d.lead_ms,
        downscale: d.downscale, hfov: d.hfov, vfov: d.vfov,
        noise_k: d.noise_k, global_change_pct: d.global_change_pct,
        dark_only: d.dark_only ? 1 : 0,
        isolation: d.isolation ? 1 : 0,
        roi_x0: d.roi?.[0] ?? 0, roi_y0: d.roi?.[1] ?? 0, roi_x1: d.roi?.[2] ?? 1, roi_y1: d.roi?.[3] ?? 1,
        quality: c.quality, gain: c.gain, exposure: c.exposure,
        vflip: c.vflip ? 1 : 0, hflip: c.hflip ? 1 : 0,
    };
};

const NumberField = ({ f, form, set, disabled }) => (
    <label className="flex flex-col gap-1 text-xs">
        <span className="text-mk-muted" title={f.help}>{f.label}</span>
        <input type="number" className="mk-input" min={f.min} max={f.max} step={f.step}
            value={form[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} disabled={disabled} />
    </label>
);

const Toggle = ({ k, label, form, set, disabled }) => (
    <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input type="checkbox" className="accent-[#39ff14]" checked={!!Number(form[k])}
            onChange={(e) => set(k, e.target.checked ? 1 : 0)} disabled={disabled} />
        <span>{label}</span>
    </label>
);

/**
 * Detector + camera tuning form (POST /api/config, persisted on the device).
 */
export default function DetectorControls({ config, onSave, onReset, disabled }) {
    const [form, setForm] = useState(() => formFromConfig(config));
    const [syncedConfig, setSyncedConfig] = useState(config);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [open, setOpen] = useState(false);

    // Re-sync the form from the device config unless the user is editing
    if (config !== syncedConfig) {
        setSyncedConfig(config);
        if (!dirty && config) setForm(formFromConfig(config));
    }

    const set = (key, value) => { setForm((f) => ({ ...f, [key]: value })); setDirty(true); };
    const fieldProps = { form, set, disabled };

    const save = async () => {
        setSaving(true);
        try {
            await onSave(form);
            setDirty(false);
        } finally {
            setSaving(false);
        }
    };

    const reset = async () => {
        setSaving(true);
        try {
            await onReset();
            setDirty(false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="mk-panel overflow-hidden">
            <button className="mk-panel-title w-full text-left" onClick={() => setOpen((o) => !o)}>
                <span>Réglages du détecteur</span>
                <span className="text-mk-muted normal-case tracking-normal text-xs">{open ? "▲ replier" : "▼ déplier"}</span>
            </button>
            {open && (
                <div className="p-4 space-y-4">
                    {!config && <p className="text-sm text-mk-muted">Configuration indisponible (détecteur hors ligne).</p>}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {DETECTOR_FIELDS.map((f) => <NumberField key={f.key} f={f} {...fieldProps} />)}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {["roi_x0", "roi_y0", "roi_x1", "roi_y1"].map((k) => (
                            <NumberField key={k} f={{ key: k, label: `Zone ${k.slice(4).toUpperCase()}`, min: 0, max: 1, step: 0.01 }} {...fieldProps} />
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-4">
                        <Toggle k="dark_only" label="Objets sombres uniquement" {...fieldProps} />
                        <Toggle k="isolation" label="Cibles isolées uniquement (ignore les contours d'une tête, d'un bras…)" {...fieldProps} />
                        <Toggle k="vflip" label="Retourner verticalement" {...fieldProps} />
                        <Toggle k="hflip" label="Miroir horizontal" {...fieldProps} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {CAMERA_FIELDS.map((f) => <NumberField key={f.key} f={f} {...fieldProps} />)}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-mk-border">
                        <button className="mk-btn mk-btn-laser" onClick={save} disabled={disabled || saving || !dirty}>
                            {saving ? "…" : "💾 Enregistrer sur le détecteur"}
                        </button>
                        <button className="mk-btn" onClick={() => { setForm(formFromConfig(config)); setDirty(false); }} disabled={!dirty || saving}>Annuler</button>
                        <button className="mk-btn mk-btn-amber ml-auto" onClick={reset} disabled={disabled || saving}>
                            Valeurs d&apos;usine
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
