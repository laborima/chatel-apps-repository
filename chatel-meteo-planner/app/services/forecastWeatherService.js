/**
 * Forecast Weather Service
 * Uses Open-Meteo Météo France API for weather forecasts
 * Documentation: https://open-meteo.com/en/docs/meteofrance-api
 */

import { calculateSunTimes, degreeToDirection } from "./utils";
import { getLocation } from "./configService";

const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/meteofrance";

const toFloat = (value) => {
    const numeric = typeof value === "number" ? value : parseFloat(value);
    return Number.isFinite(numeric) ? numeric : null;
};

const appendTimeZoneOffset = (dateTime, timeZone) => {
    if (!dateTime) {
        return null;
    }

    const hasOffset = /[+-]\d{2}:\d{2}$/.test(dateTime) || dateTime.endsWith("Z");
    if (hasOffset) {
        return dateTime;
    }

    const normalized = dateTime.length === 16 ? `${dateTime}:00` : dateTime;

    if (!timeZone) {
        return `${normalized}+00:00`;
    }

    try {
        const baseDate = new Date(`${normalized}Z`);
        const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone,
            timeZoneName: "shortOffset",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        });

        const tzValue = formatter.formatToParts(baseDate).find((part) => part.type === "timeZoneName")?.value;
        const match = tzValue?.match(/GMT([+-]?)(\d{1,2})(?::?(\d{2}))?/);

        if (!match) {
            return `${normalized}+00:00`;
        }

        const sign = match[1] === "-" ? "-" : "+";
        const hours = match[2].padStart(2, "0");
        const minutes = (match[3] ?? "00").padStart(2, "0");

        return `${normalized}${sign}${hours}:${minutes}`;
    } catch (error) {
        console.error("[ForecastService] Failed to append timezone offset", error);
        return `${normalized}+00:00`;
    }
};

/**
 * Group hourly forecasts by day
 */
const groupForecastsByDay = (hourlyData) => {
    const buckets = new Map();

    // Debug: Log available keys in hourlyData
    console.log("[ForecastService] groupForecastsByDay - hourlyData keys:", Object.keys(hourlyData));
    if (hourlyData.precipitation_probability) {
        console.log("[ForecastService] precipitation_probability first 5 values:", hourlyData.precipitation_probability.slice(0, 5));
    } else {
        console.warn("[ForecastService] precipitation_probability is MISSING in hourlyData");
    }

    for (let i = 0; i < hourlyData.time.length; i++) {
        const dateTime = hourlyData.time[i];
        const dateKey = dateTime.slice(0, 10);

        // Fallback: if probability is missing but precipitation is 0, assume 0% probability
        let precipProb = toFloat(hourlyData.precipitation_probability?.[i]);
        const precipAmount = toFloat(hourlyData.precipitation?.[i]);
        
        if (precipProb === null && precipAmount === 0) {
            precipProb = 0;
        }

        const period = {
            timestamp: new Date(dateTime).getTime(),
            dateTime: dateTime,
            temperature: toFloat(hourlyData.temperature_2m[i]),
            feelsLike: toFloat(hourlyData.apparent_temperature[i]),
            humidity: hourlyData.relative_humidity_2m?.[i] ?? null,
            pressure: toFloat(hourlyData.surface_pressure?.[i]),
            windSpeed: toFloat(hourlyData.wind_speed_10m[i]),
            windGust: toFloat(hourlyData.wind_gusts_10m?.[i]),
            windDirection: hourlyData.wind_direction_10m?.[i] ?? null,
            windDirectionCardinal: degreeToDirection(hourlyData.wind_direction_10m?.[i]),
            precipitation: precipAmount,
            precipitationProbability: precipProb,
            weatherCode: hourlyData.weather_code?.[i] ?? null
        };

        const bucket = buckets.get(dateKey);
        if (!bucket) {
            buckets.set(dateKey, {
                date: dateKey,
                periods: [period],
                temperatureMin: period.temperature,
                temperatureMax: period.temperature,
                windSpeedMax: period.windSpeed,
                precipitationProbabilityMax: period.precipitationProbability,
                precipitationTotal: period.precipitation || 0,
                humidityTotal: period.humidity || 0,
                humidityCount: period.humidity !== null ? 1 : 0
            });
        } else {
            bucket.periods.push(period);
            
            if (typeof period.temperature === "number") {
                if (typeof bucket.temperatureMin !== "number" || period.temperature < bucket.temperatureMin) {
                    bucket.temperatureMin = period.temperature;
                }
                if (typeof bucket.temperatureMax !== "number" || period.temperature > bucket.temperatureMax) {
                    bucket.temperatureMax = period.temperature;
                }
            }
            
            if (typeof period.windSpeed === "number") {
                if (typeof bucket.windSpeedMax !== "number" || period.windSpeed > bucket.windSpeedMax) {
                    bucket.windSpeedMax = period.windSpeed;
                }
            }
            
            if (typeof period.precipitationProbability === "number") {
                if (typeof bucket.precipitationProbabilityMax !== "number" || period.precipitationProbability > bucket.precipitationProbabilityMax) {
                    bucket.precipitationProbabilityMax = period.precipitationProbability;
                }
            }
            
            if (period.precipitation) {
                bucket.precipitationTotal += period.precipitation;
            }
            
            if (period.humidity !== null) {
                bucket.humidityTotal += period.humidity;
                bucket.humidityCount += 1;
            }
        }
    }
    

    return Array.from(buckets.values()).map((bucket) => ({
        date: bucket.date,
        temperatureMin: bucket.temperatureMin ?? null,
        temperatureMax: bucket.temperatureMax ?? null,
        windSpeedMax: bucket.windSpeedMax ?? null,
        windSpeedMaxMs: bucket.windSpeedMax ?? null,
        precipitationProbability: bucket.precipitationProbabilityMax !== null 
            ? bucket.precipitationProbabilityMax / 100 
            : null,
        precipitationTotal: bucket.precipitationTotal,
        humidity: bucket.humidityCount > 0 ? bucket.humidityTotal / bucket.humidityCount : null,
        periods: bucket.periods.sort((left, right) => left.timestamp - right.timestamp)
    })).sort((left, right) => left.date.localeCompare(right.date));
};

/**
 * Fetch 7-day weather forecast from Open-Meteo Météo France API
 * No API key required!
 */
export const fetchFiveDayForecast = async (options = {}) => {
    try {
        console.log("[ForecastService] Fetching forecast from Open-Meteo (Météo France)...");

        const location = await getLocation();

        const lat = options.lat ?? location.latitude;
        const lon = options.lon ?? location.longitude;

        const params = new URLSearchParams({
            latitude: lat.toString(),
            longitude: lon.toString(),
            hourly: [
                "temperature_2m",
                "relative_humidity_2m",
                "apparent_temperature",
                "precipitation",
                "precipitation_probability",
                "weather_code",
                "surface_pressure",
                "wind_speed_10m",
                "wind_direction_10m",
                "wind_gusts_10m"
            ].join(","),
            daily: ["sunrise", "sunset"].join(","),  // Add daily sunrise/sunset
            wind_speed_unit: "kmh",  // Get wind speed in km/h for consistency
            timezone: "Europe/Paris",
            forecast_days: 7
        });

        const requestUrl = `${OPEN_METEO_FORECAST_URL}?${params.toString()}`;
        console.log("[ForecastService] Request URL:", requestUrl);
        
        const response = await fetch(requestUrl, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "User-Agent": "chatel-meteo-planner/1.0"
            }
        });

        if (!response.ok) {
            throw new Error(`Open-Meteo forecast request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log("[ForecastService] Forecast data received from Open-Meteo");
        console.log("[ForecastService] Full API response keys:", Object.keys(data));
        console.log("[ForecastService] Has daily data?", !!data.daily);
        
        if (data.daily) {
            console.log("[ForecastService] Daily data keys:", Object.keys(data.daily));
            console.log("[ForecastService] Daily data:", JSON.stringify(data.daily, null, 2));
        }

        if (!data.hourly) {
            throw new Error("Invalid Open-Meteo forecast payload");
        }

        const forecastsBase = groupForecastsByDay(data.hourly);
        
        console.log("[ForecastService] Adding sunrise/sunset data from API...");
        
        // Add sunrise/sunset data from API daily data - map to new objects to ensure properties are included
        const forecasts = forecastsBase.map((forecast) => {
            let sunrise = null;
            let sunset = null;
            
            if (data.daily && data.daily.time && data.daily.sunrise && data.daily.sunset) {
                const dailyIndex = data.daily.time.indexOf(forecast.date);
                if (dailyIndex !== -1) {
                    const sunriseStr = data.daily.sunrise[dailyIndex];
                    const sunsetStr = data.daily.sunset[dailyIndex];
                    const tz = location.timezone || data.timezone;

                    sunrise = appendTimeZoneOffset(sunriseStr, tz);
                    sunset = appendTimeZoneOffset(sunsetStr, tz);
                    
                    console.log(`[ForecastService] ${forecast.date}: sunrise ${sunrise}, sunset ${sunset}`);
                } else {
                    console.warn(`[ForecastService] No daily data found for ${forecast.date}`);
                }
            }
            
            // Return new object with all properties including sunrise/sunset
            return {
                ...forecast,
                sunrise,
                sunset
            };
        });

        return {
            location: {
                name: location.name,
                country: "FR",
                coordinates: {
                    latitude: data.latitude,
                    longitude: data.longitude
                },
                elevation: data.elevation,
                timezone: location.timezone || data.timezone
            },
            forecasts: forecasts
        };
    } catch (error) {
        console.error("[ForecastService] Error fetching forecast:", error.message);
        throw error;
    }
};
