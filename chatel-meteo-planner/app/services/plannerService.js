/**
 * Planner Service
 * Coordinates weather, tide, and activity services to provide recommendations
 * Includes merged activities management logic
 */

import { scrapeMeteoLaRochelle } from "./meteoService";
import { fetchFiveDayForecast } from "./forecastWeatherService";
import { fetchTideData, calculateTideHeightUsingTwelfths, calculateTideHeightForDateTime } from "./tideService";
import { kmhToKnots, degreeToDirection, WIND_DIRECTIONS } from "./utils";
import { getLocation, loadActivitiesData } from "./configService";

// ============================================================================
// ACTIVITIES SERVICE - Merged Functions
// ============================================================================

/**
 * Normalizes wind direction to degrees
 */
const normalizeDirection = (direction) => {
    if (typeof direction === "number") {
        return direction;
    }
    if (typeof direction === "string") {
        const normalized = direction.toUpperCase().trim();
        return WIND_DIRECTIONS[normalized] ?? null;
    }
    return null;
};

/**
 * Checks if a direction is within preferred directions (±22.5 degrees tolerance)
 */
const isDirectionPreferred = (currentDirection, preferredDirections, idealDirection = null) => {
    const currentDeg = normalizeDirection(currentDirection);
    if (currentDeg === null) {
        return false;
    }

    // Check if matches ideal direction first
    if (idealDirection) {
        const idealDeg = normalizeDirection(idealDirection);
        if (idealDeg !== null && Math.abs(currentDeg - idealDeg) <= 22.5) {
            return true;
        }
    }

    // Check if matches any preferred direction
    if (!preferredDirections || preferredDirections.length === 0) {
        return true; // No restrictions
    }

    return preferredDirections.some((preferred) => {
        const preferredDeg = normalizeDirection(preferred);
        if (preferredDeg === null) {
            return false;
        }
        const diff = Math.abs(currentDeg - preferredDeg);
        return diff <= 22.5 || diff >= 337.5; // Handle 360° wrap-around
    });
};

/**
 * Checks if a date is a French holiday
 */
const isFrenchHoliday = (date, holidays = []) => {
    const dateStr = date.toISOString().split('T')[0];
    return holidays.includes(dateStr);
};

/**
 * Checks if a date falls within school holidays (Zone B)
 */
const isSchoolHolidayZoneB = (date, schoolHolidaysConfig = {}) => {
    if (!schoolHolidaysConfig || !schoolHolidaysConfig['2024_2025']) {
        return false;
    }

    const dateStr = date.toISOString().split('T')[0];
    const holidays = schoolHolidaysConfig['2024_2025'];

    return holidays.some(period => 
        dateStr >= period.start && dateStr <= period.end
    );
};

/**
 * Checks if profile is available at given time based on non_working_hours
 * non_working_hours represents the time slots when activities are POSSIBLE
 */
const isProfileAvailable = (profile, currentTime = new Date(), calendarData = {}) => {
    if (!profile || !profile.availability || !profile.availability.non_working_hours) {
        return true; // No restrictions if not defined
    }

    const nwh = profile.availability.non_working_hours;
    const day = currentTime.getDay();
    const hours = currentTime.getHours();
    const isWeekend = day === 0 || day === 6;
    const dateIsFrenchHoliday = calendarData.french_holidays && isFrenchHoliday(currentTime, calendarData.french_holidays);
    const dateIsSchoolHoliday = calendarData.school_holidays_zone_b && isSchoolHolidayZoneB(currentTime, calendarData.school_holidays_zone_b);

    // Check weekday activity hours (e.g., "08:00-18:00" means activities possible from 8h to 18h)
    if (!isWeekend && !dateIsFrenchHoliday && !dateIsSchoolHoliday && nwh.weekdays) {
        const [startStr, endStr] = nwh.weekdays.split('-');
        const [startHour] = startStr.split(':').map(Number);
        const [endHour] = endStr.split(':').map(Number);
        
        // Activities are only available within the specified hours
        if (hours < startHour || hours >= endHour) {
            return false; // Outside activity hours
        }
    }

    // Check if available on weekends
    if (isWeekend && nwh.weekends === 'unavailable') {
        return false;
    }

    // Check if available on holidays
    if (dateIsFrenchHoliday && nwh.holidays === 'unavailable') {
        return false;
    }

    // Check if available during school holidays Zone B
    if (dateIsSchoolHoliday && nwh.school_holidays_zone_b === 'unavailable') {
        return false;
    }

    return true;
};

/**
 * Checks if current time matches activity time slot constraints
 */
const matchesTimeSlots = (timeSlots, currentTime = new Date()) => {
    if (!timeSlots || timeSlots.length === 0) {
        return true;
    }

    const day = currentTime.getDay();
    const hours = currentTime.getHours();
    const isWeekend = day === 0 || day === 6;

    for (const slot of timeSlots) {
        if (slot === "weekend" && !isWeekend) {
            return false;
        }
        if (slot === "after_18h" && hours < 18) {
            return false;
        }
    }

    return true;
};

/**
 * Checks if it's daylight hours (7am - 9pm)
 */
const isDaylight = (currentTime = new Date()) => {
    const hours = currentTime.getHours();
    return hours >= 7 && hours <= 21;
};

/**
 * Evaluates if an activity is feasible given current conditions
 * Returns a score from 0-100 and validation status
 */
export const evaluateActivity = (activity, conditions, currentTime = new Date(), profile = null, calendarData = {}) => {
    const { ideal_conditions } = activity;

    const result = {
        isValid: true,
        score: 100,
        reasons: [],
        warnings: []
    };

    // Check profile availability (non-working hours, holidays, school holidays)
    if (profile && !isProfileAvailable(profile, currentTime, calendarData)) {
        result.isValid = false;
        result.reasons.push("Profile not available at this time");
        result.score -= 100;
    }

    // Check daylight requirement
    if (ideal_conditions.daylight_only) {
        // Use conditions.isDaylight if provided, otherwise fall back to time-based check
        const hasDaylight = conditions.isDaylight !== undefined ? conditions.isDaylight : isDaylight(currentTime);
        if (!hasDaylight) {
            result.isValid = false;
            result.reasons.push("Activity requires daylight");
            result.score -= 100;
        }
    }

    // Check time slots (weekend, after_18h)
    if (ideal_conditions.time_slots && !matchesTimeSlots(ideal_conditions.time_slots, currentTime)) {
        result.isValid = false;
        result.reasons.push("Time slot requirements not met");
        result.score -= 50;
    }

    // Check tide minimum
    if (ideal_conditions.tide_min !== undefined && conditions.tideHeight < ideal_conditions.tide_min) {
        result.isValid = false;
        result.reasons.push(`Tide too low (${conditions.tideHeight.toFixed(2)}m < ${ideal_conditions.tide_min}m)`);
        result.score -= 50;
    }

    // Check tide maximum
    if (ideal_conditions.tide_max !== undefined && conditions.tideHeight > ideal_conditions.tide_max) {
        result.isValid = false;
        result.reasons.push(`Tide too high (${conditions.tideHeight.toFixed(2)}m > ${ideal_conditions.tide_max}m)`);
        result.score -= 50;
    }

    // Check wind range
    const windKnots = conditions.windKnots;
    if (ideal_conditions.wind_range) {
        const [minWind, maxWind] = ideal_conditions.wind_range;
        
        if (windKnots < minWind) {
            result.isValid = false;
            result.reasons.push(`Wind too low (${windKnots.toFixed(1)} knots < ${minWind} knots)`);
            result.score -= 40;
        }
        
        if (windKnots > maxWind) {
            result.isValid = false;
            result.reasons.push(`Wind too high (${windKnots.toFixed(1)} knots > ${maxWind} knots)`);
            result.score -= 40;
        }
    }

    // Check wind minimum (alternative to range)
    if (ideal_conditions.wind_min !== undefined && windKnots < ideal_conditions.wind_min) {
        result.isValid = false;
        result.reasons.push(`Wind too low (${windKnots.toFixed(1)} knots < ${ideal_conditions.wind_min} knots)`);
        result.score -= 40;
    }

    // Check wind maximum (alternative to range)
    if (ideal_conditions.wind_max !== undefined && windKnots > ideal_conditions.wind_max) {
        result.isValid = false;
        result.reasons.push(`Wind too high (${windKnots.toFixed(1)} knots > ${ideal_conditions.wind_max} knots)`);
        result.score -= 40;
    }

    // Check wave height
    if (ideal_conditions.wave_height_max !== undefined && conditions.swellHeight !== null) {
        if (conditions.swellHeight > ideal_conditions.wave_height_max) {
            result.isValid = false;
            result.reasons.push(`Waves too high (${conditions.swellHeight}m > ${ideal_conditions.wave_height_max}m)`);
            result.score -= 30;
        }
    }

    // Check weather conditions
    if (ideal_conditions.no_storm && conditions.isStorm) {
        result.isValid = false;
        result.reasons.push("Storm conditions - activity not safe");
        result.score -= 100;
    }

    if (ideal_conditions.no_rain && conditions.isRaining) {
        result.isValid = false;
        result.reasons.push("Rain is not suitable for this activity");
        result.score -= 20;
    }

    // Check wind direction
    if (ideal_conditions.wind_direction && conditions.windDirection) {
        const isPreferred = isDirectionPreferred(
            conditions.windDirection, 
            ideal_conditions.wind_direction,
            ideal_conditions.wind_direction_ideal ? ideal_conditions.wind_direction_ideal[0] : null
        );
        
        if (!isPreferred) {
            result.score -= 15;
            result.warnings.push(`Wind direction not ideal (current: ${conditions.windDirection})`);
        } else if (ideal_conditions.wind_direction_ideal) {
            // Bonus for ideal direction
            const isIdeal = isDirectionPreferred(
                conditions.windDirection,
                [],
                ideal_conditions.wind_direction_ideal[0]
            );
            if (isIdeal) {
                result.score += 10;
            }
        }
    }

    // Check tide phase preference
    if (ideal_conditions.tide_phase === "rising" && conditions.tidePhase !== "rising") {
        result.score -= 5;
        result.warnings.push("Tide phase not optimal (prefer rising tide)");
    }

    // Check visibility
    if (ideal_conditions.visibility_min !== undefined && conditions.visibility !== null) {
        if (conditions.visibility < ideal_conditions.visibility_min) {
            result.isValid = false;
            result.reasons.push(`Visibility too low (${conditions.visibility}km < ${ideal_conditions.visibility_min}km)`);
            result.score -= 40;
        }
    }

    // Check temperature
    if (ideal_conditions.temperature_min !== undefined && conditions.temperature !== null) {
        if (conditions.temperature < ideal_conditions.temperature_min) {
            result.isValid = false;
            result.reasons.push(`Temperature too cold (${conditions.temperature}°C < ${ideal_conditions.temperature_min}°C)`);
            result.score -= 20;
        }
    }

    result.score = Math.max(0, Math.min(100, result.score));
    return result;
};

/**
 * Filters activities that match current conditions
 */
export const filterActivities = (activities, conditions, currentTime = new Date(), profile = null, calendarData = {}) => {
    return activities
        .map((activity) => ({
            ...activity,
            evaluation: evaluateActivity(activity, conditions, currentTime, profile, calendarData)
        }))
        .filter((activity) => activity.evaluation.isValid)
        .sort((a, b) => b.evaluation.score - a.evaluation.score);
};

/**
 * Gets all activities with their evaluations (including invalid ones)
 */
export const evaluateAllActivities = (activities, conditions, currentTime = new Date(), profile = null, calendarData = {}) => {
    return activities
        .map((activity) => ({
            ...activity,
            evaluation: evaluateActivity(activity, conditions, currentTime, profile, calendarData)
        }))
        .sort((a, b) => b.evaluation.score - a.evaluation.score);
};

/**
 * Gets recommended gear for a profile based on wind conditions
 */
export const getRecommendedGear = (profile, equipment, windKnots) => {
    const recommended = {
        boards: [],
        sails: [],
        wings: [],
        foils: [],
        boats: [],
        speedsails: []
    };

    if (!profile || !equipment) {
        return recommended;
    }

    // Filter equipment available to this profile and suitable for wind conditions
    const availableGear = equipment.filter((item) => {
        const isAvailable = item.users.includes(profile.id) || item.users.includes("all");
        const [minWind, maxWind] = item.wind_range || [0, 100];
        const isSuitable = windKnots >= minWind && windKnots <= maxWind;
        return isAvailable && isSuitable;
    });

    // Categorize gear by type
    for (const item of availableGear) {
        const gearInfo = {
            id: item.id,
            name: item.name,
            wind_range: item.wind_range,
            skill_level: item.skill_level,
            is_favorite: profile.favorite_gear?.includes(item.id) || false
        };

        switch (item.type) {
            case "windsurf_board":
                recommended.boards.push(gearInfo);
                break;
            case "windsurf_sail":
                recommended.sails.push(gearInfo);
                break;
            case "wing":
                recommended.wings.push(gearInfo);
                break;
            case "foil":
                recommended.foils.push(gearInfo);
                break;
            case "sailboat":
                recommended.boats.push(gearInfo);
                break;
            case "speedsail":
                recommended.speedsails.push(gearInfo);
                break;
        }
    }

    // Sort by favorite first, then by skill level match
    const sortByFavorite = (a, b) => {
        if (a.is_favorite && !b.is_favorite) return -1;
        if (!a.is_favorite && b.is_favorite) return 1;
        return 0;
    };

    recommended.boards.sort(sortByFavorite);
    recommended.sails.sort(sortByFavorite);
    recommended.wings.sort(sortByFavorite);
    recommended.foils.sort(sortByFavorite);
    recommended.boats.sort(sortByFavorite);
    recommended.speedsails.sort(sortByFavorite);

    return recommended;
};

/**
 * Checks if a profile can do an activity based on skill level and suitable_for
 */
export const canProfileDoActivity = (profile, activity) => {
    if (!profile || !activity) {
        return false;
    }

    // Check if profile is in suitable_for list
    if (!activity.suitable_for.includes(profile.id) && !activity.suitable_for.includes("all")) {
        return false;
    }

    // Check skill level (beginner < intermediate < advanced < expert)
    const skillLevels = ["beginner", "intermediate", "advanced", "expert"];
    const profileLevel = skillLevels.indexOf(profile.skill_level);
    const requiredLevel = skillLevels.indexOf(activity.skill_level_required);

    return profileLevel >= requiredLevel;
};

/**
 * Fetches activities data from public folder
 */
export const fetchActivitiesData = loadActivitiesData;

/**
 * Gets a profile by ID
 */
export const getProfileById = (profiles, profileId) => {
    return profiles.find((profile) => profile.id === profileId);
};

/**
 * Gets a profile by name
 */
export const getProfileByName = (profiles, name) => {
    return profiles.find((profile) => profile.name.toLowerCase() === name.toLowerCase());
};

/**
 * Gets equipment by ID
 */
export const getEquipmentById = (equipment, equipmentId) => {
    return equipment.find((item) => item.id === equipmentId);
};

// ============================================================================
// PLANNER SERVICE - Main Functions
// ============================================================================

/**
 * Transforms a profile from the new activities.json format to the legacy sailor format
 * Maps favorite_gear array of IDs to favoriteGear object with actual equipment names
 */
const transformProfileToSailor = (profile, equipment) => {
    if (!profile) {
        return null;
    }

    const favoriteGear = {
        boards: [],
        sails: [],
        wings: [],
        foils: [],
        boats: [],
        speedsails: [],
        dinghies: [],
        paddles: []
    };
    
    if (profile.favorite_gear && Array.isArray(profile.favorite_gear)) {
        for (const gearId of profile.favorite_gear) {
            const gear = getEquipmentById(equipment, gearId);
            if (gear) {
                switch (gear.type) {
                    case "windsurf_board":
                        favoriteGear.boards.push(gear.name);
                        break;
                    case "windsurf_sail":
                        favoriteGear.sails.push(gear.name);
                        break;
                    case "wing":
                    case "wing_board":
                        favoriteGear.wings.push(gear.name);
                        break;
                    case "foil":
                        favoriteGear.foils.push(gear.name);
                        break;
                    case "sailboat":
                        favoriteGear.boats.push(gear.name);
                        break;
                    case "speedsail":
                        favoriteGear.speedsails.push(gear.name);
                        break;
                    case "dinghy":
                        favoriteGear.dinghies.push(gear.name);
                        break;
                    case "sup_board":
                        favoriteGear.paddles.push(gear.name);
                        break;
                }
            }
        }
    }

    // Clean up empty arrays
    Object.keys(favoriteGear).forEach(key => {
        if (favoriteGear[key].length === 0) {
            delete favoriteGear[key];
        }
    });

    return {
        id: profile.id,
        name: profile.name,
        heightCm: profile.height,
        weightKg: profile.weight,
        skillLevel: profile.skill_level,
        favoriteGear: Object.keys(favoriteGear).length > 0 ? favoriteGear : null,
        preferredConditions: profile.preferred_conditions
    };
};

/**
 * Transforms all profiles to sailor format
 */
const transformProfilesToSailors = (profiles, equipment) => {
    if (!profiles || !Array.isArray(profiles)) {
        return [];
    }
    return profiles.map(profile => transformProfileToSailor(profile, equipment)).filter(Boolean);
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
                coefficient: tideData.coeffNow,
                phase: tideData.isRising ? "rising" : "falling"
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
 * Uses free Open-Meteo API
 */
export const fetchForecastConditions = async () => {
    try {
        const location = await getLocation();

        const forecast = await fetchFiveDayForecast({
            lat: location.latitude,
            lon: location.longitude
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
 * Converts current conditions to activity evaluation format
 */
const prepareConditionsForEvaluation = (currentConditions) => {
    return {
        windKnots: currentConditions.wind.speedKnots || 0,
        windDirection: currentConditions.wind.direction,
        tideHeight: currentConditions.tide?.heightNow || 0,
        tidePhase: currentConditions.tide?.phase || "unknown",
        swellHeight: null, // Not available in current data
        isRaining: false, // Could be enhanced with weather data
        isStorm: false,
        isWet: false, // Could be enhanced with recent precipitation data
        visibility: null, // Not available in current data
        temperature: null // Not available in current data
    };
};

/**
 * Gets activity recommendations for the next 3 hours based on current conditions
 */
export const getNext3HoursRecommendations = async (profileId) => {
    try {
        const [activitiesData, currentConditions] = await Promise.all([
            fetchActivitiesData(),
            fetchCurrentConditions()
        ]);

        const profile = getProfileById(activitiesData.profiles, profileId);

        if (!profile) {
            throw new Error(`Profile ${profileId} not found`);
        }

        if (!currentConditions.wind.speedKnots || !currentConditions.tide) {
            return {
                profile,
                currentConditions,
                activities: [],
                recommendedGear: null,
                message: "Insufficient weather or tide data for recommendations"
            };
        }

        const conditions = prepareConditionsForEvaluation(currentConditions);

        // Filter activities suitable for this profile
        const profileActivities = activitiesData.activities.filter((activity) => 
            canProfileDoActivity(profile, activity)
        );

        // Evaluate and filter valid activities with profile availability and calendar data
        const validActivities = filterActivities(
            profileActivities, 
            conditions, 
            new Date(),
            profile,
            activitiesData.calendar || {}
        );

        // Get recommended gear
        const recommendedGear = getRecommendedGear(
            profile, 
            activitiesData.equipment, 
            conditions.windKnots
        );

        return {
            profile,
            currentConditions,
            activities: validActivities,
            recommendedGear,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error("Error getting 3-hour recommendations:", error);
        throw error;
    }
};

/**
 * Merges consecutive time slots for each activity and adds time ranges with tide info
 * Respects daylight hours for activities that require it
 */
const mergeActivityTimeSlots = (daySlots, sunrise, sunset) => {
    if (!daySlots || daySlots.length === 0) {
        return [];
    }

    // Parse sunrise/sunset to get hour limits
    let sunriseHour = 7;
    let sunsetHour = 21;
    
    if (sunrise) {
        const sunriseDate = new Date(sunrise);
        sunriseHour = sunriseDate.getHours();
    }
    if (sunset) {
        const sunsetDate = new Date(sunset);
        sunsetHour = sunsetDate.getHours();
    }

    // Group activities by ID across all slots
    const activitiesMap = new Map();

    daySlots.forEach(slot => {
        if (!slot.activities) return;
        
        slot.activities.forEach(activity => {
            if (!activitiesMap.has(activity.id)) {
                activitiesMap.set(activity.id, {
                    ...activity,
                    slots: []
                });
            }
            activitiesMap.get(activity.id).slots.push({
                hour: slot.hour,
                windKnots: slot.conditions?.windKnots,
                tideEstimate: slot.conditions?.tideEstimate
            });
        });
    });

    // Build merged activities with time ranges
    const mergedActivities = [];

    activitiesMap.forEach((activityData, activityId) => {
        // Get unique hours and sort them
        let uniqueHours = [...new Set(activityData.slots.map(s => s.hour))].sort((a, b) => a - b);
        
        // Filter hours based on daylight requirement
        if (activityData.ideal_conditions?.daylight_only) {
            const beforeFilter = uniqueHours.length;
            uniqueHours = uniqueHours.filter(hour => hour >= sunriseHour && hour < sunsetHour);
            console.log(`[mergeActivityTimeSlots] ${activityData.name}: daylight_only, filtered ${beforeFilter} → ${uniqueHours.length} hours (sunrise: ${sunriseHour}h, sunset: ${sunsetHour}h)`);
        }
        
        if (uniqueHours.length === 0) {
            console.log(`[mergeActivityTimeSlots] ${activityData.name}: no valid hours, skipped`);
            return;
        }
        
        console.log(`[mergeActivityTimeSlots] ${activityData.name}: ${uniqueHours.length} hours (${uniqueHours.join(', ')}h)`);

        // Build continuous ranges (gaps > 3 hours create new ranges)
        const ranges = [];
        let rangeStart = uniqueHours[0];
        let rangeEnd = uniqueHours[0];
        
        for (let i = 1; i < uniqueHours.length; i++) {
            // If gap is more than 3 hours, start a new range
            if (uniqueHours[i] - rangeEnd > 3) {
                ranges.push({ start: rangeStart, end: rangeEnd });
                rangeStart = uniqueHours[i];
                rangeEnd = uniqueHours[i];
            } else {
                rangeEnd = uniqueHours[i];
            }
        }
        ranges.push({ start: rangeStart, end: rangeEnd });

        // Build time ranges with tide info
        const timeRanges = ranges.map(range => {
            // Calculate end hour, respecting daylight and 24h limit
            let endHour = range.end + 3;
            if (activityData.ideal_conditions?.daylight_only) {
                endHour = Math.min(endHour, sunsetHour);
            }
            endHour = Math.min(endHour, 24);
            
            // Get slots at start and end of this range
            const startSlot = activityData.slots.find(s => s.hour === range.start);
            const endSlot = activityData.slots.find(s => s.hour === range.end);
            
            // Calculate average wind for this range
            const rangeSlots = activityData.slots.filter(s => s.hour >= range.start && s.hour <= range.end);
            const avgWind = (rangeSlots.reduce((sum, s) => sum + (s.windKnots || 0), 0) / rangeSlots.length).toFixed(1);
            
            return {
                start: range.start,
                end: endHour,
                display: `${range.start}h-${endHour}h`,
                tideStart: startSlot?.tideEstimate?.toFixed(1) || '-',
                tideEnd: endSlot?.tideEstimate?.toFixed(1) || '-',
                avgWind: avgWind
            };
        });

        // Calculate overall average wind
        const validSlots = activityData.slots.filter(s => uniqueHours.includes(s.hour));
        const avgWind = (validSlots.reduce((sum, s) => sum + (s.windKnots || 0), 0) / validSlots.length).toFixed(1);

        mergedActivities.push({
            ...activityData,
            slots: undefined,
            timeRanges,
            avgWind
        });
    });

    return mergedActivities;
};

/**
 * Gets 5-day activity planning with time slots
 */
export const get5DayPlanning = async (profileId) => {
    try {
        const [activitiesData, forecastConditions, tideData] = await Promise.all([
            fetchActivitiesData(),
            fetchForecastConditions(),
            fetchTideData().catch(() => null)
        ]);

        const profile = getProfileById(activitiesData.profiles, profileId);
        
        console.log(`[get5DayPlanning] Looking for profile: ${profileId}`);
        console.log(`[get5DayPlanning] Available profiles: ${activitiesData.profiles.map(p => p.id).join(', ')}`);

        if (!profile) {
            throw new Error(`Profile ${profileId} not found`);
        }
        
        console.log(`[get5DayPlanning] Found profile: ${profile.name}`);

        // Filter activities suitable for this profile
        const profileActivities = activitiesData.activities.filter((activity) => 
            canProfileDoActivity(profile, activity)
        );
        
        console.log(`[get5DayPlanning] Profile: ${profile.name}, Activities suitable: ${profileActivities.length}/${activitiesData.activities.length}`);

        const planning = [];

        for (const dayForecast of forecastConditions.forecasts) {
            const daySlots = [];

            // Parse sunrise/sunset for this day
            const sunriseDate = dayForecast.sunrise ? new Date(dayForecast.sunrise) : null;
            const sunsetDate = dayForecast.sunset ? new Date(dayForecast.sunset) : null;

            // Get base date for this forecast day
            const baseDate = new Date(dayForecast.date);
            
            // Evaluate hour by hour (0h to 23h)
            for (let hour = 0; hour < 24; hour++) {
                const hourTime = new Date(baseDate);
                hourTime.setHours(hour, 0, 0, 0);
                
                // Check if this hour is during daylight
                const isDaylight = (!sunriseDate || !sunsetDate) ? true : 
                    (hourTime >= sunriseDate && hourTime < sunsetDate);
                
                // Find the corresponding 3-hour period for weather data
                const period = dayForecast.periods.find(p => {
                    const pTime = p.timestamp ? new Date(p.timestamp) : new Date(p.dateTime);
                    const pHour = pTime.getHours();
                    // Match if within 3-hour window
                    return hour >= pHour && hour < pHour + 3;
                }) || dayForecast.periods[0]; // Fallback to first period
                
                // Calculate actual tide height for this specific hour
                const tideInfo = await calculateTideHeightForDateTime(hourTime).catch(() => null);
                const estimatedTide = tideInfo?.height || tideData?.heightNow || 3;

                const conditions = {
                    windKnots: period.windSpeedKnots || 0,
                    windDirection: period.windDirectionCardinal,
                    tideHeight: estimatedTide,
                    tidePhase: tideInfo?.isRising ? "rising" : "falling",
                    swellHeight: null,
                    isRaining: period.precipitationProbability > 50,
                    isStorm: period.windSpeedKnots > 35,
                    isWet: period.precipitationProbability > 30,
                    visibility: null,
                    temperature: period.temperature,
                    isDaylight: isDaylight
                };

                const evaluatedActivities = evaluateAllActivities(
                    profileActivities, 
                    conditions, 
                    hourTime,
                    profile,
                    activitiesData.calendar || {}
                );

                daySlots.push({
                    time: hourTime.toISOString(),
                    hour: hour,
                    date: hourTime,
                    conditions: {
                        windKnots: period.windSpeedKnots,
                        windDirection: period.windDirectionCardinal,
                        temperature: period.temperature,
                        precipitationProbability: period.precipitationProbability,
                        tideEstimate: estimatedTide,
                        tideInfo: tideInfo
                    },
                    activities: evaluatedActivities.filter(a => a.evaluation.isValid),
                    allActivities: evaluatedActivities
                });
            }

            // Merge consecutive time slots for activities, respecting sunrise/sunset
            const mergedActivities = mergeActivityTimeSlots(
                daySlots, 
                dayForecast.sunrise, 
                dayForecast.sunset
            );

            planning.push({
                date: dayForecast.date,
                summary: {
                    temperatureMin: dayForecast.temperatureMin,
                    temperatureMax: dayForecast.temperatureMax,
                    windSpeedMaxKnots: dayForecast.windSpeedMaxKnots,
                    precipitationProbability: dayForecast.precipitationProbability,
                    sunrise: dayForecast.sunrise,
                    sunset: dayForecast.sunset
                },
                slots: daySlots,
                mergedActivities
            });
        }

        return {
            profile,
            planning,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error("Error getting 5-day planning:", error);
        throw error;
    }
};

/**
 * Gets full planning data for display
 */
export const getFullPlanningData = async (profileId) => {
    try {
        console.log("[PlannerService] getFullPlanningData called", { profileId });
        
        const [activitiesData, currentConditions, forecastConditions] = await Promise.all([
            fetchActivitiesData(),
            fetchCurrentConditions(),
            fetchForecastConditions().catch((error) => {
                console.error("[PlannerService] Forecast fetch failed:", error.message);
                return { location: null, forecasts: [] };
            })
        ]);

        console.log("[PlannerService] Data fetched", {
            profilesCount: activitiesData?.profiles?.length,
            activitiesCount: activitiesData?.activities?.length,
            equipmentCount: activitiesData?.equipment?.length
        });

        let profile = null;
        let recommendations = null;
        let planning5Day = null;
        
        // Use provided profileId or default to first profile
        const effectiveProfileId = profileId || (activitiesData.profiles?.[0]?.id);
        console.log("[PlannerService] effectiveProfileId:", effectiveProfileId);

        if (effectiveProfileId) {
            profile = getProfileById(activitiesData.profiles, effectiveProfileId);

            if (profile) {
                // Get immediate recommendations (next 3 hours)
                if (currentConditions.wind.speedKnots && currentConditions.tide) {
                    const conditions = prepareConditionsForEvaluation(currentConditions);
                    
                    const profileActivities = activitiesData.activities.filter((activity) => 
                        canProfileDoActivity(profile, activity)
                    );

                    const validActivities = filterActivities(
                        profileActivities, 
                        conditions,
                        new Date(),
                        profile,
                        activitiesData.calendar || {}
                    );
                    const recommendedGear = getRecommendedGear(
                        profile, 
                        activitiesData.equipment, 
                        conditions.windKnots
                    );
                    
                    // Add activity-specific recommended gear to each activity
                    const activitiesWithGear = validActivities.map(activity => {
                        // Filter gear to only include required gear for this activity
                        const activityGear = {
                            boards: [],
                            sails: [],
                            wings: [],
                            foils: [],
                            boats: [],
                            speedsails: []
                        };
                        
                        if (activity.required_gear && Array.isArray(activity.required_gear)) {
                            activity.required_gear.forEach(gearType => {
                                // Handle generic gear types (e.g., "wing", "board", "sail")
                                if (gearType === 'wing') {
                                    activityGear.wings.push(...(recommendedGear.wings || []));
                                } else if (gearType === 'board' || gearType === 'windsurf_board') {
                                    activityGear.boards.push(...(recommendedGear.boards || []));
                                } else if (gearType === 'sail' || gearType === 'windsurf_sail') {
                                    activityGear.sails.push(...(recommendedGear.sails || []));
                                } else if (gearType === 'foil') {
                                    activityGear.foils.push(...(recommendedGear.foils || []));
                                } else if (gearType === 'boat') {
                                    activityGear.boats.push(...(recommendedGear.boats || []));
                                } else if (gearType === 'speedsail') {
                                    activityGear.speedsails.push(...(recommendedGear.speedsails || []));
                                } else {
                                    // Handle specific gear IDs
                                    const findGearInCategory = (category) => {
                                        return recommendedGear[category]?.find(g => g.id === gearType);
                                    };
                                    
                                    const gear = findGearInCategory('boards') || 
                                               findGearInCategory('sails') ||
                                               findGearInCategory('wings') ||
                                               findGearInCategory('foils') ||
                                               findGearInCategory('boats') ||
                                               findGearInCategory('speedsails');
                                    
                                    if (gear) {
                                        // Use gear.type for accurate categorization
                                        if (['windsurf_board', 'wing_board', 'sup_board', 'board'].includes(gear.type)) {
                                            activityGear.boards.push(gear);
                                        } else if (['windsurf_sail', 'sail'].includes(gear.type)) {
                                            activityGear.sails.push(gear);
                                        } else if (['wing'].includes(gear.type)) {
                                            activityGear.wings.push(gear);
                                        } else if (['foil'].includes(gear.type)) {
                                            activityGear.foils.push(gear);
                                        } else if (['sailboat', 'boat'].includes(gear.type)) {
                                            activityGear.boats.push(gear);
                                        } else if (['speedsail'].includes(gear.type)) {
                                            activityGear.speedsails.push(gear);
                                        }
                                    }
                                }
                            });
                        }
                        
                        const hasGear = Object.values(activityGear).some(arr => arr.length > 0);

                        return {
                            ...activity,
                            gearMatches: hasGear ? activityGear : null
                        };
                    });

                    recommendations = {
                        activities: activitiesWithGear,
                        recommendedGear
                    };
                }

                // Get 5-day planning
                planning5Day = await get5DayPlanning(effectiveProfileId).catch((error) => {
                    console.error("[PlannerService] 5-day planning failed:", error.message);
                    return null;
                });
            }
        }

        // Transform profiles to sailors format for UI compatibility
        const sailors = transformProfilesToSailors(activitiesData.profiles, activitiesData.equipment);

        return {
            profile,
            profiles: activitiesData.profiles,
            sailors: sailors,
            currentConditions,
            forecast: forecastConditions,
            recommendations,
            planning5Day,
            allActivities: activitiesData.activities,
            allEquipment: activitiesData.equipment,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error("Error getting full planning data:", error);
        throw error;
    }
};

/**
 * Legacy support - gets recommendations using profile name
 */
export const getRecommendations = async (profileName, currentConditions) => {
    try {
        const activitiesData = await fetchActivitiesData();
        const profile = getProfileByName(activitiesData.profiles, profileName);

        if (!profile) {
            throw new Error(`Profile ${profileName} not found`);
        }

        if (!currentConditions.wind.speedKnots || !currentConditions.tide) {
            return {
                profile,
                currentConditions,
                activities: [],
                recommendedGear: null,
                message: "Insufficient weather or tide data"
            };
        }

        const conditions = prepareConditionsForEvaluation(currentConditions);

        const profileActivities = activitiesData.activities.filter((activity) => 
            canProfileDoActivity(profile, activity)
        );

        const validActivities = filterActivities(
            profileActivities, 
            conditions,
            new Date(),
            profile,
            activitiesData.calendar || {}
        );
        const recommendedGear = getRecommendedGear(
            profile, 
            activitiesData.equipment, 
            conditions.windKnots
        );

        return {
            profile,
            currentConditions,
            activities: validActivities,
            recommendedGear
        };
    } catch (error) {
        console.error("Error getting recommendations:", error);
        throw error;
    }
};