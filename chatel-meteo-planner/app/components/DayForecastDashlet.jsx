"use client";

import { t } from "../lib/i18n";

/**
 * DayForecastDashlet Component
 * Displays today's forecast with hourly wind conditions and weather summary
 */
export default function DayForecastDashlet({ forecast, className = "" }) {
    if (!forecast) {
        return null;
    }

    // Filter periods to daylight hours only (sunrise to sunset)
    const filterDaylightPeriods = () => {
        if (!forecast.periods || forecast.periods.length === 0) {
            return [];
        }

        let sunrise = null;
        let sunset = null;

        if (forecast.sunrise) {
            sunrise = new Date(forecast.sunrise);
        }
        if (forecast.sunset) {
            sunset = new Date(forecast.sunset);
        }

        if (!sunrise || !sunset) {
            return forecast.periods.slice(0, 12);
        }

        return forecast.periods.filter((period) => {
            const periodTime = new Date(period.timestamp);
            return periodTime >= sunrise && periodTime <= sunset;
        });
    };

    const periods = filterDaylightPeriods();

    // Group periods into 3-hour intervals
    const group3HourPeriods = () => {
        if (periods.length === 0) return [];

        const grouped = [];
        for (let i = 0; i < periods.length; i += 3) {
            const period1 = periods[i];
            const period2 = periods[i + 1];
            const period3 = periods[i + 2];

            // Calculate average wind speed for the 3-hour group
            const winds = [period1.windSpeedKnots, period2?.windSpeedKnots, period3?.windSpeedKnots].filter(w => w !== null && w !== undefined);
            const avgWind = winds.length > 0 ? winds.reduce((a, b) => a + b, 0) / winds.length : null;

            // Use first period's data as base, with averaged wind
            grouped.push({
                timestamp: period1.timestamp,
                hour: new Date(period1.timestamp).getHours(),
                windSpeedKnots: avgWind,
                windDirectionCardinal: period1.windDirectionCardinal || "—",
                weatherCode: period1.weatherCode,
                isGroup: true,
                periods: [period1, period2, period3].filter(p => p)
            });
        }
        return grouped;
    };

    const groupedPeriods = group3HourPeriods();

    const getWindColor = (knots) => {
        if (!knots) return "text-zinc-400";
        if (knots < 12) return "text-green-600 dark:text-green-400";
        if (knots < 20) return "text-yellow-600 dark:text-yellow-400";
        if (knots < 28) return "text-orange-600 dark:text-orange-400";
        return "text-red-600 dark:text-red-400";
    };

    const getWindBgColor = (knots) => {
        if (!knots) return "bg-zinc-100 dark:bg-zinc-800";
        if (knots < 12) return "bg-green-100 dark:bg-green-900/30";
        if (knots < 20) return "bg-yellow-100 dark:bg-yellow-900/30";
        if (knots < 28) return "bg-orange-100 dark:bg-orange-900/30";
        return "bg-red-100 dark:bg-red-900/30";
    };

    const getWeatherIcon = (weatherCode) => {
        if (!weatherCode) return "🌤️";
        if (weatherCode === 0 || weatherCode === 1) return "☀️";
        if (weatherCode === 2) return "⛅";
        if (weatherCode === 3) return "☁️";
        if (weatherCode === 45 || weatherCode === 48) return "🌫️";
        if (weatherCode >= 51 && weatherCode <= 67) return "🌧️";
        if (weatherCode >= 71 && weatherCode <= 77) return "❄️";
        if (weatherCode >= 80 && weatherCode <= 82) return "⛈️";
        return "🌤️";
    };

    const getDirectionArrow = (direction) => {
        if (!direction) {
            return "";
        }
        const dir = direction.toUpperCase();
        if (dir.includes("NE")) return "↗"; // North-East
        if (dir.includes("SE")) return "↘"; // South-East
        if (dir.includes("SW")) return "↙"; // South-West
        if (dir.includes("NW")) return "↖"; // North-West
        if (dir.startsWith("N")) return "↑";
        if (dir.startsWith("S")) return "↓";
        if (dir.startsWith("E")) return "→";
        if (dir.startsWith("W")) return "←";
        return "‽";
    };

    return (
        <div className={`bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg shadow-lg p-6 text-white ${className}`}>
            <h3 className="text-xl font-semibold mb-4">{t("weather.forecast")}</h3>

            <div className="space-y-4">
                {/* Summary Stats, simple layout like WeatherCard */}
                <div className="grid grid-cols-2 gap-4 text-base">
                    <div>
                        <p className="text-sm opacity-90">Température</p>
                        <p className="text-3xl font-bold">
                            {forecast.temperatureMin?.toFixed(0)}°/{forecast.temperatureMax?.toFixed(0)}°C
                        </p>
                    </div>
                    <div>
                        <p className="text-sm opacity-90">Vent max</p>
                        <p className="text-2xl font-bold">
                            {forecast.windSpeedMaxKnots?.toFixed(1)} kts
                        </p>
                    </div>
                    <div>
                        <p className="text-sm opacity-90">Pluie</p>
                        <p className="text-xl font-semibold">
                            {typeof forecast.precipitationProbability === "number"
                                ? `${(forecast.precipitationProbability * 100).toFixed(0)}%`
                                : "—"}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm opacity-90">Humidité</p>
                        <p className="text-xl font-semibold">
                            {forecast.humidity?.toFixed(0)}%
                        </p>
                    </div>
                </div>

                {/* 3-Hour Wind Forecast */}
                {groupedPeriods.length > 0 && (
                    <div className="border-t border-white/20 pt-4">
                        <p className="text-base opacity-90 mb-3">Vent par créneau (3h)</p>
                        <div
                            className="grid gap-3"
                            style={{ gridTemplateColumns: `repeat(${Math.min(groupedPeriods.length, 5)}, 1fr)` }}
                        >
                            {groupedPeriods.slice(0, 5).map((group, idx) => {
                                const hour = group.hour;
                                const wind = group.windSpeedKnots;
                                const direction = group.windDirectionCardinal;
                                const directionArrow = getDirectionArrow(direction);
                                const weatherIcon = getWeatherIcon(group.weatherCode);
                                return (
                                    <div
                                        key={idx}
                                        className="text-center text-sm"
                                    >
                                        <p className="font-semibold mb-1">
                                            {hour}h-{(hour + 3) % 24}h
                                        </p>
                                        <p className="text-lg mb-1">
                                            {weatherIcon}
                                        </p>
                                        <p className="text-xl font-bold mb-1">
                                            {wind?.toFixed(0) || "—"} kts
                                        </p>
                                        <p className="text-2xl mb-0">
                                            {directionArrow}
                                        </p>
                                        {direction && (
                                            <p className="text-xs opacity-80 mt-1">
                                                {direction}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
