"use client";

import { useState, useEffect } from "react";
import { t } from "../lib/i18n";
import WeatherCard from "./WeatherCard";
import TideWidget from "./TideWidget";
import ActivityCard from "./ActivityCard";
import ProfileSelector from "./ProfileSelector";
import WindGauge from "./WindGauge";
import DirectionCompass from "./DirectionCompass";
import WebcamWidget from "./WebcamWidget";
import ForecastCard from "./ForecastCard";
import NotificationCenter from "./NotificationCenter";
import WatchPreview from "./WatchPreview";
import SunriseSunsetWidget from "./SunriseSunsetWidget";
import Image from "next/image";
import { getFullPlanningData, getRecommendations } from "../services/plannerService";

/**
 * Main Dashboard Component
 * Orchestrates data fetching and display of all weather, tide, and activity information
 */
export default function Dashboard() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentConditions, setCurrentConditions] = useState(null);
    const [forecast, setForecast] = useState(null);
    const [sailors, setSailors] = useState([]);
    const [selectedSailor, setSelectedSailor] = useState(null);
    const [recommendations, setRecommendations] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [nextRefresh, setNextRefresh] = useState(120); // 2 minutes in seconds
    const [showGear, setShowGear] = useState(false);

    useEffect(() => {
        fetchData();
        // Refresh every 2 minutes for real-time updates
        const interval = setInterval(() => {
            fetchData();
            setNextRefresh(120);
        }, 2 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        // Countdown timer for next refresh
        const timer = setInterval(() => {
            setNextRefresh((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (selectedSailor && currentConditions) {
            fetchRecommendations();
        }
    }, [selectedSailor, currentConditions]);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);

            console.log("[Dashboard] Fetching data from Open-Meteo (free API)...");

            const data = await getFullPlanningData();
            console.log("[Dashboard] Data received successfully");

            setCurrentConditions(data.currentConditions);
            setForecast(data.forecast);
            setSailors(data.sailors || []);
            setLastUpdate(new Date());

            if (data.sailors && data.sailors.length > 0 && !selectedSailor) {
                setSelectedSailor(data.sailors[0]);
            }

            setLoading(false);
        } catch (err) {
            console.error("Error fetching data:", err);
            setError(err.message);
            setLoading(false);
        }
    };

    const fetchRecommendations = async () => {
        if (!selectedSailor || !currentConditions) {
            return;
        }

        try {
            const data = await getRecommendations(selectedSailor.name, currentConditions);
            setRecommendations(data);
        } catch (err) {
            console.error("Error fetching recommendations:", err);
        }
    };

    if (loading && !currentConditions) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-zinc-900 dark:to-zinc-800 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4" />
                    <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                        {t("status.loading")}
                    </p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-zinc-900 dark:to-zinc-800 flex items-center justify-center">
                <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl p-8 max-w-md">
                    <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
                        {t("status.error")}
                    </h2>
                    <p className="text-zinc-700 dark:text-zinc-300 mb-4">{error}</p>
                    <button
                        onClick={fetchData}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
                    >
                        {t("errors.retry")}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-zinc-900 dark:to-zinc-800">
            <header className="bg-gradient-to-r from-blue-600 to-cyan-500 shadow-lg">
                <div className="container mx-auto px-4 py-6">
                    <div className="flex items-center justify-between gap-4 mb-6">
                        <div className="flex items-center gap-3">
                            <div className="relative h-12 w-12">
                                <Image src="/logo.svg" alt="Châtel Meteo Planner" fill priority sizes="48px" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-white leading-tight">
                                    {t("app.title")}
                                </h1>
                                <p className="text-blue-100 text-sm">
                                    {t("app.subtitle")}
                                </p>
                            </div>
                        </div>
                        <div className="hidden md:flex items-center gap-2 text-white/80 text-sm uppercase tracking-[0.2em]">
                            <span>Châtel Meteo Planner</span>
                        </div>
                    </div>

                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex-1">
                            <h2 className="text-lg font-semibold text-white uppercase tracking-widest">
                                {t("weather.overview")}
                            </h2>
                        </div>

                        <div className="min-w-[280px]">
                            <label className="block text-xs text-blue-100 mb-1 font-medium">
                                👤 Profil Marin
                            </label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <select
                                        value={selectedSailor?.name || ""}
                                        onChange={(e) => {
                                            const sailor = sailors.find(s => s.name === e.target.value);
                                            setSelectedSailor(sailor || null);
                                        }}
                                        className="w-full px-4 py-3 bg-white/95 backdrop-blur-sm text-zinc-900 rounded-lg font-semibold shadow-lg border-2 border-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer appearance-none"
                                    >
                                        <option value="">Sélectionner un profil</option>
                                        {sailors.map((sailor) => (
                                            <option key={sailor.name} value={sailor.name}>
                                                {sailor.name.charAt(0).toUpperCase() + sailor.name.slice(1)} • {sailor.heightCm}cm • {sailor.weightKg}kg
                                            </option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                        <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>
                                
                                {/* Toggle Gear Button */}
                                {selectedSailor && selectedSailor.favoriteGear && (
                                    <button
                                        onClick={() => setShowGear(!showGear)}
                                        className="px-3 py-3 bg-white/95 hover:bg-white backdrop-blur-sm text-zinc-900 rounded-lg font-semibold shadow-lg border-2 border-white/20 transition-all"
                                        title={showGear ? "Masquer le matériel" : "Afficher le matériel"}
                                    >
                                        {showGear ? "🎯" : "🎒"}
                                    </button>
                                )}
                            </div>
                            
                            {/* Gear Display - Collapsible */}
                            {selectedSailor && selectedSailor.favoriteGear && showGear && (
                                <div className="mt-2 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg animate-fade-in">
                                    <p className="text-xs font-medium text-zinc-600 mb-2">🎯 Matériel favori :</p>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedSailor.favoriteGear.sail && selectedSailor.favoriteGear.board && (
                                            <span className="px-3 py-1 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs rounded-full font-medium shadow-sm">
                                                🏄 {selectedSailor.favoriteGear.board} + {selectedSailor.favoriteGear.sail}
                                            </span>
                                        )}
                                        {selectedSailor.favoriteGear.wing && (
                                            <span className="px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs rounded-full font-medium shadow-sm">
                                                🪁 {selectedSailor.favoriteGear.wing}
                                            </span>
                                        )}
                                        {selectedSailor.favoriteGear.boat && (
                                            <span className="px-3 py-1 bg-gradient-to-r from-teal-500 to-blue-500 text-white text-xs rounded-full font-medium shadow-sm">
                                                ⛵ {selectedSailor.favoriteGear.boat}
                                            </span>
                                        )}
                                        {selectedSailor.favoriteGear.speedsail && (
                                            <span className="px-3 py-1 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs rounded-full font-medium shadow-sm">
                                                🚀 {selectedSailor.favoriteGear.speedsail}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-4 mt-4">
                                <button
                                    onClick={fetchData}
                                    disabled={loading}
                                    className="px-4 py-2 bg-white/20 hover:bg-white/30 disabled:bg-zinc-400/20 backdrop-blur-sm text-white rounded-lg font-semibold transition-colors flex items-center gap-2 border border-white/30"
                                >
                                    <span className={loading ? "animate-spin" : ""}>🔄</span>
                                    {t("actions.refresh")}
                                </button>
                                
                                {lastUpdate && (
                                    <div className="flex items-center gap-4">
                                        <p className="text-xs text-white/80">
                                            {t("status.lastUpdate")}: {lastUpdate.toLocaleTimeString("fr-FR")}
                                        </p>
                                        <p className="text-xs text-white font-medium bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full">
                                            ⏱️ Prochain : {Math.floor(nextRefresh / 60)}:{String(nextRefresh % 60).padStart(2, '0')}
                                        </p>
                                    </div>
                                )}
                            </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
                            <WeatherCard wind={currentConditions?.wind} />
                            <TideWidget 
                                tide={currentConditions?.tide}
                                activities={recommendations?.activities}
                                selectedSailor={selectedSailor}
                            />
                            <SunriseSunsetWidget forecast={forecast} />
                            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6">
                                <h3 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-50">
                                    {t("weather.wind")}
                                </h3>
                                <WindGauge
                                    windKnots={currentConditions?.wind?.speedKnots}
                                    beaufort={currentConditions?.wind?.beaufort}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md overflow-hidden">
                                <DirectionCompass direction={currentConditions?.wind?.direction} />
                            </div>
                            <WebcamWidget />
                        </div>

                        {recommendations?.activities && recommendations.activities.length > 0 && (
                            <div className="mb-8">
                                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">
                                    {t("activities.recommended")}
                                    {selectedSailor && (
                                        <span className="text-blue-600 dark:text-blue-400 ml-2 capitalize">
                                            pour {selectedSailor.name}
                                        </span>
                                    )}
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {recommendations.activities.map((activity, idx) => (
                                        <ActivityCard key={idx} activity={activity} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {recommendations?.activities && recommendations.activities.length === 0 && (
                            <div className="mb-8 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-8 text-center">
                                <p className="text-xl text-zinc-600 dark:text-zinc-400">
                                    {t("activities.notAvailable")}
                                </p>
                                <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-2">
                                    Les conditions actuelles ne permettent aucune activité nautique.
                                </p>
                            </div>
                        )}

                        {forecast?.forecasts && forecast.forecasts.length > 0 && (
                            <div className="mb-8">
                                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">
                                    {t("planner.title")}
                                </h2>
                                <div className="flex gap-4 overflow-x-auto pb-4">
                                    {forecast.forecasts.map((day, idx) => (
                                        <ForecastCard key={idx} forecast={day} />
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                            <NotificationCenter activities={recommendations?.activities || []} />
                            <WatchPreview
                                wind={currentConditions?.wind}
                                tide={currentConditions?.tide}
                                nextActivity={recommendations?.activities?.[0]}
                            />
                        </div>
                    </main>

                    <footer className="bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 mt-16">
                        <div className="container mx-auto px-4 py-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                                        {t("footer.dataSource")}
                                    </h3>
                                    <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-2">
                                        <li>• {t("footer.openWeather")}</li>
                                        <li>• {t("footer.meteoLaRochelle")}</li>
                                    </ul>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
                                        ⚠️ Disclaimer
                                    </h3>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                        {t("footer.disclaimer")}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800 text-center">
                                <p className="text-sm text-zinc-500 dark:text-zinc-500">
                                    Made with ❤️ for Châtelaillon-Plage sailors
                                </p>
                            </div>
                        </div>
                    </footer>
        </div>
    );
}
