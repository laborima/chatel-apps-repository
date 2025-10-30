/**
 * Common Utilities for Weather and Tide Services
 * Shared utility functions for unit conversions, calculations, and constants
 */

/**
 * Wind direction constants mapping cardinal directions to degrees
 */
export const WIND_DIRECTIONS = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
    E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
    W: 270, WNW: 292.5, NW: 315, NNW: 337.5
};

/**
 * Converts km/h to knots
 * @param {number} kmh - Speed in kilometers per hour
 * @returns {number|null} Speed in knots or null if input is invalid
 */
export const kmhToKnots = (kmh) => {
    if (kmh === null || kmh === undefined) {
        return null;
    }
    return kmh * 0.539957;
};

/**
 * Converts m/s to knots
 * @param {number} ms - Speed in meters per second
 * @returns {number} Speed in knots
 */
export const msToKnots = (ms) => {
    return ms * 1.94384;
};

/**
 * Calculate Beaufort scale from wind speed (km/h)
 * @param {number} windKmh - Wind speed in km/h
 * @returns {number} Beaufort scale value (0-12)
 */
export const calculateBeaufort = (windKmh) => {
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
};

/**
 * Convert wind direction from degrees to cardinal direction
 * @param {number} degree - Wind direction in degrees (0-360)
 * @returns {string|null} Cardinal direction (N, NNE, NE, etc.) or null if invalid
 */
export const degreeToDirection = (degree) => {
    if (degree === null || degree === undefined) {
        return null;
    }
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const index = Math.round(degree / 22.5) % 16;
    return directions[index];
};

/**
 * Calculate sunrise and sunset times for a given date and location
 * Using simplified solar calculation algorithm
 * @param {Date} date - The date for which to calculate sun times
 * @param {number} latitude - Latitude in degrees
 * @param {number} longitude - Longitude in degrees
 * @returns {{sunrise: Date, sunset: Date}} Object containing sunrise and sunset times
 */
export const calculateSunTimes = (date, latitude, longitude) => {
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
};
