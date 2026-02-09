"use client";

import { useState, useEffect, useRef } from "react";
import { t } from "../lib/i18n";

/**
 * WebcamWidget Component
 * Displays live webcam from Châtelaillon port
 */
export default function WebcamWidget({ className = "" }) {
    const [isVisible, setIsVisible] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setIsVisible(true);
                        observer.disconnect();
                    }
                });
            },
            { rootMargin: "100px" }
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => observer.disconnect();
    }, []);

    return (
        <div ref={containerRef} className={`bg-white dark:bg-zinc-900 rounded-lg shadow-md overflow-hidden ${className}`}>
            <div className="p-4 bg-zinc-100 dark:bg-zinc-800">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {t("weather.webcam")}
                </h3>
            </div>
            
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                {isVisible ? (
                    <iframe 
                        src="https://pv.viewsurf.com/2080/Chatelaillon-Port" 
                        frameBorder="0" 
                        scrolling="no" 
                        allowFullScreen
                        loading="lazy"
                        className="absolute top-0 left-0 w-full h-full"
                        title="Webcam Châtelaillon Port"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800">
                        <p className="text-zinc-500 dark:text-zinc-400">Chargement de la webcam...</p>
                    </div>
                )}
            </div>
        </div>
    );
}
