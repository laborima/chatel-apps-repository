"use client";

import { t } from "../lib/i18n";

/**
 * TideWidget Component
 * Displays current tide information with height, trend, and high/low times
 */
export default function TideWidget({ tide, activities = [], dayPlanning, selectedSailor, className = "" }) {
    if (!tide) {
        return (
            <div className={`bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6 ${className}`}>
                <h3 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-50">
                    {t("tide.title")}
                </h3>
                <p className="text-zinc-500 dark:text-zinc-400">{t("status.noData")}</p>
            </div>
        );
    }

    const tidePercent = ((tide.heightNow - tide.heightLow) / (tide.heightHigh - tide.heightLow)) * 100;

    let sunriseHour = 7;
    let sunsetHour = 21;

    if (dayPlanning?.summary?.sunrise) {
        const sunriseDate = new Date(dayPlanning.summary.sunrise);
        sunriseHour = sunriseDate.getHours();
    }
    if (dayPlanning?.summary?.sunset) {
        const sunsetDate = new Date(dayPlanning.summary.sunset);
        sunsetHour = sunsetDate.getHours();
    }

    const minHour = Math.max(0, Math.min(23, sunriseHour));
    const maxHour = Math.max(minHour + 1, Math.min(24, sunsetHour));
    const totalSpan = maxHour - minHour;

    const mergedActivities = dayPlanning?.mergedActivities || [];
    const currentActivityIds = new Set((activities || []).map((a) => a.id));

    const daySlots = dayPlanning?.slots || [];
    const tidePointsRaw = daySlots
        .filter((slot) => slot && typeof slot.hour === "number" && slot.hour >= minHour && slot.hour <= maxHour)
        .map((slot) => ({
            hour: slot.hour,
            tide: slot.conditions?.tideEstimate
        }))
        .filter((p) => typeof p.tide === "number" && Number.isFinite(p.tide));

    let tideCurvePoints = "";
    const tideByHour = new Map();
    if (tidePointsRaw.length > 0) {
        const minTide = tidePointsRaw.reduce((m, p) => Math.min(m, p.tide), tidePointsRaw[0].tide);
        const maxTide = tidePointsRaw.reduce((m, p) => Math.max(m, p.tide), tidePointsRaw[0].tide);
        const tideRange = maxTide - minTide || 1;

        tideCurvePoints = tidePointsRaw
            .map((p) => {
                tideByHour.set(p.hour, p.tide);
                const x = ((p.hour - minHour) / totalSpan) * 100;
                const norm = (p.tide - minTide) / tideRange;
                const y = (1 - norm) * 100;
                return `${x},${y}`;
            })
            .join(" ");
    }

    const typeStyles = {
        sailboat: { color: "bg-blue-400", icon: "⛵" },
        windsurf: { color: "bg-green-400", icon: "🏄" },
        wingfoil: { color: "bg-purple-400", icon: "🪁" },
        speedsail: { color: "bg-orange-400", icon: "🚀" },
        sup: { color: "bg-cyan-400", icon: "🏄" }
    };

    const activityWindows = mergedActivities.map((activity) => {
        const style = typeStyles[activity.type] || { color: "bg-sky-400", icon: "🌊" };
        const isNow = currentActivityIds.has(activity.id);

        const tideMin = activity.ideal_conditions?.tide_min;
        const tideMax = activity.ideal_conditions?.tide_max;

        if (tideMin === undefined && tideMax === undefined) {
            return null;
        }

        const hours = Array.from(tideByHour.keys()).sort((a, b) => a - b);
        const ranges = [];
        let currentStart = null;

        for (let i = 0; i < hours.length; i += 1) {
            const hour = hours[i];
            const tideValue = tideByHour.get(hour);
            const okMin = tideMin === undefined || tideValue >= tideMin;
            const okMax = tideMax === undefined || tideValue <= tideMax;
            const isOk = okMin && okMax;

            if (isOk && currentStart === null) {
                currentStart = hour;
            } else if (!isOk && currentStart !== null) {
                ranges.push({ start: currentStart, end: hour });
                currentStart = null;
            }
        }

        if (currentStart !== null) {
            const lastHour = hours[hours.length - 1] + 1;
            ranges.push({ start: currentStart, end: lastHour });
        }

        const normalizedRanges = ranges.map((range) => {
            const start = Math.max(minHour, Math.min(maxHour, range.start));
            const end = Math.max(minHour, Math.min(maxHour, range.end));
            const span = Math.max(0, end - start);
            const left = ((start - minHour) / totalSpan) * 100;
            const width = (span / totalSpan) * 100;
            const tideStartValue = tideByHour.get(start);
            const tideEndValue = tideByHour.get(end - 1);
            return {
                start,
                end,
                display: `${start}h-${end}h`,
                tideStart: tideStartValue !== undefined ? tideStartValue.toFixed(1) : "-",
                tideEnd: tideEndValue !== undefined ? tideEndValue.toFixed(1) : "-",
                avgWind: undefined,
                left,
                width
            };
        }).filter((range) => range.width > 0);

        if (normalizedRanges.length === 0) {
            return null;
        }

        return {
            id: activity.id,
            name: activity.name,
            type: activity.type,
            icon: style.icon,
            color: style.color,
            isNow,
            ranges: normalizedRanges
        };
    }).filter((a) => a && a.ranges.length > 0);

    return (
        <div className={`bg-gradient-to-br from-teal-500 to-blue-600 rounded-lg shadow-lg p-6 text-white ${className}`}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{t("tide.title")}</h3>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    tide.isRising ? "bg-green-400/30" : "bg-orange-400/30"
                }`}>
                    {tide.isRising ? "↑ " + t("tide.rising") : "↓ " + t("tide.falling")}
                </span>
            </div>

            <div className="space-y-4">
                <div>
                    <p className="text-sm opacity-90">{t("tide.currentHeight")}</p>
                    <p className="text-4xl font-bold">
                        {tide.heightNow.toFixed(2)}
                        <span className="text-xl ml-2">m</span>
                    </p>
                    {tide.coefficient && (
                        <p className="text-sm mt-1 opacity-90">
                            {t("tide.coefficient")} {tide.coefficient}
                        </p>
                    )}
                </div>

                {/* Day timeline from sunrise to sunset with activity windows (no overlapping bars) */}
                <div className="space-y-2">
                    <div className="flex justify-between text-xs opacity-80">
                        <span>{minHour}h</span>
                        <span>{maxHour}h</span>
                    </div>
                    <div className="relative max-h-32 overflow-y-auto pr-1">
                        {tideCurvePoints && (
                            <svg
                                className="absolute inset-0 w-full h-full pointer-events-none"
                                viewBox="0 0 100 100"
                                preserveAspectRatio="none"
                            >
                                <polyline
                                    points={tideCurvePoints}
                                    fill="none"
                                    stroke="rgba(255,255,255,0.4)"
                                    strokeWidth="2"
                                />
                            </svg>
                        )}
                        <div className="relative space-y-1">
                            {activityWindows.map((activity) => (
                                <div key={activity.id} className="flex items-center gap-2">
                                    <div className="flex items-center gap-1 w-20 text-[0.7rem] truncate">
                                        <span>{activity.icon}</span>
                                        <span className="truncate">{activity.name}</span>
                                    </div>
                                    <div className="relative flex-1 h-4 bg-white/10 rounded-full overflow-hidden">
                                        <div 
                                            className="absolute left-0 top-0 h-full bg-white/5"
                                            style={{ width: `${Math.max(0, Math.min(100, tidePercent))}%` }}
                                        />
                                        {activity.ranges.map((range, idx) => (
                                            <div
                                                key={`${activity.id}-${idx}`}
                                                className={`absolute top-1/2 -translate-y-1/2 rounded-full h-3 flex items-center justify-center text-[0.6rem] font-semibold shadow-sm ${activity.color} ${activity.isNow ? 'ring-1 ring-white' : 'opacity-80'}`}
                                                style={{
                                                    left: `${range.left}%`,
                                                    width: `${range.width}%`
                                                }}
                                                title={`${activity.name} ${range.display} (${range.tideStart}m→${range.tideEnd}m)`}
                                            >
                                                <span className="px-1 truncate">
                                                    {range.display}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {activityWindows.length === 0 && (
                                <p className="text-xs opacity-70">Aucune plage d'activité disponible aujourd'hui.</p>
                            )}
                        </div>
                    </div>
                </div>
                
                {/* Active activities at current tide */}
                <div className="pt-2">
                    <p className="text-xs opacity-75 mb-2">Activités possibles maintenant :</p>
                    <div className="flex flex-wrap gap-2">
                        {(activities || []).map((activity, idx) => {
                            const planningActivity = activityWindows.find((a) => a.id === activity.id);
                            const nextRange = planningActivity?.ranges?.[0];
                            const style = typeStyles[activity.type] || { color: "bg-sky-400", icon: "🌊" };
                            return (
                            <span
                                key={idx}
                                className={`px-2 py-1 rounded-full text-xs ${style.color} bg-opacity-30 border border-white/30`}
                            >
                                {style.icon} {activity.name}
                                {nextRange && (
                                    <span className="ml-1 opacity-80">{nextRange.display} ({nextRange.tideStart}m→{nextRange.tideEnd}m)</span>
                                )}
                            </span>
                            );
                        })}
                        {(activities || []).length === 0 && (
                            <span className="text-xs opacity-75">Marée trop basse</span>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-white/20 pt-4">
                    <div>
                        <p className="text-xs opacity-75">{t("tide.highTide")}</p>
                        <p className="text-lg font-semibold">{tide.timeHigh}</p>
                        <p className="text-sm opacity-90">{tide.heightHigh.toFixed(2)}m</p>
                    </div>
                    <div>
                        <p className="text-xs opacity-75">{t("tide.lowTide")}</p>
                        <p className="text-lg font-semibold">{tide.timeLow}</p>
                        <p className="text-sm opacity-90">{tide.heightLow.toFixed(2)}m</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
