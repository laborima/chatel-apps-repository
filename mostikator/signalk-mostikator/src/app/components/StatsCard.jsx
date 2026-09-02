"use client";

const Tile = ({ label, value, tone = "text-mk-text", sub }) => (
    <div className="rounded-xl bg-mk-panel-2 border border-mk-border p-3 flex flex-col gap-1">
        <span className="text-[0.7rem] uppercase tracking-wider text-mk-muted">{label}</span>
        <span className={`mk-stat text-3xl ${tone}`}>{value}</span>
        {sub && <span className="text-xs text-mk-muted">{sub}</span>}
    </div>
);

/**
 * Hunt scoreboard: seen / shots / hits / misses / accuracy.
 */
export default function StatsCard({ stats, onReset }) {
    const seen = stats?.seen ?? 0;
    const shots = stats?.shots ?? 0;
    const hits = stats?.hits ?? 0;
    const misses = stats?.misses ?? 0;
    const accuracy = shots > 0 ? Math.round((hits / shots) * 100) : null;

    return (
        <section className="mk-panel overflow-hidden">
            <div className="mk-panel-title">
                <span>Tableau de chasse</span>
                <button className="mk-btn text-xs py-1 px-2" onClick={onReset} title="Remettre les compteurs à zéro">
                    ↺ Reset
                </button>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Tile label="Moustiques vus" value={seen} tone="text-mk-cyan" />
                <Tile label="Tirs" value={shots} tone="text-mk-amber" />
                <Tile label="Détruits" value={hits} tone="mk-laser-text" />
                <Tile label="Loupés" value={misses} tone="text-mk-alert" />
                <Tile
                    label="Précision"
                    value={accuracy === null ? "–" : `${accuracy}%`}
                    tone={accuracy === null ? "text-mk-muted" : accuracy >= 50 ? "mk-laser-text" : "text-mk-amber"}
                    sub={stats?.last_result ? `Dernier tir : ${stats.last_result === "hit" ? "touché" : "loupé"}` : "Aucun tir"}
                />
            </div>
        </section>
    );
}
