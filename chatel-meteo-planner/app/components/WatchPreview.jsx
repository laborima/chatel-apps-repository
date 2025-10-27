"use client";

import { t } from "../lib/i18n";

/**
 * WatchPreview Component
 * Simulates a smartwatch display with essential data
 */
export default function WatchPreview({ wind, tide, nextActivity, className = "" }) {
    return (
        <div className={`bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6 ${className}`}>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-6">
                ⌚ {t("watch.title")}
            </h3>

            <div className="flex justify-center">
                <div className="relative">
                    <div className="w-48 h-64 bg-zinc-900 rounded-[3rem] shadow-2xl overflow-hidden border-8 border-zinc-800">
                        <div className="absolute inset-0 bg-gradient-to-b from-zinc-800 to-black p-6 flex flex-col">
                            <div className="text-center mb-4">
                                <p className="text-white text-xs opacity-75">
                                    {new Date().toLocaleTimeString("fr-FR", { 
                                        hour: "2-digit", 
                                        minute: "2-digit" 
                                    })}
                                </p>
                            </div>

                            <div className="flex-1 space-y-4">
                                {wind && wind.speedKnots && (
                                    <div className="bg-blue-600/30 backdrop-blur-sm rounded-xl p-3 border border-blue-500/50">
                                        <p className="text-blue-200 text-xs mb-1">💨 {t("weather.wind")}</p>
                                        <p className="text-white text-2xl font-bold">
                                            {wind.speedKnots.toFixed(1)}
                                        </p>
                                        <p className="text-blue-200 text-xs">
                                            {t("weather.knots")} {wind.direction && `• ${wind.direction}`}
                                        </p>
                                    </div>
                                )}

                                {tide && tide.heightNow && (
                                    <div className="bg-teal-600/30 backdrop-blur-sm rounded-xl p-3 border border-teal-500/50">
                                        <p className="text-teal-200 text-xs mb-1">🌊 {t("tide.title")}</p>
                                        <p className="text-white text-2xl font-bold">
                                            {tide.heightNow.toFixed(2)}m
                                        </p>
                                        <p className="text-teal-200 text-xs">
                                            {tide.isRising ? "↑ " + t("tide.rising") : "↓ " + t("tide.falling")}
                                        </p>
                                    </div>
                                )}

                                {nextActivity && (
                                    <div className="bg-green-600/30 backdrop-blur-sm rounded-xl p-3 border border-green-500/50">
                                        <p className="text-green-200 text-xs mb-1">🏄 {t("watch.nextActivity")}</p>
                                        <p className="text-white text-sm font-semibold capitalize">
                                            {nextActivity.name}
                                        </p>
                                        {nextActivity.evaluation && (
                                            <p className="text-green-200 text-xs mt-1">
                                                Score: {nextActivity.evaluation.score}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {!nextActivity && (
                                    <div className="bg-zinc-700/30 backdrop-blur-sm rounded-xl p-3 border border-zinc-600/50">
                                        <p className="text-zinc-400 text-xs text-center">
                                            {t("activities.notAvailable")}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="absolute -right-1 top-20 w-1 h-12 bg-zinc-700 rounded-l" />
                    <div className="absolute -right-1 top-36 w-1 h-8 bg-zinc-700 rounded-l" />
                </div>
            </div>

            <p className="text-xs text-center text-zinc-500 dark:text-zinc-400 mt-6">
                Vue simulée pour smartwatch
            </p>
        </div>
    );
}
