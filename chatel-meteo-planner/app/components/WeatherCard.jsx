"use client";

import { t } from "../lib/i18n";

/**
 * WeatherCard Component
 * Displays current weather conditions with wind speed, direction, and averages
 */
export default function WeatherCard({ wind, onRefresh, loading, lastUpdate, nextRefresh, className = "" }) {
    const renderFooter = () => (
        <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
                onClick={onRefresh}
                disabled={loading}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 disabled:bg-white/10 disabled:text-white/60 text-white rounded-lg font-semibold transition-colors flex items-center gap-2 border border-white/30"
            >
                <span className={loading ? "animate-spin" : ""}>🔄</span>
                {t("actions.refresh")}
            </button>
            {lastUpdate && (
                <div className="flex items-center gap-3 text-xs">
                    <p className="text-white/80">
                        {t("status.lastUpdate")}: {lastUpdate.toLocaleTimeString("fr-FR")}
                    </p>
                    <p className="text-white font-medium bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full">
                        ⏱️ Prochain : {Math.floor((nextRefresh ?? 0) / 60)}:{String((nextRefresh ?? 0) % 60).padStart(2, "0")}
                    </p>
                </div>
            )}
        </div>
    );

    if (!wind || !wind.speedKnots) {
        return (
            <div className={`bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6 ${className}`}>
                <h3 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-50">
                    {t("weather.title")}
                </h3>
                <p className="text-zinc-500 dark:text-zinc-400">{t("status.noData")}</p>
                {onRefresh && renderFooter()}
            </div>
        );
    }

    return (
        <div className={`bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg shadow-lg p-6 text-white ${className}`}>
            <h3 className="text-lg font-semibold mb-4">{t("weather.realTime")}</h3>
            
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm opacity-90">{t("weather.wind")}</p>
                        <p className="text-4xl font-bold">
                            {wind.speedKnots.toFixed(1)}
                            <span className="text-xl ml-2">{t("weather.knots")}</span>
                        </p>
                        {wind.beaufort && (
                            <p className="text-sm mt-1 opacity-90">
                                {t("weather.beaufort")} {wind.beaufort}
                            </p>
                        )}
                    </div>
                    
                    {wind.direction && (
                        <div className="text-right">
                            <p className="text-sm opacity-90">{t("weather.direction")}</p>
                            <p className="text-3xl font-bold">{wind.direction}</p>
                        </div>
                    )}
                </div>

                {(wind.avg1minKnots || wind.avg10minKnots) && (
                    <div className="border-t border-white/20 pt-4">
                        <p className="text-sm opacity-90 mb-2">{t("weather.average")}</p>
                        <div className="flex gap-4">
                            {wind.avg1minKnots && (
                                <div>
                                    <p className="text-xs opacity-75">{t("weather.avg1min")}</p>
                                    <p className="text-xl font-semibold">
                                        {wind.avg1minKnots.toFixed(1)} {t("weather.knots")}
                                    </p>
                                </div>
                            )}
                            {wind.avg10minKnots && (
                                <div>
                                    <p className="text-xs opacity-75">{t("weather.avg10min")}</p>
                                    <p className="text-xl font-semibold">
                                        {wind.avg10minKnots.toFixed(1)} {t("weather.knots")}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {onRefresh && renderFooter()}
        </div>
    );
}
