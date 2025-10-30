"use client";

import { t } from "../lib/i18n";

/**
 * DayDetailsModal Component
 * Displays hourly conditions (wind, tide, activities) for a selected day
 */
export default function DayDetailsModal({ isOpen, onClose, forecast, daySlots = [], activities = [] }) {
    if (!isOpen || !forecast) {
        return null;
    }

    // Debug: log the daySlots structure
    console.log("[DayDetailsModal] daySlots:", daySlots);
    if (daySlots.length > 0) {
        console.log("[DayDetailsModal] First slot:", daySlots[0]);
    }

    const date = new Date(forecast.date);
    const dayName = date.toLocaleDateString("fr-FR", { weekday: "long" });
    const dayNumber = date.getDate();
    const month = date.toLocaleDateString("fr-FR", { month: "long" });

    const getWindColor = (knots) => {
        if (!knots) return "text-zinc-400";
        if (knots < 12) return "text-green-600 dark:text-green-400";
        if (knots < 20) return "text-yellow-600 dark:text-yellow-400";
        return "text-orange-600 dark:text-orange-400";
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div 
                className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-cyan-500 p-6 text-white">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold capitalize">
                                {dayName} {dayNumber} {month}
                            </h2>
                            <p className="text-blue-100 text-sm mt-1">
                                Conditions détaillées heure par heure
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
                    {/* Summary */}
                    <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center">
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">Température</p>
                                <p className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                                    {forecast.temperatureMin?.toFixed(0)}° - {forecast.temperatureMax?.toFixed(0)}°C
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">Vent max</p>
                                <p className={`text-lg font-bold ${getWindColor(forecast.windSpeedMaxKnots)}`}>
                                    {forecast.windSpeedMaxKnots?.toFixed(1)} kts
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">Précipitations</p>
                                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                    {typeof forecast.precipitationProbability === "number"
                                        ? `${(forecast.precipitationProbability * 100).toFixed(0)}%`
                                        : "—"}
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">Activités</p>
                                <p className="text-lg font-bold text-green-600 dark:text-green-400">
                                    {activities.length}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Hourly Table */}
                    <div className="p-6">
                        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
                            📊 Conditions heure par heure
                        </h3>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-zinc-100 dark:bg-zinc-800">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-zinc-700 dark:text-zinc-300">Heure</th>
                                        <th className="px-4 py-3 text-left font-semibold text-zinc-700 dark:text-zinc-300">💨 Vent</th>
                                        <th className="px-4 py-3 text-left font-semibold text-zinc-700 dark:text-zinc-300">Direction</th>
                                        <th className="px-4 py-3 text-left font-semibold text-zinc-700 dark:text-zinc-300">🌊 Marée</th>
                                        <th className="px-4 py-3 text-left font-semibold text-zinc-700 dark:text-zinc-300">🌡️ Temp</th>
                                        <th className="px-4 py-3 text-left font-semibold text-zinc-700 dark:text-zinc-300">Activités possibles</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                    {daySlots.map((slot, idx) => {
                                        // Extract hour with multiple fallbacks
                                        let hour = '-';
                                        if (slot.hour !== undefined && slot.hour !== null && !isNaN(slot.hour)) {
                                            hour = slot.hour;
                                        } else if (slot.time) {
                                            const timeDate = new Date(slot.time);
                                            if (!isNaN(timeDate.getTime())) {
                                                hour = timeDate.getHours();
                                            }
                                        }
                                        
                                        console.log(`[DayDetailsModal] Slot ${idx}: hour=${hour}, slot.hour=${slot.hour}, slot.time=${slot.time}`);
                                        
                                        return (
                                            <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                                <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-50">
                                                    {hour !== '-' ? `${hour}h` : '-'}
                                                </td>
                                            <td className={`px-4 py-3 font-semibold ${getWindColor(slot.conditions?.windKnots)}`}>
                                                {slot.conditions?.windKnots?.toFixed(1)} kts
                                            </td>
                                            <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                                                {slot.conditions?.windDirection || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                                                {slot.conditions?.tideEstimate ? `${slot.conditions.tideEstimate.toFixed(1)}m` : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                                                {slot.conditions?.temperature ? `${slot.conditions.temperature.toFixed(0)}°C` : '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-1">
                                                    {slot.activities && slot.activities.length > 0 ? (
                                                        slot.activities.slice(0, 3).map((activity, aIdx) => (
                                                            <span
                                                                key={aIdx}
                                                                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-xs font-medium"
                                                                title={activity.name}
                                                            >
                                                                {getActivityIcon(activity.type)}
                                                                <span className="hidden sm:inline">{getActivityName(activity)}</span>
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-xs text-zinc-400 italic">Aucune</span>
                                                    )}
                                                    {slot.activities && slot.activities.length > 3 && (
                                                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                                            +{slot.activities.length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {(!daySlots || daySlots.length === 0) && (
                            <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                                <p>Aucune donnée horaire disponible pour ce jour</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
