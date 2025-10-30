"use client";

import { t } from "../lib/i18n";

/**
 * ProfileSelector Component
 * Allows selection of a sailor profile to personalize recommendations
 */
export default function ProfileSelector({ sailors, selectedSailor, onSelectSailor, className = "" }) {
    if (!sailors || sailors.length === 0) {
        return null;
    }

    return (
        <div className={`bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6 ${className}`}>
            <h3 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-50">
                {t("sailors.selectProfile")}
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {sailors.map((sailor) => {
                    const isSelected = selectedSailor?.id === sailor.id;
                    
                    return (
                        <button
                            key={sailor.id}
                            onClick={() => onSelectSailor(sailor)}
                            className={`p-4 rounded-lg border-2 transition-all ${
                                isSelected
                                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-md"
                                    : "border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-700"
                            }`}
                        >
                            <div className="text-center">
                                <div className="text-4xl mb-2">
                                    {sailor.id === "christophe" && "👨"}
                                    {sailor.id === "constance" && "👩"}
                                    {sailor.id === "matthieu" && "🧑"}
                                    {sailor.id === "theo" && "👨‍🦱"}
                                    {sailor.id === "anna" && "👩‍🦰"}
                                </div>
                                <p className="font-semibold text-zinc-900 dark:text-zinc-50 capitalize">
                                    {sailor.name}
                                </p>
                                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                                    {sailor.heightCm}cm • {sailor.weightKg}kg
                                </p>
                            </div>
                        </button>
                    );
                })}
            </div>

            {selectedSailor && (
                <div className="mt-6 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                    <h4 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-3 capitalize">
                        {selectedSailor.name}
                    </h4>
                    
                    <div className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                        <div>
                            <span className="font-medium">{t("sailors.height")}:</span> {selectedSailor.heightCm} cm
                        </div>
                        <div>
                            <span className="font-medium">{t("sailors.weight")}:</span> {selectedSailor.weightKg} kg
                        </div>
                        
                        {selectedSailor.favoriteGear && (
                            <div className="mt-3">
                                <p className="font-medium mb-2">{t("sailors.favoriteGear")}:</p>
                                <div className="space-y-1 text-xs">
                                    {selectedSailor.favoriteGear.board && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-blue-600 dark:text-blue-400">■</span>
                                            <span>{t("sailors.board")}: {selectedSailor.favoriteGear.board}</span>
                                        </div>
                                    )}
                                    {selectedSailor.favoriteGear.sail && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-green-600 dark:text-green-400">■</span>
                                            <span>{t("sailors.sail")}: {selectedSailor.favoriteGear.sail}</span>
                                        </div>
                                    )}
                                    {selectedSailor.favoriteGear.wing && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-purple-600 dark:text-purple-400">■</span>
                                            <span>{t("sailors.wing")}: {selectedSailor.favoriteGear.wing}</span>
                                        </div>
                                    )}
                                    {selectedSailor.favoriteGear.speedsail && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-orange-600 dark:text-orange-400">■</span>
                                            <span>{t("sailors.speedsail")}: {selectedSailor.favoriteGear.speedsail}</span>
                                        </div>
                                    )}
                                    {selectedSailor.favoriteGear.boat && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-cyan-600 dark:text-cyan-400">■</span>
                                            <span>{t("sailors.boat")}: {selectedSailor.favoriteGear.boat}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
