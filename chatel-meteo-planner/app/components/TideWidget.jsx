"use client";

import { t } from "../lib/i18n";

/**
 * TideWidget Component
 * Displays current tide information with height, trend, and high/low times
 */
export default function TideWidget({ tide, className = "" }) {
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

    // Activity tide requirements
    const activityMarkers = [
        { name: "cirrus", minHeight: 2.0, icon: "⛵", color: "bg-blue-400" },
        { name: "windsurf", minHeight: 3.0, icon: "🏄", color: "bg-green-400" },
        { name: "wing", minHeight: 4.0, icon: "🪁", color: "bg-purple-400" }
    ].map(activity => ({
        ...activity,
        position: ((activity.minHeight - tide.heightLow) / (tide.heightHigh - tide.heightLow)) * 100,
        isActive: tide.heightNow >= activity.minHeight
    }));

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

                {/* Tide progress bar with activity markers */}
                <div className="relative w-full h-8 bg-white/20 rounded-full overflow-visible">
                    {/* Current tide level */}
                    <div 
                        className="absolute left-0 top-0 h-full bg-white rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(0, Math.min(100, tidePercent))}%` }}
                    />
                    
                    {/* Activity markers */}
                    {activityMarkers.map((activity, idx) => {
                        const position = Math.max(0, Math.min(100, activity.position));
                        return position >= 0 && position <= 100 ? (
                            <div
                                key={idx}
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
                                style={{ left: `${position}%` }}
                                title={`${activity.name}: ${activity.minHeight}m`}
                            >
                                <div className={`w-8 h-8 rounded-full ${activity.color} ${
                                    activity.isActive ? 'ring-4 ring-white shadow-lg' : 'opacity-50'
                                } flex items-center justify-center text-sm transition-all`}>
                                    {activity.icon}
                                </div>
                            </div>
                        ) : null;
                    })}
                </div>
                
                {/* Active activities at current tide */}
                <div className="pt-2">
                    <p className="text-xs opacity-75 mb-2">Activités possibles maintenant :</p>
                    <div className="flex flex-wrap gap-2">
                        {activityMarkers.filter(a => a.isActive).map((activity, idx) => (
                            <span
                                key={idx}
                                className={`px-2 py-1 rounded-full text-xs ${activity.color} bg-opacity-30 border border-white/30`}
                            >
                                {activity.icon} {t(`activities.${activity.name}`)}
                            </span>
                        ))}
                        {activityMarkers.filter(a => a.isActive).length === 0 && (
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
