"use client";

import { useState, useEffect } from "react";
import { t } from "../lib/i18n";
import WeatherCard from "./WeatherCard";
import TideWidget from "./TideWidget";
import ActivityCard from "./ActivityCard";
import ProfileSelector from "./ProfileSelector";
import DirectionCompass from "./DirectionCompass";
import WebcamWidget from "./WebcamWidget";
import ForecastCard from "./ForecastCard";
import NotificationCenter from "./NotificationCenter";
import WatchPreview from "./WatchPreview";
import SunriseSunsetWidget from "./SunriseSunsetWidget";
import DayDetailsModal from "./DayDetailsModal";
import DayForecastDashlet from "./DayForecastDashlet";
import Image from "next/image";
import { getFullPlanningData } from "../services/plannerService";

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
    const [planning5Day, setPlanning5Day] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [nextRefresh, setNextRefresh] = useState(120); // 2 minutes in seconds
    const [showGear, setShowGear] = useState(false);
    const [selectedDay, setSelectedDay] = useState(null);
    const [showDayDetails, setShowDayDetails] = useState(false);

    // Load saved sailor from localStorage
    useEffect(() => {
        const savedSailorId = localStorage.getItem('selectedSailorId');
        if (savedSailorId && sailors.length > 0) {
            const savedSailor = sailors.find(s => s.id === savedSailorId);
            if (savedSailor) {
                setSelectedSailor(savedSailor);
            }
        }
    }, [sailors]);

    // Save sailor to localStorage when changed
    const handleSailorChange = (sailor) => {
        setSelectedSailor(sailor);
        if (sailor) {
            localStorage.setItem('selectedSailorId', sailor.id);
        } else {
            localStorage.removeItem('selectedSailorId');
        }
    };

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
        if (selectedSailor) {
            fetchData();
        }
    }, [selectedSailor?.id]);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);

            console.log("[Dashboard] Fetching data from Open-Meteo (free API)...");

            const profileId = selectedSailor?.id || null;
            const data = await getFullPlanningData(profileId);
            console.log("[Dashboard] Data received successfully");

            setCurrentConditions(data.currentConditions);
            setForecast(data.forecast);
            setSailors(data.sailors || []);
            setPlanning5Day(data.planning5Day);
            setRecommendations(data.recommendations);
            console.log("[Dashboard] planning5Day:", data.planning5Day);
            if (data.planning5Day?.planning?.[0]) {
                console.log("[Dashboard] First day planning:", data.planning5Day.planning[0]);
            }
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
            <header className="bg-white shadow-lg border-b border-gray-100">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-shrink-0">
                            <div className="relative h-24 w-24 sm:h-32 sm:w-32">
                                <Image src="/chatel-apps-repository/logo.png" alt="Châtel Météo Planner" fill priority sizes="128px" />
                            </div>
                            <div className="hidden sm:block">
                                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">
                                    {t("app.title")}
                                </h1>
                                <p className="text-gray-600 text-xs sm:text-sm hidden md:block">
                                    {t("app.subtitle")}
                                </p>
                            </div>
                        </div>

                        <div className="flex-1 max-w-xs sm:max-w-sm md:max-w-md">
                            <div className="flex items-center gap-2">
                                <div className="flex-1 min-w-0">
                                    
                                    <div className="flex gap-1 sm:gap-2">
                                        <div className="relative flex-1">
                                            <select
                                                value={selectedSailor?.name || ""}
                                                onChange={(e) => {
                                                    const sailor = sailors.find(s => s.name === e.target.value);
                                                    handleSailorChange(sailor || null);
                                                }}
                                                className="w-full px-2 sm:px-3 py-2 sm:py-2.5 bg-white/95 backdrop-blur-sm text-black rounded-lg font-medium text-xs sm:text-sm shadow-lg border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer appearance-none"
                                            >
                                                <option value="">{t("sailors.selectProfile")}</option>
                                                {sailors.map((sailor) => (
                                                    <option key={sailor.id} value={sailor.name}>
                                                        {sailor.name}
                                                    </option>
                                                ))}
                                            </select>
                                      
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                                                <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        </div>
                                        
                                        {/* Toggle Gear Button */}
                                        {selectedSailor && selectedSailor.favoriteGear && (
                                            <button
                                                onClick={() => setShowGear(!showGear)}
                                                className="px-2 py-2 sm:px-3 sm:py-2.5 bg-white/95 hover:bg-white backdrop-blur-sm text-zinc-900 rounded-lg font-medium shadow-lg border border-white/20 transition-all flex-shrink-0"
                                                title={showGear ? "Matériel" : "Matériel"}
                                            >
                                                {showGear ? "🎯" : "🎒"}
                                            </button>
                                        )}
                                    </div>
                                    
                                    {/* Gear Display - Collapsible */}
                                    {selectedSailor && selectedSailor.favoriteGear && showGear && (
                                        <div className="mt-2 bg-white/90 backdrop-blur-sm rounded-lg p-2 shadow-lg animate-fade-in">
                                            <div className="flex flex-wrap gap-1">
                                                {selectedSailor.favoriteGear.sail && selectedSailor.favoriteGear.board && (
                                                    <span className="px-2 py-1 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs rounded-full font-medium">
                                                        🏄 {selectedSailor.favoriteGear.board}
                                                    </span>
                                                )}
                                                {selectedSailor.favoriteGear.wing && (
                                                    <span className="px-2 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs rounded-full font-medium">
                                                        🪁 {selectedSailor.favoriteGear.wing}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                        {(recommendations?.activities?.length > 0 || planning5Day?.planning?.[0]?.mergedActivities?.length > 0) && (
                            <div className="mb-8">
                                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">
                                    {t("activities.recommended")}
                                    {selectedSailor && (
                                        <span className="text-blue-600 dark:text-blue-400 ml-2 capitalize">
                                            pour {selectedSailor.name}
                                        </span>
                                    )}
                                </h2>
                                
                                {/* Merged activities - Current 3 hours + Rest of day */}
                                {(() => {
                                    // Get current recommendations (next 3 hours) - these are valid NOW
                                    const currentActivities = recommendations?.activities || [];
                                    const currentActivityIds = new Set(currentActivities.map(a => a.id));
                                    
                                    // Get all day activities from planning
                                    const allDayActivities = planning5Day?.planning?.[0]?.mergedActivities || [];
                                    
                                    // Merge: activities valid NOW + activities available later in the day
                                    const mergedActivitiesMap = new Map();
                                    
                                    // 1. Add activities valid NOW with their full day range
                                    currentActivities.forEach(currentActivity => {
                                        // Find the full day activity from planning
                                        const fullDayActivity = allDayActivities.find(a => a.id === currentActivity.id);
                                        
                                        if (fullDayActivity) {
                                            // Use full day range, but keep current activity's evaluation
                                            mergedActivitiesMap.set(currentActivity.id, {
                                                ...fullDayActivity,
                                                evaluation: currentActivity.evaluation,
                                                gearMatches: currentActivity.gearMatches,
                                                period: 'current'
                                            });
                                        } else {
                                            // Activity only in current recommendations
                                            mergedActivitiesMap.set(currentActivity.id, {
                                                ...currentActivity,
                                                period: 'current'
                                            });
                                        }
                                    });
                                    
                                    // 2. Add activities available later in the day (not valid NOW but valid later)
                                    allDayActivities.forEach(dayActivity => {
                                        if (!currentActivityIds.has(dayActivity.id)) {
                                            // This activity is not valid NOW, but is available later
                                            mergedActivitiesMap.set(dayActivity.id, {
                                                ...dayActivity,
                                                period: 'rest'
                                            });
                                        }
                                    });
                                    
                                    // Convert to array and sort by score
                                    const allActivities = Array.from(mergedActivitiesMap.values())
                                        .sort((a, b) => (b.evaluation?.score || 0) - (a.evaluation?.score || 0));
                                    
                                    return allActivities.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {allActivities.map((activity, idx) => (
                                                <div key={idx}>
                                                    {activity.period === 'current' ? (
                                                        <ActivityCard 
                                                            activity={activity} 
                                                            currentConditions={currentConditions}
                                                        />
                                                    ) : (
                                                        <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                                                            <div className="flex items-start justify-between mb-4">
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-4xl">
                                                                        {activity.type === 'sailboat' ? '⛵' : 
                                                                         activity.type === 'windsurf' ? '🏄' :
                                                                         activity.type === 'wingfoil' ? '🪁' :
                                                                         activity.type === 'speedsail' ? '🚀' :
                                                                         activity.type === 'sup' ? '🏄‍♂️' : '🌊'}
                                                                    </span>
                                                                    <div>
                                                                        <h4 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 capitalize">
                                                                            {activity.name}
                                                                        </h4>
                                                                        <p className="text-sm text-zinc-600 dark:text-zinc-400">{activity.type}</p>
                                                                    </div>
                                                                </div>
                                                                
                                                                {activity.evaluation?.score && (
                                                                    <div className={`px-4 py-2 rounded-lg ${
                                                                        activity.evaluation.score >= 90 ? 'bg-green-100 dark:bg-green-900/30' :
                                                                        activity.evaluation.score >= 70 ? 'bg-blue-100 dark:bg-blue-900/30' :
                                                                        activity.evaluation.score >= 50 ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                                                                        'bg-orange-100 dark:bg-orange-900/30'
                                                                    }`}>
                                                                        <p className={`text-2xl font-bold ${
                                                                            activity.evaluation.score >= 90 ? 'text-green-600 dark:text-green-400' :
                                                                            activity.evaluation.score >= 70 ? 'text-blue-600 dark:text-blue-400' :
                                                                            activity.evaluation.score >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
                                                                            'text-orange-600 dark:text-orange-400'
                                                                        }`}>
                                                                            {activity.evaluation.score}
                                                                        </p>
                                                                        <p className="text-xs text-zinc-600 dark:text-zinc-400">Score</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            
                                                            {activity.timeRanges && activity.timeRanges.length > 0 && (
                                                                <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg border-l-4 border-blue-500">
                                                                    {activity.timeRanges.map((range, rIdx) => (
                                                                        <div key={rIdx} className="mb-3 last:mb-0">
                                                                            <div className="flex items-center gap-2 mb-2">
                                                                                <span className="text-lg">🕒</span>
                                                                                <p className="text-base font-bold text-blue-900 dark:text-blue-100">
                                                                                    {range.display} ({range.tideStart}m→{range.tideEnd}m)
                                                                                </p>
                                                                            </div>
                                                                            <div className="flex items-center gap-2 text-sm ml-6">
                                                                                <span className="text-zinc-600 dark:text-zinc-400">
                                                                                    💨 {range.avgWind} kts
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : null;
                                })()}
                            </div>
                        )}

                        {(
                            (!recommendations?.activities || recommendations.activities.length === 0) &&
                            (!planning5Day?.planning?.[0]?.mergedActivities || planning5Day.planning[0].mergedActivities.length === 0)
                        ) && (
                            <div className="mb-8 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-8 text-center">
                                <p className="text-xl text-zinc-600 dark:text-zinc-400">
                                    {t("activities.notAvailable")}
                                </p>
                                <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-2">
                                    Les conditions actuelles ne permettent aucune activité nautique.
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
                            <WeatherCard
                                wind={currentConditions?.wind}
                                onRefresh={fetchData}
                                loading={loading}
                                lastUpdate={lastUpdate}
                                nextRefresh={nextRefresh}
                            />
                            <TideWidget 
                                tide={currentConditions?.tide}
                                activities={recommendations?.activities}
                                selectedSailor={selectedSailor}
                                dayPlanning={planning5Day?.planning?.[0]}
                            />
                            <SunriseSunsetWidget
                                forecast={forecast}
                                timeZone={forecast?.location?.timezone}
                            />
                            <DayForecastDashlet
                                forecast={forecast?.forecasts?.[0]}
                            />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md overflow-hidden">
                                <DirectionCompass direction={currentConditions?.wind?.direction} />
                            </div>
                            <WebcamWidget />
                        </div>

                        {forecast?.forecasts && forecast.forecasts.length > 0 && (
                            <div className="mb-8">
                                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">
                                    {t("planner.title")}
                                    {selectedSailor && (
                                        <span className="text-blue-600 dark:text-blue-400 ml-2 capitalize text-lg">
                                            pour {selectedSailor.name}
                                        </span>
                                    )}
                                </h2>
                                <div className="flex gap-4 overflow-x-auto pb-4">
                                    {forecast.forecasts.slice(1, 6).map((day, idx) => {
                                        const dayPlanning = planning5Day?.planning?.find(p => p.date === day.date);
                                        const mergedActivities = dayPlanning?.mergedActivities || [];
                                        const bestActivities = dayPlanning?.slots
                                            ?.flatMap(slot => slot.activities || [])
                                            .sort((a, b) => (b.evaluation?.score || 0) - (a.evaluation?.score || 0))
                                            .filter((activity, index, self) => 
                                                index === self.findIndex(a => a.id === activity.id)
                                            ) || [];
                                        
                                        return (
                                            <ForecastCard 
                                                key={idx} 
                                                forecast={day} 
                                                activities={bestActivities}
                                                mergedActivities={mergedActivities}
                                                daySlots={dayPlanning?.slots || []}
                                                onCardClick={() => {
                                                    console.log("[Dashboard] Clicked on day:", day.date);
                                                    console.log("[Dashboard] dayPlanning:", dayPlanning);
                                                    console.log("[Dashboard] dayPlanning?.slots:", dayPlanning?.slots);
                                                    setSelectedDay({ forecast: day, daySlots: dayPlanning?.slots || [], activities: bestActivities });
                                                    setShowDayDetails(true);
                                                }}
                                            />
                                        );
                                    })}
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

                    {/* Day Details Modal */}
                    <DayDetailsModal
                        isOpen={showDayDetails}
                        onClose={() => setShowDayDetails(false)}
                        forecast={selectedDay?.forecast}
                        daySlots={selectedDay?.daySlots || []}
                        activities={selectedDay?.activities || []}
                    />
        </div>
    );
}
