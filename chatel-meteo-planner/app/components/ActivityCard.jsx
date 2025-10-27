"use client";

import { t } from "../lib/i18n";

/**
 * ActivityCard Component
 * Displays an activity with its conditions, gear, and suitability score
 */
export default function ActivityCard({ activity, className = "" }) {
    const getScoreColor = (score) => {
        if (score >= 90) return "text-green-600 dark:text-green-400";
        if (score >= 70) return "text-blue-600 dark:text-blue-400";
        if (score >= 50) return "text-yellow-600 dark:text-yellow-400";
        return "text-orange-600 dark:text-orange-400";
    };

    const getScoreBg = (score) => {
        if (score >= 90) return "bg-green-100 dark:bg-green-900/30";
        if (score >= 70) return "bg-blue-100 dark:bg-blue-900/30";
        if (score >= 50) return "bg-yellow-100 dark:bg-yellow-900/30";
        return "bg-orange-100 dark:bg-orange-900/30";
    };

    const getActivityIcon = (type) => {
        switch (type) {
            case "bateau": return "⛵";
            case "windsurf": return "🏄";
            case "wing": return "🪁";
            case "speedsail": return "🚀";
            default: return "🌊";
        }
    };

    return (
        <div className={`bg-white dark:bg-zinc-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow ${className}`}>
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="text-4xl">{getActivityIcon(activity.type)}</span>
                    <div>
                        <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 capitalize">
                            {t(`activities.${activity.name}`)}
                        </h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">{activity.type}</p>
                    </div>
                </div>
                
                {activity.evaluation && (
                    <div className={`px-4 py-2 rounded-lg ${getScoreBg(activity.evaluation.score)}`}>
                        <p className={`text-2xl font-bold ${getScoreColor(activity.evaluation.score)}`}>
                            {activity.evaluation.score}
                        </p>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">{t("activities.score")}</p>
                    </div>
                )}
            </div>

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
