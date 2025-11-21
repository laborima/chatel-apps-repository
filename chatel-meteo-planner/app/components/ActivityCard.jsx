"use client";

import { t } from "../lib/i18n";
import { getActivityIconComponent } from "./ActivityIcons";
import ScoreBadge from "./ScoreBadge";

/**
 * ActivityCard Component
 * Displays an activity with its conditions, gear, suitability score, and recommended time window with tide and wind info
 */
export default function ActivityCard({ activity, showTimeWindow = true, currentConditions = null, className = "" }) {
    const getRecommendedTimeWindow = () => {
        const now = new Date();
        const currentHour = now.getHours();
        const endHour = Math.min(currentHour + 3, 21);
        return `${currentHour}h-${endHour}h`;
    };

    const estimateTideHeight = (currentHeight, isRising, hoursFromNow) => {
        if (!currentHeight) return null;
        const changeRate = isRising ? 0.3 : -0.3;
        const estimatedHeight = currentHeight + (changeRate * hoursFromNow);
        return Math.max(0, Math.min(6, estimatedHeight));
    };

    return (
        <div className={`bg-white dark:bg-zinc-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow ${className}`}>
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="text-4xl">
                        {getActivityIconComponent(activity.type, "w-10 h-10 text-zinc-700 dark:text-zinc-200")}
                    </span>
                    <div>
                        <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 capitalize">
                            {t(`activities.${activity.name}`)}
                        </h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">{activity.type}</p>
                    </div>
                </div>
                
                {activity.evaluation && (
                    <ScoreBadge evaluation={activity.evaluation} />
                )}
            </div>

            {showTimeWindow && (
                <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg border-l-4 border-blue-500">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">🕒</span>
                        <div className="flex-1">
                            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                                {t("activities.timeWindow")}
                            </p>
                            <p className="text-base font-bold text-blue-900 dark:text-blue-100">
                                {getRecommendedTimeWindow()}
                            </p>
                        </div>
                    </div>
                    
                    {currentConditions && (
                        <div className="grid grid-cols-2 gap-3 mt-2 pt-3 border-t border-blue-200 dark:border-blue-800">
                            {currentConditions.tide && (
                                <div className="flex items-start gap-2">
                                    <span className="text-sm">🌊</span>
                                    <div className="flex-1">
                                        <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                            Marée
                                        </p>
                                        <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                                            {currentConditions.tide.heightNow?.toFixed(1)}m → {estimateTideHeight(
                                                currentConditions.tide.heightNow,
                                                currentConditions.tide.isRising,
                                                3
                                            )?.toFixed(1)}m
                                        </p>
                                        <p className="text-xs text-blue-700 dark:text-blue-300">
                                            {currentConditions.tide.isRising ? '↑ Montante' : '↓ Descendante'}
                                        </p>
                                    </div>
                                </div>
                            )}
                            
                            {currentConditions.wind && (
                                <div className="flex items-start gap-2">
                                    <span className="text-sm">💨</span>
                                    <div className="flex-1">
                                        <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                            Vent moyen
                                        </p>
                                        <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                                            {currentConditions.wind.speedKnots?.toFixed(1)} noeuds
                                        </p>
                                        <p className="text-xs text-blue-700 dark:text-blue-300">
                                            {currentConditions.wind.direction || 'Variable'}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activity.conditions && (
                <div className="mb-4 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                        {t("activities.conditions")}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                        {activity.conditions.windMinKnots !== undefined && (
                            <div>
                                <span className="font-medium">{t("weather.wind")}:</span>{" "}
                                {activity.conditions.windMinKnots}–{activity.conditions.windMaxKnots || "∞"} {t("weather.knots")}
                            </div>
                        )}
                        {activity.conditions.tideMinMeters !== undefined && (
                            <div>
                                <span className="font-medium">{t("tide.title")}:</span>{" "}
                                {activity.conditions.tideMinMeters ? `> ${activity.conditions.tideMinMeters}m` : ""}
                                {activity.conditions.tideMaxMeters ? `< ${activity.conditions.tideMaxMeters}m` : ""}
                            </div>
                        )}
                        {activity.idealDirection && (
                            <div>
                                <span className="font-medium">{t("weather.direction")}:</span>{" "}
                                {activity.idealDirection}
                            </div>
                        )}
                        {activity.conditions.minimalDurationHours && (
                            <div>
                                <span className="font-medium">{t("activities.duration")}:</span>{" "}
                                {activity.conditions.minimalDurationHours} {t("activities.hours")}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activity.gearMatches && (
                <div className="mb-4">
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                        {t("activities.suggestedGear")}
                    </p>
                    <div className="space-y-2">
                        {activity.gearMatches.boards?.length > 0 && (
                            <div>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                                    {t("gear.boards")}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {activity.gearMatches.boards.map((board, idx) => (
                                        <span
                                            key={idx}
                                            className={`px-2 py-1 rounded text-xs ${
                                                board.isFavorite
                                                    ? "bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-200 font-semibold"
                                                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                                            }`}
                                        >
                                            {board.isFavorite && "⭐ "}{board.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {activity.gearMatches.sails?.length > 0 && (
                            <div>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                                    {t("gear.sails")}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {activity.gearMatches.sails.map((sail, idx) => (
                                        <span
                                            key={idx}
                                            className={`px-2 py-1 rounded text-xs ${
                                                sail.isFavorite
                                                    ? "bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-200 font-semibold"
                                                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                                            }`}
                                        >
                                            {sail.isFavorite && "⭐ "}{sail.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {activity.gearMatches.wings?.length > 0 && (
                            <div>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                                    {t("gear.wings")}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {activity.gearMatches.wings.map((wing, idx) => (
                                        <span
                                            key={idx}
                                            className={`px-2 py-1 rounded text-xs ${
                                                wing.isFavorite
                                                    ? "bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-200 font-semibold"
                                                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                                            }`}
                                        >
                                            {wing.isFavorite && "⭐ "}{wing.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {activity.gearMatches.foils?.length > 0 && (
                            <div>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                                    {t("gear.foils")}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {activity.gearMatches.foils.map((foil, idx) => (
                                        <span
                                            key={idx}
                                            className={`px-2 py-1 rounded text-xs ${
                                                foil.isFavorite
                                                    ? "bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-200 font-semibold"
                                                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                                            }`}
                                        >
                                            {foil.isFavorite && "⭐ "}{foil.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {activity.gearMatches.boats?.length > 0 && (
                            <div>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                                    {t("gear.boats")}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {activity.gearMatches.boats.map((boat, idx) => (
                                        <span
                                            key={idx}
                                            className={`px-2 py-1 rounded text-xs ${
                                                boat.isFavorite
                                                    ? "bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-200 font-semibold"
                                                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                                            }`}
                                        >
                                            {boat.isFavorite && "⭐ "}{boat.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {activity.gearMatches.speedsails?.length > 0 && (
                            <div>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                                    {t("gear.speedsails")}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {activity.gearMatches.speedsails.map((speedsail, idx) => (
                                        <span
                                            key={idx}
                                            className={`px-2 py-1 rounded text-xs ${
                                                speedsail.isFavorite
                                                    ? "bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-200 font-semibold"
                                                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                                            }`}
                                        >
                                            {speedsail.isFavorite && "⭐ "}{speedsail.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activity.evaluation?.reasons && activity.evaluation.reasons.length > 0 && (
                <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    <p className="font-semibold mb-1">{t("activities.reasons")}:</p>
                    <ul className="list-disc list-inside space-y-1">
                        {activity.evaluation.reasons.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
