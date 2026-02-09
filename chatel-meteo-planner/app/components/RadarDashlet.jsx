"use client";

import { useState, useEffect, useRef } from "react";
import { t } from "../lib/i18n";

const DEFAULT_ZOOM = 10;
const WINDY_BASE_URL = "https://embed.windy.com/embed.html";

const buildWindyUrl = (position) => {
    const params = new URLSearchParams({
        type: "map",
        location: "coordinates",
        metricRain: "default",
        metricTemp: "default",
        metricWind: "default",
        zoom: DEFAULT_ZOOM.toString(),
        overlay: "radar",
        product: "radar",
        level: "surface",
        lat: position.latitude.toString(),
        lon: position.longitude.toString(),
        message: "true"
    });

    return `${WINDY_BASE_URL}?${params.toString()}`;
};

/**
 * RadarDashlet Component
 * Displays Windy radar map centered on the vessel position
 */
export default function RadarDashlet({ position, className = "" }) {
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

    if (!position) {
        return null;
    }

    const iframeUrl = buildWindyUrl(position);

    return (
        <div ref={containerRef} className={`bg-white dark:bg-zinc-900 rounded-lg shadow-md overflow-hidden ${className}`}>
            <div className="p-4 bg-zinc-100 dark:bg-zinc-800">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {t("weather.radar", "Radar météo")}
                </h3>
            </div>

            <div className="relative w-full" style={{ paddingBottom: "69.23%" }}>
                {isVisible ? (
                    <iframe
                        src={iframeUrl}
                        className="absolute inset-0 w-full h-full"
                        frameBorder="0"
                        allowFullScreen
                        loading="lazy"
                        title="Radar Windy"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800">
                        <p className="text-zinc-500 dark:text-zinc-400">Chargement du radar...</p>
                    </div>
                )}
            </div>
        </div>
    );
}
