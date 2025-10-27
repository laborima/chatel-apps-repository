/**
 * Planner Service
 * Coordinates weather, tide, and activity services to provide recommendations
 */

import { scrapeMeteoLaRochelle } from "./meteoService";
import { fetchFiveDayForecast } from "./forecastWeatherService";
import { fetchTideData, calculateTideHeightUsingTwelfths } from "./tideService";
import {
    fetchActivitiesData,
    filterActivities,
    getRecommendedGear,
    matchGearWithFavorites,
    getSailorByName
} from "./activitiesService";

const CHATELAILLON_COORDS = {
    lat: 46.0747,
    lon: -1.0881
};

/**
 * Converts km/h to knots
 */
const kmhToKnots = (kmh) => {
    if (kmh === null || kmh === undefined) {
        return null;
    }
    return kmh * 0.539957;
};

/**
 * Converts wind degree to cardinal direction
 */
const degreeToDirection = (degree) => {
    if (degree === null || degree === undefined) {
        return null;
    }
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
    const index = Math.round(degree / 22.5) % 16;
    return directions[index];
};

/**
 * Fetches current real-time conditions
 */
export const fetchCurrentConditions = async () => {
    try {
        console.log("[PlannerService] Fetching current conditions...");
        
        const [meteoData, tideData] = await Promise.all([
            scrapeMeteoLaRochelle().catch((error) => {
                console.error("[PlannerService] Failed to scrape meteo data:", error.message);
                return null;
            }),
            fetchTideData().catch((error) => {
                console.error("[PlannerService] Failed to fetch tide data:", error.message);
                return null;
            })
        ]);

        let windKnots = null;
        let windKmh = null;
        let windDirection = null;
        let beaufort = null;
        let avg1min = null;
        let avg10min = null;

        if (meteoData?.parsed) {
            windKmh = meteoData.parsed.wind;
            windKnots = windKmh ? kmhToKnots(windKmh) : null;
            windDirection = meteoData.parsed.direction;
            beaufort = meteoData.parsed.beaufort;
            avg1min = meteoData.parsed.avg1min ? kmhToKnots(meteoData.parsed.avg1min) : null;
            avg10min = meteoData.parsed.avg10min ? kmhToKnots(meteoData.parsed.avg10min) : null;
        }

        return {
            timestamp: new Date().toISOString(),
            wind: {
                speedKnots: windKnots,
                speedKmh: windKmh,
                direction: windDirection,
                beaufort: beaufort,
                avg1minKnots: avg1min,
                avg10minKnots: avg10min
            },
            tide: tideData ? {
                heightNow: tideData.heightNow,
                heightHigh: tideData.heightHigh,
                heightLow: tideData.heightLow,
                timeHigh: tideData.timeHigh,
                timeLow: tideData.timeLow,
                isRising: tideData.isRising,
                coefficient: tideData.coeffNow
            } : null,
            meteoRaw: meteoData
        };
    } catch (error) {
        console.error("Error fetching current conditions:", error);
        throw error;
    }
};

/**
 * Fetches forecast conditions for planning
 * No API key needed - uses free Open-Meteo API
 */
export const fetchForecastConditions = async () => {
    try {
        const forecast = await fetchFiveDayForecast({
            lat: CHATELAILLON_COORDS.lat,
            lon: CHATELAILLON_COORDS.lon
        });

        return {
            location: forecast.location,
            forecasts: forecast.forecasts.map((day) => ({
                date: day.date,
                temperatureMin: day.temperatureMin,
                temperatureMax: day.temperatureMax,
                windSpeedMaxKnots: day.windSpeedMax ? kmhToKnots(day.windSpeedMax) : null,
                windSpeedMaxKmh: day.windSpeedMax,
                precipitationProbability: day.precipitationProbabilityMax,
                humidity: day.humidityAverage,
                sunrise: day.sunrise,
                sunset: day.sunset,
                periods: day.periods.map((period) => ({
                    ...period,
                    windSpeedKnots: period.windSpeed ? kmhToKnots(period.windSpeed) : null,
                    windDirectionCardinal: degreeToDirection(period.windDirection)
                }))
            }))
        };
    } catch (error) {
        console.error("Error fetching forecast:", error);
        throw error;
    }
};

/**
 * Gets activity recommendations for a sailor based on current conditions
 */
export const getRecommendations = async (sailorName, currentConditions) => {
    try {
        const activitiesData = await fetchActivitiesData();
        const sailor = getSailorByName(activitiesData.sailors, sailorName);

        if (!sailor) {
            throw new Error(`Sailor ${sailorName} not found`);
        }

        if (!currentConditions.wind.speedKnots || !currentConditions.tide) {
            return {
                sailor,
                currentConditions,
                activities: [],
                recommendedGear: null,
                message: "Insufficient weather or tide data"
            };
        }

        const conditions = {
            windKnots: currentConditions.wind.speedKnots,
            windDirection: currentConditions.wind.direction,
            tideHeight: currentConditions.tide.heightNow,
            swellHeight: null,
            isRaining: false
        };

        const validActivities = filterActivities(activitiesData.activities, conditions);
        const recommendedGear = getRecommendedGear(sailor, conditions.windKnots);

        const activitiesWithGear = validActivities.map((activity) => ({
            ...activity,
            gearMatches: matchGearWithFavorites(activity.suggestedGear, sailor.favoriteGear)
        }));

        return {
            sailor,
            currentConditions,
            activities: activitiesWithGear,
            recommendedGear
        };
    } catch (error) {
        console.error("Error getting recommendations:", error);
        throw error;
    }
};

/**
 * Gets full planning data for display
 * No API key needed anymore!
 */
export const getFullPlanningData = async (sailorName) => {
    try {
        console.log("[PlannerService] getFullPlanningData called", { sailorName });
        
        console.log("[PlannerService] Fetching current conditions...");
        const currentConditions = await fetchCurrentConditions();
        console.log("[PlannerService] Current conditions fetched", { 
            hasWind: !!currentConditions?.wind, 
            hasTide: !!currentConditions?.tide 
        });
        
        console.log("[PlannerService] Fetching forecast conditions...");
        const forecastConditions = await fetchForecastConditions().catch((error) => {
            console.error("[PlannerService] Forecast fetch failed:", error.message);
            return { location: null, forecasts: [] };
        });
        console.log("[PlannerService] Forecast conditions fetched");
        
        console.log("[PlannerService] Fetching activities data...");
        const activitiesData = await fetchActivitiesData();
        console.log("[PlannerService] Activities data fetched", {
            sailorsCount: activitiesData?.sailors?.length,
            activitiesCount: activitiesData?.activities?.length
        });

        const sailor = sailorName ? getSailorByName(activitiesData.sailors, sailorName) : null;

        let recommendations = null;
        if (sailor && currentConditions.wind.speedKnots && currentConditions.tide) {
            const conditions = {
                windKnots: currentConditions.wind.speedKnots,
                windDirection: currentConditions.wind.direction,
                tideHeight: currentConditions.tide.heightNow,
                swellHeight: null,
                isRaining: false
            };

            const validActivities = filterActivities(activitiesData.activities, conditions);
            const recommendedGear = getRecommendedGear(sailor, conditions.windKnots);

            recommendations = {
                activities: validActivities.map((activity) => ({
                    ...activity,
                    gearMatches: matchGearWithFavorites(activity.suggestedGear, sailor.favoriteGear)
                })),
                recommendedGear
            };
        }

        return {
            sailor,
            sailors: activitiesData.sailors,
            currentConditions,
            forecast: forecastConditions,
            recommendations,
            allActivities: activitiesData.activities
        };
    } catch (error) {
        console.error("Error getting full planning data:", error);
        throw error;
    }
};
