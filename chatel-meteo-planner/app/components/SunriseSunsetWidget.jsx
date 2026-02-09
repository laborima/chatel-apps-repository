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
export default function SunriseSunsetWidget({ forecast, className = "", timeZone }) {
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
    const resolvedTimeZone = timeZone || forecast?.location?.timezone || "UTC";
    
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
        return date.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: resolvedTimeZone
        });
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

    const bgGradient = isDaytime
        ? `bg-gradient-to-br ${weatherTheme.gradient}`
        : "bg-gradient-to-br from-indigo-900 via-slate-800 to-indigo-950";

    const sunX = 10 + (180 * dayProgress / 100);
    const sunY = 48 - (40 * Math.sin((dayProgress / 100) * Math.PI));

    const generateArcPath = () => {
        const points = [];
        for (let i = 0; i <= 20; i++) {
            const t = i / 20;
            const x = 10 + 180 * t;
            const y = 48 - (40 * Math.sin(t * Math.PI));
            points.push(`${x},${y}`);
        }
        return `M ${points[0]} ` + points.slice(1).map(p => `L ${p}`).join(" ");
    };

    const generateFilledArcPath = () => {
        const arcPath = generateArcPath();
        return `${arcPath} L 190,55 L 10,55 Z`;
    };

    return (
        <div className={`${bgGradient} rounded-lg shadow-lg p-6 text-white ${className}`}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                    {isDaytime ? weatherTheme.icon : "🌙"} {isDaytime ? weatherTheme.label : "Nuit"}
                </h3>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    isDaytime ? "bg-white/30" : "bg-white/10"
                }`}>
                    {isDaytime ? "🌞 Jour" : "🌙 Nuit"}
                </span>
            </div>

            <div className="space-y-4">
                <div className="relative w-full h-28 flex items-end">
                    <svg className="w-full h-full" viewBox="0 0 200 60">
                        <defs>
                            <linearGradient id="arcFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={isDaytime ? "rgba(255,220,100,0.4)" : "rgba(100,120,200,0.2)"} />
                                <stop offset="100%" stopColor={isDaytime ? "rgba(255,180,50,0.1)" : "rgba(50,60,120,0.05)"} />
                            </linearGradient>
                            <linearGradient id="arcStroke" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor={isDaytime ? "rgba(255,200,50,0.8)" : "rgba(150,160,220,0.5)"} />
                                <stop offset="50%" stopColor={isDaytime ? "rgba(255,255,150,1)" : "rgba(180,190,240,0.7)"} />
                                <stop offset="100%" stopColor={isDaytime ? "rgba(255,150,50,0.8)" : "rgba(150,160,220,0.5)"} />
                            </linearGradient>
                        </defs>

                        <line x1="10" y1="48" x2="190" y2="48" stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4,4" />

                        <path d={generateFilledArcPath()} fill="url(#arcFill)" />
                        <path d={generateArcPath()} fill="none" stroke="url(#arcStroke)" strokeWidth="2.5" />

                        <text x="10" y="57" fill="rgba(255,255,255,0.5)" fontSize="6" textAnchor="middle">🌅</text>
                        <text x="190" y="57" fill="rgba(255,255,255,0.5)" fontSize="6" textAnchor="middle">🌇</text>

                        {isDaytime ? (
                            <g>
                                <circle cx={sunX} cy={sunY} r="10" fill="rgba(255,220,100,0.3)" />
                                <circle cx={sunX} cy={sunY} r="7" fill="rgba(255,240,150,0.5)" />
                                <circle cx={sunX} cy={sunY} r="5" fill="#FFD700">
                                    <animate attributeName="r" values="5;6;5" dur="2s" repeatCount="indefinite" />
                                </circle>
                            </g>
                        ) : (
                            <g>
                                <circle cx="100" cy="20" r="6" fill="rgba(200,210,255,0.6)" />
                                <circle cx="97" cy="18" r="5" fill={isDaytime ? "transparent" : "rgba(30,30,80,0.8)"} />
                            </g>
                        )}
                    </svg>
                </div>

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
