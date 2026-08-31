/**
 * SignalK Service for chatel-meteo-planner
 * Provides access to SignalK server APIs for weather and tide data
 * 
 * Configuration via environment variables:
 * - NEXT_PUBLIC_SIGNALK_URL: Base URL of SignalK server (default: window.location.origin)
 */

const getSignalKBaseUrl = () => {
    if (typeof window === "undefined") {
        return process.env.NEXT_PUBLIC_SIGNALK_URL || "http://localhost:3000";
    }
    
    const envUrl = process.env.NEXT_PUBLIC_SIGNALK_URL;
    if (envUrl) {
        return envUrl;
    }
    
    return window.location.origin;
};

// The tides resource provider is registered on the v2 Resources API.
const TIDES_RESOURCE_PATH = "/signalk/v2/api/resources/tides";

/**
 * Make an API call to SignalK server
 * @param {string} path - API path (e.g., '/signalk/v2/api/resources/tides')
 * @param {Object} options - Fetch options
 * @returns {Promise<any>} API response
 */
const apiCall = async (path, options = {}) => {
    const baseUrl = getSignalKBaseUrl();
    const url = `${baseUrl}${path}`;

    try {
        const response = await fetch(url, {
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                ...options.headers
            },
            ...options
        });

        if (!response.ok) {
            throw new Error(`SignalK API error (${response.status}): ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        if (error.name === "TypeError" && error.message === "Failed to fetch") {
            const networkError = new Error(`SignalK server unreachable at ${baseUrl}`);
            networkError.name = "NetworkError";
            console.warn(`[SignalKService] Server unreachable for ${path}:`, error.message);
            throw networkError;
        }
        console.error(`[SignalKService] API call failed for ${path}:`, error);
        throw error;
    }
};

/**
 * Get current vessel position from SignalK
 * @returns {Promise<{latitude: number, longitude: number} | null>} Position or null if unavailable
 */
export const getVesselPosition = async () => {
    try {
        const position = await getSignalKValue("navigation.position");
        if (!position) {
            return null;
        }

        const latitude = position.latitude ?? position.lat ?? null;
        const longitude = position.longitude ?? position.lon ?? null;

        if (typeof latitude !== "number" || typeof longitude !== "number") {
            return null;
        }

        return { latitude, longitude };
    } catch (error) {
        console.warn("[SignalKService] Failed to get vessel position:", error.message);
        return null;
    }
};

/**
 * Get SignalK path value
 * @param {string} signalkPath - SignalK data path (e.g., 'environment.tide.heightNow')
 * @returns {Promise<any>} Path value
 */
export const getSignalKValue = async (signalkPath) => {
    const path = `/signalk/v1/api/vessels/self/${signalkPath.replace(/\./g, "/")}`;
    try {
        const data = await apiCall(path);
        return data?.value ?? data;
    } catch (error) {
        console.warn(`[SignalKService] Failed to get ${signalkPath}:`, error.message);
        return null;
    }
};

/**
 * Get current weather observations from SignalK
 * Uses data from chatel-signalk-weatherprovider plugin
 * @returns {Promise<Object>} Current weather data
 */
export const getCurrentWeather = async () => {
    try {
        const paths = [
            "environment.wind.speedOverGround",
            "environment.wind.directionTrue",
            "environment.wind.gustOverGround",
            "environment.outside.temperature",
            "environment.outside.pressure",
            "environment.outside.relativeHumidity"
        ];

        const results = {};
        for (const p of paths) {
            results[p] = await getSignalKValue(p);
        }

        const MS_TO_KMH = 3.6;
        const RAD_TO_DEG = 180 / Math.PI;
        const KELVIN_OFFSET = 273.15;
        const PA_TO_HPA = 0.01;

        const windSpeedMs = results["environment.wind.speedOverGround"];
        const windDirectionRad = results["environment.wind.directionTrue"];
        const gustMs = results["environment.wind.gustOverGround"];
        const tempK = results["environment.outside.temperature"];
        const pressurePa = results["environment.outside.pressure"];
        const humidityRatio = results["environment.outside.relativeHumidity"];

        return {
            wind: windSpeedMs !== null ? windSpeedMs * MS_TO_KMH : null,
            directionDegrees: windDirectionRad !== null ? windDirectionRad * RAD_TO_DEG : null,
            gust: gustMs !== null ? gustMs * MS_TO_KMH : null,
            temperature: tempK !== null ? tempK - KELVIN_OFFSET : null,
            pressure: pressurePa !== null ? pressurePa * PA_TO_HPA : null,
            humidity: humidityRatio !== null ? humidityRatio * 100 : null
        };
    } catch (error) {
        console.error("[SignalKService] Failed to get current weather:", error.message);
        throw error;
    }
};

/**
 * Get hourly weather forecast from SignalK Weather API
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @param {number} count - Number of periods to return (default 168 for 7 days)
 * @returns {Promise<Array>} Hourly weather forecast data
 */
export const getWeatherForecast = async (latitude, longitude, count = 168) => {
    const path = `/signalk/v2/api/weather/forecasts/point?lat=${latitude}&lon=${longitude}&count=${count}`;
    return await apiCall(path);
};

/**
 * Get daily weather forecast from SignalK Weather API (includes sunrise/sunset)
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @param {number} count - Number of days to return (default 7)
 * @returns {Promise<Array>} Daily weather forecast data with sunrise/sunset
 */
export const getDailyWeatherForecast = async (latitude, longitude, count = 7) => {
    const path = `/signalk/v2/api/weather/forecasts/daily?lat=${latitude}&lon=${longitude}&count=${count}`;
    return await apiCall(path);
};

/**
 * Check if SignalK Weather API is available
 * @returns {Promise<boolean>} True if weather API is available
 */
export const checkWeatherApiAvailability = async () => {
    try {
        const baseUrl = getSignalKBaseUrl();
        const response = await fetch(`${baseUrl}/signalk/v2/api/weather`, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });
        return response.ok;
    } catch (error) {
        console.warn("[SignalKService] Weather API check failed:", error.message);
        return false;
    }
};

/**
 * Get tide data from SignalK (signalk-tides plugin)
 * The plugin exposes tide data via resource provider and delta updates
 * @returns {Promise<Object>} Tide data
 */
export const getTideData = async () => {
    try {
        const paths = [
            "environment.tide.heightNow",
            "environment.tide.heightHigh",
            "environment.tide.heightLow",
            "environment.tide.timeHigh",
            "environment.tide.timeLow",
            "environment.tide.stationName"
        ];

        const results = {};
        for (const p of paths) {
            results[p] = await getSignalKValue(p);
        }

        return {
            heightNow: results["environment.tide.heightNow"],
            heightHigh: results["environment.tide.heightHigh"],
            heightLow: results["environment.tide.heightLow"],
            timeHigh: results["environment.tide.timeHigh"],
            timeLow: results["environment.tide.timeLow"],
            stationName: results["environment.tide.stationName"]
        };
    } catch (error) {
        console.error("[SignalKService] Failed to get tide data:", error.message);
        throw error;
    }
};

/**
 * Get the tide forecast resource collection (signalk-tides plugin).
 *
 * The plugin recomputes this on every request, so unlike the `environment.tide.*`
 * delta paths it never serves stale extremes.
 *
 * @returns {Promise<Object|null>} GeoJSON feature collection, one feature per day
 */
export const getTideForecast = async () => {
    try {
        return await apiCall(TIDES_RESOURCE_PATH);
    } catch (error) {
        console.warn("[SignalKService] Tide forecast not available:", error.message);
        return null;
    }
};

/**
 * Get the upcoming tide extremes as a single flat, chronologically sorted list.
 *
 * @returns {Promise<{stationName: string|null, extremes: Array}|null>}
 */
export const getTideExtremes = async () => {
    const collection = await getTideForecast();
    if (!collection || typeof collection !== "object") {
        return null;
    }

    const seen = new Set();
    const extremes = [];
    let stationName = null;

    for (const feature of Object.values(collection)) {
        const properties = feature?.properties;
        if (!properties || !Array.isArray(properties.extremes)) {
            continue;
        }
        stationName = stationName || properties.name || null;

        for (const extreme of properties.extremes) {
            if (!extreme?.time || !Number.isFinite(Number(extreme.value))) {
                continue;
            }
            // Days overlap at the boundaries, so the same extreme can appear twice.
            const key = `${extreme.time}|${extreme.type}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            extremes.push({
                type: extreme.type,
                value: Number(extreme.value),
                time: extreme.time,
                coefficient: Number.isFinite(Number(extreme.coefficient)) ? Number(extreme.coefficient) : null
            });
        }
    }

    if (extremes.length === 0) {
        return null;
    }

    extremes.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    return { stationName, extremes };
};

/**
 * Check if SignalK tides resource is available
 * @returns {Promise<boolean>} True if tides resource is available
 */
export const checkTidesAvailability = async () => {
    try {
        const baseUrl = getSignalKBaseUrl();
        const response = await fetch(`${baseUrl}${TIDES_RESOURCE_PATH}`, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });
        return response.ok;
    } catch (error) {
        console.warn("[SignalKService] Tides API check failed:", error.message);
        return false;
    }
};

/**
 * Check if SignalK server is reachable
 * @returns {Promise<boolean>} True if server is reachable
 */
export const checkServerAvailability = async () => {
    try {
        const baseUrl = getSignalKBaseUrl();
        const response = await fetch(`${baseUrl}/signalk`, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });
        return response.ok;
    } catch (error) {
        return false;
    }
};

export default {
    getSignalKBaseUrl,
    apiCall,
    getSignalKValue,
    getVesselPosition,
    getCurrentWeather,
    getWeatherForecast,
    getDailyWeatherForecast,
    checkWeatherApiAvailability,
    getTideData,
    getTideForecast,
    getTideExtremes,
    checkTidesAvailability,
    checkServerAvailability
};
