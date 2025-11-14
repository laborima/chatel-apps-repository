"use client";

import { t } from "../lib/i18n";

/**
 * ForecastCard Component
 * Displays daily forecast with temperature, wind, precipitation, and possible activities with time slots
 * Clickable to show detailed hourly view
 */
export default function ForecastCard({ forecast, activities = [], daySlots = [], mergedActivities = [], onCardClick, className = "" }) {
    if (!forecast) {
        return null;
    }

    const handleClick = () => {
        if (onCardClick) {
            onCardClick();
        }
    };

    const getActivityIcon = (activityType) => {
        const icons = {
            sailboat: "⛵",
            windsurf: "🏄",
            wingfoil: "🪁",
            speedsail: "🚀",
            sup: "🏄‍♂️",
            default: "🌊"
        };
        return icons[activityType] || icons.default;
    };

    const getActivityName = (activity) => {
        const translations = {
            "Cirrus Sailing": "Voile",
            "Windsurf Session": "Windsurf",
            "Wingfoil Session": "Wing Foil",
            "Speedsail on Beach": "Speed Sail",
            "Paddle Cruise": "SUP"
        };
        return translations[activity.name] || activity.name;
    };

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
        <div
            className={`bg-gradient-to-br from-sky-500 to-indigo-600 rounded-lg shadow-lg min-w-[280px] cursor-pointer hover:shadow-xl hover:scale-105 transition-all text-white ${className}`}
            onClick={handleClick}
        >
            {/* Header with day name and date */}
            <div className="flex items-center justify-between mb-4 px-6 pt-5">
                <div>
                    <p className="text-sm uppercase tracking-wide opacity-80">
                        {dayName}
                    </p>
                    <p className="text-2xl font-bold">
                        {dayNumber} {month}
                    </p>
                </div>
            </div>

            <div className="px-6 pb-5">
                <div className="space-y-3">
                    {forecast.temperatureMin !== null && forecast.temperatureMin !== undefined &&
                        forecast.temperatureMax !== null && forecast.temperatureMax !== undefined && (
                            <div className="flex items-center justify-between text-base">
                                <p className="text-sm opacity-90">Température</p>
                                <p className="text-xl font-semibold">
                                    {forecast.temperatureMin.toFixed(0)}° / {forecast.temperatureMax.toFixed(0)}°C
                                </p>
                            </div>
                        )}

                    {forecast.windSpeedMaxKnots !== null && forecast.windSpeedMaxKnots !== undefined && (
                        <div className="flex items-center justify-between text-base">
                            <p className="text-sm opacity-90">Vent max</p>
                            <p className="text-xl font-semibold">
                                {forecast.windSpeedMaxKnots.toFixed(1)} {t("weather.knots")}
                            </p>
                        </div>
                    )}

                    {forecast.precipitationProbability !== null && forecast.precipitationProbability !== undefined && (
                        <div className="flex items-center justify-between text-base">
                            <p className="text-sm opacity-90">Pluie</p>
                            <p className="text-lg font-semibold">
                                {(forecast.precipitationProbability * 100).toFixed(0)}%
                            </p>
                        </div>
                    )}

                    {forecast.humidity !== null && forecast.humidity !== undefined && (
                        <div className="flex items-center justify-between text-base">
                            <p className="text-sm opacity-90">Humidité</p>
                            <p className="text-lg font-semibold">
                                {forecast.humidity.toFixed(0)}%
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {mergedActivities && mergedActivities.length > 0 && (
                <div className="border-t border-white/20 pt-4 pb-4 px-6">
                    <p className="text-sm font-semibold mb-3">
                        Activités possibles
                    </p>
                    <div className="space-y-3">
                        {mergedActivities.slice(0, 3).map((activity, idx) => (
                            <div
                                key={idx}
                                className="bg-white/15 rounded-xl px-4 py-3 shadow-sm border border-white/10 hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-base">{getActivityIcon(activity.type)}</span>
                                    <span className="text-xs font-semibold flex-1">
                                        {getActivityName(activity)}
                                    </span>
                                    {activity.evaluation?.score && (
                                        <span className="text-xs font-bold">
                                            {activity.evaluation.score}%
                                        </span>
                                    )}
                                </div>
                                {activity.timeRanges && activity.timeRanges.length > 0 && (
                                    <div className="ml-6 space-y-1">
                                        {activity.timeRanges.map((range, rIdx) => (
                                            <div key={rIdx}>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-xs">🕒</span>
                                                    <span className="text-xs font-medium">
                                                        {range.display} ({range.tideStart}m→{range.tideEnd}m)
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs ml-4">
                                                    <span className="opacity-90">
                                                        💨 {range.avgWind} kts
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                        {mergedActivities.length > 3 && (
                            <p className="text-xs text-center pt-1 opacity-75">
                                +{mergedActivities.length - 3} autre{mergedActivities.length - 3 > 1 ? 's' : ''}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {activities && activities.length === 0 && (
                <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-700">
                    <p className="text-sm text-center italic text-zinc-600 dark:text-zinc-400">
                        Aucune activité disponible
                    </p>
                </div>
            )}

            {(!activities || activities.length === 0) && forecast.periods && forecast.periods.length > 0 && (
                (() => {
                    // Filter periods to daylight hours only (sunrise to sunset)
                    const daylightPeriods = forecast.periods.filter((period) => {
                        if (!forecast.sunrise || !forecast.sunset) return true;
                        const sunrise = new Date(forecast.sunrise);
                        const sunset = new Date(forecast.sunset);
                        const periodTime = new Date(period.timestamp);
                        return periodTime >= sunrise && periodTime <= sunset;
                    });

                    // Score each period based on wind conditions
                    const scorePeriod = (period) => {
                        const wind = period.windSpeedKnots || 0;
                        
                        // Ideal wind range for most water sports: 12-20 knots
                        // Score higher for winds in this range
                        let score = 0;
                        
                        if (wind >= 12 && wind <= 20) {
                            // Ideal range: full score, peak at 16 knots
                            score = 100 - Math.abs(wind - 16) * 2;
                        } else if (wind >= 8 && wind < 12) {
                            // Light but usable
                            score = 60 + (wind - 8) * 10;
                        } else if (wind > 20 && wind <= 28) {
                            // Strong but manageable
                            score = 80 - (wind - 20) * 2;
                        } else if (wind > 28) {
                            // Too strong
                            score = Math.max(10, 50 - (wind - 28));
                        } else {
                            // Too light (< 8 knots)
                            score = wind * 7;
                        }
                        
                        return Math.max(0, Math.min(100, score));
                    };

                    // Sort periods by score (best first) and take top 5
                    const bestPeriods = daylightPeriods
                        .map(period => ({ period, score: scorePeriod(period) }))
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 5)
                        .map(item => item.period);

                    return bestPeriods.length > 0 ? (
                        <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700 px-6">
                            <p className="text-sm font-semibold mb-3 text-zinc-900 dark:text-zinc-50">
                                Meilleur créneau
                            </p>
                            <div className="flex gap-2 overflow-x-auto pb-2">
                                {bestPeriods.map((period, idx) => {
                                    const hour = new Date(period.timestamp).getHours();
                                    const wind = period.windSpeedKnots;
                                    const direction = period.windDirectionCardinal || "—";
                                    const weatherCode = period.weatherCode;
                                    
                                    const getWeatherIcon = (code) => {
                                        if (!code) return "🌤️";
                                        if (code === 0 || code === 1) return "☀️";
                                        if (code === 2) return "⛅";
                                        if (code === 3) return "☁️";
                                        if (code >= 51 && code <= 67) return "🌧️";
                                        return "🌤️";
                                    };

                                    return (
                                        <div 
                                            key={idx}
                                            className="flex-shrink-0 text-center bg-violet-50 dark:bg-violet-900/20 rounded-lg p-2"
                                        >
                                            <p className="text-xs font-semibold mb-1 text-zinc-900 dark:text-zinc-50">
                                                {hour}h
                                            </p>
                                            <p className="text-sm mb-1">
                                                {getWeatherIcon(weatherCode)}
                                            </p>
                                            {wind && (
                                                <p className="text-xs font-bold mb-1 text-zinc-900 dark:text-zinc-50">
                                                    {wind.toFixed(0)} kts
                                                </p>
                                            )}
                                            <p className="text-xs text-zinc-700 dark:text-zinc-300">
                                                {direction}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null;
                })()
            )}
        </div>
    );
}
