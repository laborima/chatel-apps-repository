"use client";

import { t } from "../lib/i18n";

export default function ScoreBadge({ evaluation, className = "" }) {
    if (!evaluation || typeof evaluation.score !== 'number') return null;
    
    const { score, warnings } = evaluation;

    const getScoreColor = (s) => {
        if (s >= 90) return "text-green-600 dark:text-green-400";
        if (s >= 70) return "text-blue-600 dark:text-blue-400";
        if (s >= 50) return "text-yellow-600 dark:text-yellow-400";
        return "text-orange-600 dark:text-orange-400";
    };

    const getScoreBg = (s) => {
        if (s >= 90) return "bg-green-100 dark:bg-green-900/30";
        if (s >= 70) return "bg-blue-100 dark:bg-blue-900/30";
        if (s >= 50) return "bg-yellow-100 dark:bg-yellow-900/30";
        return "bg-orange-100 dark:bg-orange-900/30";
    };

    const getScoreExplanation = () => {
        const warningList = warnings || [];
        
        if (score >= 100 && warningList.length === 0) {
            return (
                <div className="text-green-400 flex items-center gap-1">
                    <span>✨</span> Conditions optimales
                </div>
            );
        }

        return (
            <div className="space-y-1">
                {warningList.map((w, i) => {
                    let text = w;
                    // Basic French translations for common warnings
                    if (text.includes("Wind direction not ideal")) {
                        text = text.replace("Wind direction not ideal", "Direction du vent non idéale");
                    }
                    if (text.includes("Tide phase not optimal")) {
                        text = "Marée descendante (préf. montante)";
                    }
                    return (
                        <div key={i} className="flex items-start gap-1 text-orange-200">
                            <span>•</span>
                            <span>{text}</span>
                        </div>
                    );
                })}
                {score < 100 && warningList.length === 0 && (
                     <div className="text-white/80">Score calculé selon conditions</div>
                )}
            </div>
        );
    };

    return (
        <div className={`relative group/tooltip px-4 py-2 rounded-lg ${getScoreBg(score)} cursor-help ${className}`}>
            <p className={`text-2xl font-bold ${getScoreColor(score)}`}>
                {score}
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{t("activities.score")}</p>
            
            <div className="absolute bottom-full right-0 mb-2 w-56 p-3 bg-zinc-900/95 backdrop-blur border border-white/10 text-xs rounded-lg shadow-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 text-left">
                <div className="font-semibold mb-2 border-b border-white/10 pb-1 text-white">
                    Détails du score
                </div>
                {getScoreExplanation()}
                {/* Arrow */}
                <div className="absolute top-full right-6 -mt-1 border-4 border-transparent border-t-zinc-900/95"></div>
            </div>
        </div>
    );
}
