"use client";

import { t } from "../lib/i18n";

/**
 * WindGauge Component
 * Visual gauge displaying wind speed with Beaufort scale
 */
export default function WindGauge({ windKnots, beaufort, className = "" }) {
    if (!windKnots) {
        return null;
    }

    const maxKnots = 40;
    const percentage = Math.min((windKnots / maxKnots) * 100, 100);
    
    const getColorClass = (knots) => {
        if (knots < 5) return "text-zinc-400";
        if (knots < 12) return "text-green-500";
        if (knots < 20) return "text-yellow-500";
        if (knots < 28) return "text-orange-500";
        return "text-red-500";
    };

    const getBgColorClass = (knots) => {
        if (knots < 5) return "bg-zinc-400";
        if (knots < 12) return "bg-green-500";
        if (knots < 20) return "bg-yellow-500";
        if (knots < 28) return "bg-orange-500";
        return "bg-red-500";
    };

    return (
        <div className={`${className}`}>
            <div className="text-center mb-4">
                <p className={`text-6xl font-bold ${getColorClass(windKnots)}`}>
                    {windKnots.toFixed(1)}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                    {t("weather.knots")}
                </p>
                {beaufort !== null && beaufort !== undefined && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                        {t("weather.beaufort")} {beaufort}
                    </p>
                )}
            </div>

            <div className="relative h-4 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div 
                    className={`absolute left-0 top-0 h-full ${getBgColorClass(windKnots)} transition-all duration-500 rounded-full`}
                    style={{ width: `${percentage}%` }}
                />
            </div>

            <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                <span>0</span>
                <span>10</span>
                <span>20</span>
                <span>30</span>
                <span>40+</span>
            </div>
        </div>
    );
}
