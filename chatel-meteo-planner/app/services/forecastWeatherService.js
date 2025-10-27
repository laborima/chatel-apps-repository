/**
 * Forecast Weather Service
 * Uses Open-Meteo Météo France API for weather forecasts
 * Documentation: https://open-meteo.com/en/docs/meteofrance-api
 */

const CHATELAILLON_COORDS = {
    latitude: 46.0747,
    longitude: -1.0881
};

const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/meteofrance";

/**
 * Calculate sunrise and sunset times for a given date and location
 * Using simplified solar calculation algorithm
 */
function calculateSunTimes(date, latitude, longitude) {
    const rad = Math.PI / 180;
    const deg = 180 / Math.PI;
    
    // Julian date
    const jd = date.getTime() / 86400000 + 2440587.5;
    const n = jd - 2451545.0;
    
    // Mean solar noon
    const J = n - longitude / 360;
    
    // Solar mean anomaly
    const M = (357.5291 + 0.98560028 * J) % 360;
    
    // Equation of center
    const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
    
    // Ecliptic longitude
    const lambda = (M + C + 180 + 102.9372) % 360;
    
    // Solar transit
    const Jtransit = 2451545.0 + J + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
    
    // Declination of the sun
    const delta = Math.asin(Math.sin(lambda * rad) * Math.sin(23.44 * rad)) * deg;
    
    // Hour angle
    const omega = Math.acos((Math.sin(-0.83 * rad) - Math.sin(latitude * rad) * Math.sin(delta * rad)) / 
                           (Math.cos(latitude * rad) * Math.cos(delta * rad))) * deg;
    
    // Sunrise and sunset
    const Jrise = Jtransit - omega / 360;
    const Jset = Jtransit + omega / 360;
    
    // Convert to JavaScript Date objects
    const sunrise = new Date((Jrise - 2440587.5) * 86400000);
    const sunset = new Date((Jset - 2440587.5) * 86400000);
    
    return { sunrise, sunset };
}

const toFloat = (value) => {
    const numeric = typeof value === "number" ? value : parseFloat(value);
    return Number.isFinite(numeric) ? numeric : null;
};

/**
 * Convert wind direction from degrees to cardinal direction
 */
const degreeToCardinal = (degree) => {
    if (degree === null || degree === undefined) {
        return null;
    }
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
    const index = Math.round(degree / 22.5) % 16;
    return directions[index];
};

/**
 * Group hourly forecasts by day
 */
const groupForecastsByDay = (hourlyData) => {
    const buckets = new Map();

    for (let i = 0; i < hourlyData.time.length; i++) {
        const dateTime = hourlyData.time[i];
        const dateKey = dateTime.slice(0, 10);

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
            windDirectionCardinal: degreeToCardinal(hourlyData.wind_direction_10m?.[i]),
            precipitation: toFloat(hourlyData.precipitation[i]),
            precipitationProbability: toFloat(hourlyData.precipitation_probability?.[i]),
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

        const lat = options.lat ?? CHATELAILLON_COORDS.latitude;
        const lon = options.lon ?? CHATELAILLON_COORDS.longitude;

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
                    // API returns partial ISO format like "2025-10-24T08:34"
                    // Add seconds and timezone for complete ISO format
                    const sunriseStr = data.daily.sunrise[dailyIndex];
                    const sunsetStr = data.daily.sunset[dailyIndex];
                    
                    // Convert to full ISO string with timezone
                    sunrise = sunriseStr.length === 16 ? `${sunriseStr}:00+02:00` : sunriseStr;
                    sunset = sunsetStr.length === 16 ? `${sunsetStr}:00+02:00` : sunsetStr;
                    
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
                name: "Châtelaillon-Plage",
                country: "FR",
                coordinates: {
                    latitude: data.latitude,
                    longitude: data.longitude
                },
                elevation: data.elevation,
                timezone: data.timezone
            },
            forecasts: forecasts
        };
    } catch (error) {
        console.error("[ForecastService] Error fetching forecast:", error.message);
        throw error;
    }
};
