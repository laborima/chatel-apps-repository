"use client";

import { t } from "../lib/i18n";

/**
 * DirectionCompass Component
 * Visual compass showing wind direction with Châtelaillon-Plage beach map background
 */
export default function DirectionCompass({ direction, className = "" }) {
    if (!direction) {
        return null;
    }

    const directionMap = {
        N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
        E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
        S: 180, SSO: 202.5, SO: 225, OSO: 247.5,
        O: 270, ONO: 292.5, NO: 315, NNO: 337.5
    };

    const degrees = typeof direction === "number" ? direction : directionMap[direction.toUpperCase()] || 0;

    // Châtelaillon-Plage coordinates centered on the port
    const mapUrl = `https://www.google.com/maps/embed/v1/view?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&center=46.06226032691301,-1.0947554170040406&zoom=15&maptype=satellite`;

    return (
        <div className={className}>
            {/* Title header like webcam */}
            <div className="p-4 bg-zinc-100 dark:bg-zinc-800">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    Direction du vent
                </h3>
            </div>
            
            {/* Map background with compass overlay */}
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                {/* Google Maps iframe */}
                <iframe
                    src={mapUrl}
                    className="absolute inset-0 w-full h-full"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="Châtelaillon-Plage Map"
                />
                
                {/* Overlay gradient for better visibility */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/20 pointer-events-none" />
                
                {/* Compass overlay in center */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    <div className="relative w-40 h-40 bg-white/30 dark:bg-zinc-900/30 rounded-full shadow-2xl backdrop-blur-md border-2 border-white/50">
                        <div className="absolute inset-0 flex items-center justify-center">
                            {/* Wind direction arrow - properly centered */}
                            <div 
                                className="absolute w-0 h-0 transition-transform duration-500"
                                style={{ 
                                    transform: `rotate(${degrees}deg)`,
                                    transformOrigin: "center center"
                                }}
                            >
                                {/* Arrow pointing upward when at 0deg */}
                                <div className="absolute left-1/2 -translate-x-1/2">
                                    {/* Arrow shaft */}
                                    <div className="w-2 h-16 bg-gradient-to-t from-red-600 to-red-400 rounded-full -translate-y-16 shadow-lg" />
                                    {/* Arrow head */}
                                    <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[12px] border-b-red-500 drop-shadow-lg" 
                                         style={{ transform: "translateY(-12px)" }} />
                                </div>
                            </div>
                            
                            {/* Center dot */}
                            <div className="w-4 h-4 bg-blue-500 rounded-full shadow-lg z-10" />
                        </div>
                        
                        {/* Cardinal directions */}
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-sm font-bold text-white drop-shadow-lg">
                            N
                        </div>
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-sm font-bold text-white/70 drop-shadow-lg">
                            S
                        </div>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-sm font-bold text-white/70 drop-shadow-lg">
                            E
                        </div>
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 text-sm font-bold text-white drop-shadow-lg">
                            O
                        </div>
                    </div>
                </div>
                
                {/* Direction info overlay */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm px-6 py-3 rounded-full shadow-xl border-2 border-blue-500">
                    <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 text-center">
                        {typeof direction === "string" ? direction.toUpperCase() : `${degrees}°`}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 text-center mt-1">
                        {t("weather.direction")}
                    </p>
                </div>
            </div>
        </div>
    );
}
