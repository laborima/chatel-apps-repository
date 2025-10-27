"use client";

import { t } from "../lib/i18n";

/**
 * Get weather theme based on WMO weather code
 * @param {number} weatherCode - WMO weather code
 * @returns {object} - {icon, gradient, label}
 */
const getWeatherTheme = (weatherCode) => {
    if (!weatherCode) {
        return {
            icon: "☀️",
            gradient: "from-yellow-400 to-orange-500",
            label: "Soleil"
        };
    }
    
    // WMO Weather interpretation codes
    if (weatherCode === 0 || weatherCode === 1) {
        return { icon: "☀️", gradient: "from-yellow-400 to-orange-500", label: "Ensoleillé" };
    } else if (weatherCode === 2) {
        return { icon: "🌤️", gradient: "from-blue-400 to-yellow-400", label: "Partiellement nuageux" };
    } else if (weatherCode === 3) {
        return { icon: "☁️", gradient: "from-gray-400 to-gray-500", label: "Nuageux" };
    } else if (weatherCode === 45 || weatherCode === 48) {
        return { icon: "🌫️", gradient: "from-gray-300 to-gray-400", label: "Brouillard" };
    } else if (weatherCode >= 51 && weatherCode <= 57) {
        return { icon: "🌧️", gradient: "from-blue-400 to-blue-600", label: "Bruine" };
    } else if (weatherCode >= 61 && weatherCode <= 67) {
        return { icon: "🌧️", gradient: "from-blue-500 to-blue-700", label: "Pluie" };
    } else if (weatherCode >= 71 && weatherCode <= 77) {
        return { icon: "🌨️", gradient: "from-blue-200 to-blue-400", label: "Neige" };
    } else if (weatherCode >= 80 && weatherCode <= 82) {
        return { icon: "🌦️", gradient: "from-blue-400 to-gray-600", label: "Averses" };
    } else if (weatherCode >= 85 && weatherCode <= 86) {
        return { icon: "🌨️", gradient: "from-blue-300 to-gray-500", label: "Averses de neige" };
    } else if (weatherCode === 95 || weatherCode === 96 || weatherCode === 99) {
        return { icon: "⛈️", gradient: "from-gray-600 to-gray-800", label: "Orage" };
    }
    
    return { icon: "☀️", gradient: "from-yellow-400 to-orange-500", label: "Soleil" };
};

/**
 * SunriseSunsetWidget Component
 * Displays sunrise and sunset times with visual indicator
 */
export default function SunriseSunsetWidget({ forecast, className = "" }) {
    if (!forecast || !forecast.forecasts || forecast.forecasts.length === 0) {
        return (
            <div className={`bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg shadow-lg p-6 text-white ${className}`}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">☀️ Soleil</h3>
                </div>
                <p className="text-sm opacity-75">Chargement des données solaires...</p>
            </div>
        );
    }

    // Get today's forecast data
    const today = forecast.forecasts[0];
    
    console.log("[SunriseSunsetWidget] Today data:", today);
    console.log("[SunriseSunsetWidget] Sunrise:", today.sunrise);
    console.log("[SunriseSunsetWidget] Sunset:", today.sunset);
    
    if (!today.sunrise || !today.sunset) {
        return (
            <div className={`bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg shadow-lg p-6 text-white ${className}`}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">☀️ Soleil</h3>
                </div>
                <p className="text-sm opacity-75">Données sunrise/sunset non disponibles</p>
            </div>
        );
    }

    // Parse sunrise and sunset from ISO strings
    const sunrise = new Date(today.sunrise);
    const sunset = new Date(today.sunset);
    
    const now = new Date();
    const isDaytime = now >= sunrise && now <= sunset;
    
    // Calculate progress through the day
    const dayDuration = sunset - sunrise;
    const elapsed = now - sunrise;
    const dayProgress = isDaytime ? (elapsed / dayDuration) * 100 : (now < sunrise ? 0 : 100);

    const formatTime = (date) => {
        return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    };

    // Get current weather from periods (average weather code around noon)
    const noonPeriods = today.periods?.filter(p => {
        const hour = new Date(p.timestamp).getHours();
        return hour >= 10 && hour <= 14;
    }) || [];
    
    const avgWeatherCode = noonPeriods.length > 0
        ? Math.round(noonPeriods.reduce((sum, p) => sum + (p.weatherCode || 0), 0) / noonPeriods.length)
        : 0;
    
    const weatherTheme = getWeatherTheme(avgWeatherCode);

    return (
        <div className={`bg-gradient-to-br ${weatherTheme.gradient} rounded-lg shadow-lg p-6 text-white ${className}`}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{weatherTheme.icon} {weatherTheme.label}</h3>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    isDaytime ? "bg-white/30" : "bg-black/30"
                }`}>
                    {isDaytime ? "🌞 Jour" : "🌙 Nuit"}
                </span>
            </div>

            <div className="space-y-4">
                {/* Sun position indicator */}
                <div className="relative w-full h-24 flex items-end">
                    {/* Arc representing day */}
                    <svg className="w-full h-full" viewBox="0 0 200 50">
                        {/* Day arc */}
                        <path
                            d="M 10 45 Q 100 5, 190 45"
                            fill="none"
                            stroke="rgba(255,255,255,0.3)"
                            strokeWidth="2"
                        />
                        {/* Current sun position */}
                        {isDaytime && (
                            <circle
                                cx={10 + (180 * dayProgress / 100)}
                                cy={45 - (40 * Math.sin((dayProgress / 100) * Math.PI))}
                                r="6"
                                fill="white"
                                className="drop-shadow-lg"
                            >
                                <animate
                                    attributeName="r"
                                    values="6;8;6"
                                    dur="2s"
                                    repeatCount="indefinite"
                                />
                            </circle>
                        )}
                    </svg>
                </div>

                {/* Sunrise and Sunset times */}
                <div className="grid grid-cols-2 gap-4 border-t border-white/20 pt-4">
                    <div>
                        <p className="text-xs opacity-75">🌅 Lever</p>
                        <p className="text-2xl font-bold">{formatTime(sunrise)}</p>
                    </div>
                    <div>
                        <p className="text-xs opacity-75">🌇 Coucher</p>
                        <p className="text-2xl font-bold">{formatTime(sunset)}</p>
                    </div>
                </div>

                {/* Day duration */}
                <div className="text-center pt-2 border-t border-white/20">
                    <p className="text-xs opacity-75">Durée du jour</p>
                    <p className="text-lg font-semibold">
                        {Math.floor(dayDuration / (1000 * 60 * 60))}h 
                        {Math.floor((dayDuration % (1000 * 60 * 60)) / (1000 * 60))}min
                    </p>
                </div>
            </div>
        </div>
    );
}
