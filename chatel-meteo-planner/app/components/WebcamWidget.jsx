"use client";

import { t } from "../lib/i18n";

/**
 * WebcamWidget Component
 * Displays live webcam from Châtelaillon port
 */
export default function WebcamWidget({ className = "" }) {
    return (
        <div className={`bg-white dark:bg-zinc-900 rounded-lg shadow-md overflow-hidden ${className}`}>
            <div className="p-4 bg-zinc-100 dark:bg-zinc-800">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {t("weather.webcam")}
                </h3>
            </div>
            
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                <iframe 
                    src="https://pv.viewsurf.com/2080/Chatelaillon-Port" 
                    frameBorder="0" 
                    scrolling="no" 
                    allowFullScreen
                    className="absolute top-0 left-0 w-full h-full"
                    title="Webcam Châtelaillon Port"
                />
            </div>
        </div>
    );
}
