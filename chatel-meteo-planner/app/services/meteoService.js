/**
 * Real-time Weather Service for Châtelaillon-Plage
 * 
 * Primary source: SignalK (chatel-signalk-weatherprovider plugin)
 * Fallback: Open-Meteo API (Météo France data)
 * 
 * Configuration via environment variables:
 * - NEXT_PUBLIC_SIGNALK_URL: Base URL of SignalK server
 */

import { calculateBeaufort, degreeToDirection } from "./utils";
import { getLocation } from "./configService";
import { getCurrentWeather, checkServerAvailability } from "./signalkService";

const OPEN_METEO_API_URL = "https://api.open-meteo.com/v1/meteofrance";

// SignalK availability cache
let signalkWeatherAvailable = null;

/**
 * Fetch current weather data
 * Primary source: SignalK (chatel-signalk-weatherprovider plugin)
 * Fallback: Open-Meteo API (Météo France data)
 */
export default async function scrapeMeteoLaRochelle(url = null, opts = {}) {
    // Try SignalK first (client-side only)
    if (typeof window !== "undefined") {
        try {
            if (signalkWeatherAvailable === null) {
                signalkWeatherAvailable = await checkServerAvailability();
            }

            if (signalkWeatherAvailable) {
                const signalkData = await getCurrentWeather();
                
                if (signalkData && signalkData.wind !== null) {
                    console.log("[MeteoService] Using SignalK weather data");
                    
                    const location = await getLocation();
                    
                    const parsed = {
                        wind: signalkData.wind,
                        direction: signalkData.directionDegrees ? degreeToDirection(signalkData.directionDegrees) : null,
                        directionDegrees: signalkData.directionDegrees,
                        beaufort: signalkData.wind ? calculateBeaufort(signalkData.wind) : null,
                        gust: signalkData.gust,
                        temperature: signalkData.temperature,
                        apparentTemperature: null,
                        humidity: signalkData.humidity,
                        precipitation: null,
                        rain: null,
                        avg1min: signalkData.wind,
                        avg10min: signalkData.wind
                    };

                    console.log("[MeteoService] Wind:", signalkData.wind?.toFixed(1), "km/h", parsed.direction, "Beaufort:", parsed.beaufort);

                    return {
                        sourceUrl: "signalk",
                        source: "SignalK (Météo La Rochelle)",
                        fetchedAt: new Date().toISOString(),
                        location: {
                            latitude: location.latitude,
                            longitude: location.longitude,
                            name: location.name
                        },
                        parsed,
                        rawData: signalkData
                    };
                }
            }
        } catch (error) {
            console.warn("[MeteoService] SignalK weather not available, falling back to Open-Meteo:", error.message);
            signalkWeatherAvailable = false;
        }
    }

    // Fallback to Open-Meteo API
    return await fetchFromOpenMeteo();
}

/**
 * Fetch current weather from Open-Meteo API (Météo France data)
 */
async function fetchFromOpenMeteo() {
    try {
        console.log("[MeteoService] Fetching real-time data from Open-Meteo API (Météo France)...");

        const location = await getLocation();

        const params = new URLSearchParams({
            latitude: location.latitude.toString(),
            longitude: location.longitude.toString(),
            current: [
                "temperature_2m",
                "relative_humidity_2m",
                "apparent_temperature",
                "precipitation",
                "rain",
                "wind_speed_10m",
                "wind_direction_10m",
                "wind_gusts_10m"
            ].join(","),
            wind_speed_unit: "kmh",
            timezone: "Europe/Paris"
        });

        const apiUrl = `${OPEN_METEO_API_URL}?${params.toString()}`;
        
        const response = await fetch(apiUrl, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "User-Agent": "chatel-meteo-planner/1.0"
            }
        });

        if (!response.ok) {
            throw new Error(`Open-Meteo API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log("[MeteoService] Data received from Open-Meteo");

        if (!data.current) {
            throw new Error("Invalid response from Open-Meteo API");
        }

        const current = data.current;
        
        const windSpeedKmh = current.wind_speed_10m;
        const windDirection = current.wind_direction_10m;
        const windGustKmh = current.wind_gusts_10m;

        const parsed = {
            wind: windSpeedKmh,
            direction: windDirection ? degreeToDirection(windDirection) : null,
            directionDegrees: windDirection,
            beaufort: windSpeedKmh ? calculateBeaufort(windSpeedKmh) : null,
            gust: windGustKmh,
            temperature: current.temperature_2m,
            apparentTemperature: current.apparent_temperature,
            humidity: current.relative_humidity_2m,
            precipitation: current.precipitation,
            rain: current.rain,
            avg1min: windSpeedKmh,
            avg10min: windSpeedKmh
        };

        console.log("[MeteoService] Wind:", windSpeedKmh?.toFixed(1), "km/h", parsed.direction, "Beaufort:", parsed.beaufort);

        return {
            sourceUrl: OPEN_METEO_API_URL,
            source: "Open-Meteo (Météo France)",
            fetchedAt: current.time || new Date().toISOString(),
            location: {
                latitude: location.latitude,
                longitude: location.longitude,
                name: location.name
            },
            parsed,
            rawData: data
        };
    } catch (error) {
        console.error("[MeteoService] Error fetching from Open-Meteo:", error.message);
        throw error;
    }
}

export { scrapeMeteoLaRochelle };
