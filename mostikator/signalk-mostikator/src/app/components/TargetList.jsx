"use client";

/**
 * Confirmed targets with the pan/tilt solution sent to the turret and
 * manual shot reporting (hit / miss) for calibration sessions.
 */
export default function TargetList({ targets, onShot, disabled }) {
    const fmt = (v, d = 1) => (v === undefined || v === null || Number.isNaN(v) ? "–" : Number(v).toFixed(d));

    return (
        <section className="mk-panel overflow-hidden">
            <div className="mk-panel-title">
                <span>Cibles verrouillées</span>
                <span className={`mk-mono text-xs ${targets.length ? "mk-laser-text" : "text-mk-muted"}`}>
                    {targets.length} active{targets.length > 1 ? "s" : ""}
                </span>
            </div>
            {targets.length === 0 ? (
                <div className="p-6 text-center text-mk-muted text-sm">
                    Aucune cible. Le ciel est calme… pour l&apos;instant.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm mk-mono">
                        <thead className="text-mk-muted text-xs uppercase tracking-wider">
                            <tr>
                                <th className="text-left px-3 py-2">ID</th>
                                <th className="text-right px-3 py-2">Pan °</th>
                                <th className="text-right px-3 py-2">Tilt °</th>
                                <th className="text-right px-3 py-2 hidden sm:table-cell">X / Y</th>
                                <th className="text-right px-3 py-2 hidden md:table-cell">Vitesse</th>
                                <th className="text-right px-3 py-2">Conf.</th>
                                <th className="text-right px-3 py-2 hidden sm:table-cell">Âge</th>
                                <th className="text-right px-3 py-2">Tir</th>
                            </tr>
                        </thead>
                        <tbody>
                            {targets.map((t) => (
                                <tr key={t.id} className="border-t border-mk-border">
                                    <td className="px-3 py-2 mk-laser-text font-bold">#{t.id}</td>
                                    <td className="px-3 py-2 text-right">{fmt(t.pan)}</td>
                                    <td className="px-3 py-2 text-right">{fmt(t.tilt)}</td>
                                    <td className="px-3 py-2 text-right hidden sm:table-cell text-mk-muted">
                                        {fmt(t.x, 2)} / {fmt(t.y, 2)}
                                    </td>
                                    <td className="px-3 py-2 text-right hidden md:table-cell text-mk-muted">
                                        {fmt(Math.hypot(t.vx || 0, t.vy || 0), 2)}/s
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <span className={t.confidence >= 0.6 ? "mk-laser-text" : "text-mk-amber"}>
                                            {Math.round((t.confidence || 0) * 100)}%
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-right hidden sm:table-cell text-mk-muted">
                                        {t.age_ms !== undefined ? `${(t.age_ms / 1000).toFixed(1)}s` : "–"}
                                    </td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap">
                                        <button className="mk-btn mk-btn-laser text-xs py-1 px-2 mr-1" disabled={disabled}
                                            onClick={() => onShot(t.id, true)} title="Tir réussi">✓</button>
                                        <button className="mk-btn mk-btn-alert text-xs py-1 px-2" disabled={disabled}
                                            onClick={() => onShot(t.id, false)} title="Tir loupé">✗</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
