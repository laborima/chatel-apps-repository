"use client";

import { t } from "../lib/i18n";

/**
 * ForecastCard Component
 * Displays daily forecast with temperature, wind, and precipitation
 */
export default function ForecastCard({ forecast, className = "" }) {
    if (!forecast) {
        return null;
    }

    const date = new Date(forecast.date);
    const dayName = date.toLocaleDateString("fr-FR", { weekday: "short" });
    const dayNumber = date.getDate();
    const month = date.toLocaleDateString("fr-FR", { month: "short" });

    const getWindColor = (knots) => {
        if (!knots) return "text-zinc-400";
        if (knots < 12) return "text-green-600 dark:text-green-400";
        if (knots < 20) return "text-yellow-600 dark:text-yellow-400";
        return "text-orange-600 dark:text-orange-400";
    };

    return (
        <div className={`bg-white dark:bg-zinc-800 rounded-lg shadow-md p-4 min-w-[200px] ${className}`}>
            <div className="text-center mb-3">
                <p className="text-lg font-bold text-zinc-900 dark:text-zinc-50 capitalize">
                    {dayName}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {dayNumber} {month}
                </p>
            </div>

            <div className="space-y-3">
                {forecast.temperatureMin !== null && forecast.temperatureMin !== undefined && 
                 forecast.temperatureMax !== null && forecast.temperatureMax !== undefined && (
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">🌡️</span>
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                            {forecast.temperatureMin.toFixed(0)}° / {forecast.temperatureMax.toFixed(0)}°C
                        </span>
                    </div>
                )}

                {forecast.windSpeedMaxKnots !== null && forecast.windSpeedMaxKnots !== undefined && (
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">💨</span>
                        <span className={`text-sm font-semibold ${getWindColor(forecast.windSpeedMaxKnots)}`}>
                            {forecast.windSpeedMaxKnots.toFixed(1)} {t("weather.knots")}
                        </span>
                    </div>
                )}

                {forecast.precipitationProbability !== null && forecast.precipitationProbability !== undefined && (
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">💧</span>
                        <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                            {(forecast.precipitationProbability * 100).toFixed(0)}%
                        </span>
                    </div>
                )}

                {forecast.humidity !== null && forecast.humidity !== undefined && (
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">💦</span>
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">
                            {forecast.humidity.toFixed(0)}%
                        </span>
                    </div>
                )}
            </div>

            {forecast.periods && forecast.periods.length > 0 && (
                <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                        {t("planner.bestTime")}
                    </p>
                    <div className="flex gap-1 overflow-x-auto">
                        {forecast.periods.slice(0, 4).map((period, idx) => {
                            const hour = new Date(period.timestamp).getHours();
                            return (
                                <div 
                                    key={idx}
                                    className="flex-shrink-0 text-center bg-zinc-50 dark:bg-zinc-900 rounded px-2 py-1"
                                >
                                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                        {hour}h
                                    </p>
                                    {period.windSpeedKnots && (
                                        <p className={`text-xs ${getWindColor(period.windSpeedKnots)}`}>
                                            {period.windSpeedKnots.toFixed(0)}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
