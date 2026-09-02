"use client";

const LABELS = {
    acquired: { icon: "🎯", text: "Cible verrouillée", tone: "mk-laser-text" },
    updated:  { icon: "·", text: "Cible suivie", tone: "text-mk-muted" },
    lost:     { icon: "💨", text: "Cible perdue", tone: "text-mk-muted" },
    shot:     { icon: "💥", text: "Tir", tone: "text-mk-amber" }
};

/**
 * Last detector / turret events (newest first).
 */
export default function EventLog({ events }) {
    const formatTime = (ts) => {
        if (!ts) return "";
        // Device timestamps are millis() since boot: show relative when < 1e12
        if (ts < 1e12) return `+${(ts / 1000).toFixed(1)}s`;
        return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    };

    return (
        <section className="mk-panel overflow-hidden">
            <div className="mk-panel-title">
                <span>Journal de bord</span>
                <span className="text-xs text-mk-muted mk-mono">{events.length} évènements</span>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-mk-border">
                {events.length === 0 && (
                    <div className="p-6 text-center text-mk-muted text-sm">En attente d&apos;activité…</div>
                )}
                {events.map((e) => {
                    const meta = LABELS[e.event] || { icon: "•", text: e.event, tone: "text-mk-text" };
                    const id = e.target?.id ?? e.target_id;
                    const detail = e.event === "shot"
                        ? (e.result === "hit" ? "touché" : "loupé")
                        : e.target
                            ? `pan ${Number(e.target.pan).toFixed(1)}° tilt ${Number(e.target.tilt).toFixed(1)}°`
                            : "";
                    return (
                        <div key={e.key} className="flex items-center gap-3 px-4 py-2 text-sm">
                            <span className="w-6 text-center">{meta.icon}</span>
                            <span className={`font-medium ${meta.tone}`}>{meta.text}</span>
                            {id !== undefined && <span className="mk-mono text-mk-muted">#{id}</span>}
                            <span className={`mk-mono text-xs ${e.event === "shot" ? (e.result === "hit" ? "mk-laser-text" : "text-mk-alert") : "text-mk-muted"}`}>
                                {detail}
                            </span>
                            <span className="ml-auto mk-mono text-xs text-mk-muted">{formatTime(e.ts)}</span>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
