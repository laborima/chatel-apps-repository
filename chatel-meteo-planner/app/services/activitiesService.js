/**
 * Activities Service
 * Manages activity filtering based on weather conditions, tides, and sailor preferences
 */

import { WIND_DIRECTIONS, kmhToKnots, msToKnots } from "./utils";
import { loadActivitiesData } from "./configService";

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

    // Check weekday non-working hours (e.g., "00:00-18:00" means unavailable before 18h)
    if (!isWeekend && !dateIsFrenchHoliday && !dateIsSchoolHoliday && nwh.weekdays) {
        const [startStr, endStr] = nwh.weekdays.split('-');
        const [startHour] = startStr.split(':').map(Number);
        const [endHour] = endStr.split(':').map(Number);
        
        if (hours >= startHour && hours < endHour) {
            return false; // Within non-working hours
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
 * @deprecated Use loadActivitiesData from configService instead
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