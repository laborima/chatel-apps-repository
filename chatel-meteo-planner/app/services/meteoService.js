/**
 * Real-time Weather Service for Châtelaillon-Plage
 * Uses Open-Meteo API (Météo France data)
 * 
 * Note: The meteolarochelle.fr page uses AJAX/JavaScript to load data dynamically,
 * making traditional scraping impossible without a headless browser.
 * Using Open-Meteo API provides reliable real-time data from Météo France.
 */

const CHATELAILLON_COORDS = {
    latitude: 46.0747,
    longitude: -1.0881
};

const OPEN_METEO_API_URL = "https://api.open-meteo.com/v1/meteofrance";
/**
 * Calculate Beaufort scale from wind speed (km/h)
 */
function calculateBeaufort(windKmh) {
    if (windKmh < 1) return 0;
    if (windKmh < 6) return 1;
    if (windKmh < 12) return 2;
    if (windKmh < 20) return 3;
    if (windKmh < 29) return 4;
    if (windKmh < 39) return 5;
    if (windKmh < 50) return 6;
    if (windKmh < 62) return 7;
    if (windKmh < 75) return 8;
    if (windKmh < 89) return 9;
    if (windKmh < 103) return 10;
    if (windKmh < 118) return 11;
    return 12;
}

/**
 * Convert wind direction from degrees to cardinal direction
 */
function degreeToCardinal(degree) {
    if (degree === null || degree === undefined) {
        return null;
    }
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
    const index = Math.round(degree / 22.5) % 16;
    return directions[index];
}

/**
 * Fetch current weather from Open-Meteo API (Météo France data)
 * This replaces scraping since meteolarochelle.fr uses AJAX to load data dynamically
 */
export default async function scrapeMeteoLaRochelle(url = null, opts = {}) {
    try {
        console.log("[MeteoService] Fetching real-time data from Open-Meteo API (Météo France)...");

        const params = new URLSearchParams({
            latitude: CHATELAILLON_COORDS.latitude.toString(),
            longitude: CHATELAILLON_COORDS.longitude.toString(),
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
            direction: windDirection ? degreeToCardinal(windDirection) : null,
            directionDegrees: windDirection,
            beaufort: windSpeedKmh ? calculateBeaufort(windSpeedKmh) : null,
            gust: windGustKmh,
            temperature: current.temperature_2m,
            apparentTemperature: current.apparent_temperature,
            humidity: current.relative_humidity_2m,
            precipitation: current.precipitation,
            rain: current.rain,
            // Simulated averages (not available in current data, using instant value)
            avg1min: windSpeedKmh,
            avg10min: windSpeedKmh
        };

        console.log("[MeteoService] Wind:", windSpeedKmh?.toFixed(1), "km/h", parsed.direction, "Beaufort:", parsed.beaufort);

        return {
            sourceUrl: OPEN_METEO_API_URL,
            source: "Open-Meteo (Météo France)",
            fetchedAt: current.time || new Date().toISOString(),
            location: {
                latitude: CHATELAILLON_COORDS.latitude,
                longitude: CHATELAILLON_COORDS.longitude,
                name: "Châtelaillon-Plage"
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
