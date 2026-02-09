/**
 * Real-time Weather Service for Châtelaillon-Plage
 * Scrapes data from meteolarochelle.fr (clientraw.txt)
 * 
 * Based on: https://www.meteolarochelle.fr/wdlchatel/comparaison_chatelkts.htm
 * And parsing logic from: https://www.meteolarochelle.fr/wdlchatel/ajaxWDwxChatelkts.js
 */

import { calculateBeaufort, degreeToDirection } from "./utils";
import { getLocation } from "./configService";

const CLIENTRAW_URL = "https://www.meteolarochelle.fr/wdlchatel/clientraw.txt";

// Conversion constants
const KNOTS_TO_KMH = 1.852;

/**
 * Fetch current weather from meteolarochelle.fr clientraw.txt
 */
export default async function scrapeMeteoLaRochelle(url = null, opts = {}) {
    try {
        console.log("[MeteoService] Fetching real-time data from meteolarochelle.fr...");

        const targetUrl = url || CLIENTRAW_URL;
        
        const response = await fetch(targetUrl, {
            method: "GET",
            headers: {
                "User-Agent": "chatel-meteo-planner/1.0"
            },
            ...opts
        });

        if (!response.ok) {
            throw new Error(`Meteo La Rochelle error: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        const clientraw = text.trim().split(' ');

        // Validate format: '12345' at start and '!!' at end of record
        // The last element might be the '!!' part or '!!' is attached to the last number
        // Sometimes clientraw ends with space then !! or similar.
        // We just check the start marker as per basic validation.
        const isValid = clientraw[0] === '12345';
        
        if (!isValid) {
            throw new Error("Invalid clientraw.txt format");
        }

        // Parse data using indices from ajaxWDwxChatelkts.js
        
        // Wind speeds in knots in clientraw.txt
        // Index 1: Avg wind speed (1 min)
        // Index 2: Current Wind speed
        // Index 158: Avg wind speed (10 min)
        // Index 140: Gust
        // Index 71: Max gust
        
        const windKnots = parseFloat(clientraw[2]);
        const windAvg1MinKnots = parseFloat(clientraw[1]);
        const windAvg10MinKnots = parseFloat(clientraw[158]);
        const gustKnots = parseFloat(clientraw[140]);
        const maxGustKnots = parseFloat(clientraw[71]);
        
        // Wind Direction
        const windDirectionDegrees = parseInt(clientraw[3], 10);
        
        // Temperature (Celsius)
        const tempC = parseFloat(clientraw[4]);
        const apparentTempC = parseFloat(clientraw[130]); // Apparent temp
        
        // Humidity (%)
        const humidity = parseInt(clientraw[5], 10);
        
        // Pressure (hPa)
        const pressure = parseFloat(clientraw[6]);
        
        // Rain (mm)
        const rain = parseFloat(clientraw[7]);
        
        // Precipitation (using rain rate or today's rain?)
        // Index 10: Rain rate (mm/min?) -> js does raw * 60 for mm/hr
        const precipitationRate = parseFloat(clientraw[10]) * 60;

        const location = await getLocation();

        // Convert to application units (km/h)
        const windKmh = windKnots * KNOTS_TO_KMH;
        const windAvg1MinKmh = windAvg1MinKnots * KNOTS_TO_KMH;
        const windAvg10MinKmh = windAvg10MinKnots * KNOTS_TO_KMH;
        const gustKmh = gustKnots * KNOTS_TO_KMH;
        const maxGustKmh = maxGustKnots * KNOTS_TO_KMH;

        // Use 10 min average for Beaufort if available, otherwise current wind
        const beaufortWind = windAvg10MinKmh || windKmh;
        
        const parsed = {
            // Standard fields
            wind: windKmh,
            direction: degreeToDirection(windDirectionDegrees),
            directionDegrees: windDirectionDegrees,
            beaufort: calculateBeaufort(beaufortWind),
            gust: gustKmh,
            temperature: tempC,
            apparentTemperature: apparentTempC,
            humidity: humidity,
            precipitation: precipitationRate, // mm/h
            rain: rain, // accumulated today
            
            // Extended fields specific to this source
            avg1min: windAvg1MinKmh,
            avg10min: windAvg10MinKmh,
            maxGust: maxGustKmh,
            
            // Raw values in knots (useful for debugging or specific displays)
            windKnots: windKnots,
            gustKnots: gustKnots,
            avg10minKnots: windAvg10MinKnots
        };

        console.log("[MeteoService] Wind:", windKmh.toFixed(1), "km/h", parsed.direction, "Beaufort:", parsed.beaufort);

        // Construct date from clientraw fields if possible, or use current time
        // clientraw[32] is time (HH-MM-SS), clientraw[74] is date (DD-MM-YYYY)
        let fetchedAt = new Date().toISOString();
        try {
            const timeStr = clientraw[32]; // HH-MM-SS
            const dateStr = clientraw[74]; // D-M-YYYY or similar
            if (timeStr && dateStr) {
                // timeStr often has trailing space or chars, clean it
                const cleanTime = timeStr.trim();
                const cleanDate = dateStr.trim();
                
                // Check if format matches expected
                const timeParts = cleanTime.split('-');
                const dateParts = cleanDate.split('-');
                
                if (timeParts.length >= 3 && dateParts.length >= 3) {
                   const [h, m, s] = timeParts;
                   const [day, month, year] = dateParts;
                   const date = new Date(year, month - 1, day, h, m, s);
                   if (!isNaN(date.getTime())) {
                       fetchedAt = date.toISOString();
                   }
                }
            }
        } catch (e) {
            // Fallback to current time
            console.warn("[MeteoService] Failed to parse date from clientraw, using current time");
        }

        return {
            sourceUrl: CLIENTRAW_URL,
            source: "Météo La Rochelle (Station)",
            fetchedAt: fetchedAt,
            location: {
                latitude: location.latitude,
                longitude: location.longitude,
                name: location.name
            },
            parsed,
            rawData: clientraw
        };

    } catch (error) {
        console.error("[MeteoService] Error fetching from meteolarochelle.fr:", error.message);
        throw error;
    }
}

export { scrapeMeteoLaRochelle };
