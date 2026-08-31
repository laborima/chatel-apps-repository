/**
 * Planner Service
 * Coordinates weather, tide, and activity services to provide recommendations
 * Includes merged activities management logic
 */

import { scrapeMeteoLaRochelle } from "./meteoService";
import { fetchFiveDayForecast } from "./forecastWeatherService";
import { fetchTideData, interpolateTideHeight } from "./tideService";
import { kmhToKnots, degreeToDirection, WIND_DIRECTIONS } from "./utils";
import { getLocation, loadActivitiesData } from "./configService";
import { getVesselPosition } from "./signalkService";

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
 * Checks if a direction falls inside any of the given sectors (+/-22.5 degrees).
 * Used for hard exclusions, e.g. an offshore wind that would blow a paddler out.
 */
const isDirectionInSectors = (currentDirection, sectors) => {
    const currentDeg = normalizeDirection(currentDirection);
    if (currentDeg === null || !sectors || sectors.length === 0) {
        return false;
    }

    return sectors.some((sector) => {
        const sectorDeg = normalizeDirection(sector);
        if (sectorDeg === null) {
            return false;
        }
        const diff = Math.abs(currentDeg - sectorDeg) % 360;
        const wrapped = Math.min(diff, 360 - diff);
        return wrapped <= 22.5;
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
 * Checks if a date falls within school holidays.
 *
 * Scans every school-year entry in the calendar. The previous implementation
 * only looked at a hard-coded "2024_2025" key, so the check silently returned
 * false for every date once that school year was over.
 */
const isSchoolHoliday = (date, schoolHolidaysConfig = {}) => {
    if (!schoolHolidaysConfig) {
        return false;
    }

    const dateStr = date.toISOString().split('T')[0];

    return Object.entries(schoolHolidaysConfig).some(([key, periods]) => {
        // Skip metadata entries such as "zone" and "description".
        if (!/^\d{4}_\d{4}$/.test(key) || !Array.isArray(periods)) {
            return false;
        }
        return periods.some((period) => dateStr >= period.start && dateStr <= period.end);
    });
};

/**
 * Evaluates one availability rule for a given hour.
 *
 * A rule is one of:
 *   "available"        - all day
 *   "unavailable"      - never
 *   "18:00-23:00"      - between those hours
 *   "18:00-sunset"     - from that hour until the sun goes down
 *
 * @param {string|undefined} rule
 * @param {number} hours - hour of day, 0-23
 * @param {{sunset?: Date|string, isDaylight?: boolean}} context
 * @returns {boolean} true when the profile is free at that hour
 */
const matchesAvailabilityRule = (rule, hours, context = {}) => {
    if (rule === undefined || rule === null || rule === 'available') {
        return true;
    }
    if (rule === 'unavailable') {
        return false;
    }
    if (typeof rule !== 'string') {
        return true;
    }

    const [startStr, endStr] = rule.split('-');
    const startHour = Number(startStr?.split(':')[0]);
    if (!Number.isFinite(startHour) || hours < startHour) {
        return false;
    }

    // "sunset" as the upper bound: the session has to be over by nightfall.
    if (endStr?.trim().toLowerCase() === 'sunset') {
        if (context.sunset) {
            const sunsetDate = new Date(context.sunset);
            if (Number.isFinite(sunsetDate.getTime())) {
                // The slot at hour H covers H..H+1, so it must start before sunset.
                return hours < sunsetDate.getHours() ||
                    (hours === sunsetDate.getHours() && sunsetDate.getMinutes() > 0);
            }
        }
        // No sunset time available: fall back to the daylight flag when we have it.
        return context.isDaylight !== false;
    }

    const endHour = Number(endStr?.split(':')[0]);
    if (!Number.isFinite(endHour)) {
        return true;
    }
    return hours < endHour;
};

/**
 * Checks if profile is available at given time based on non_working_hours.
 * non_working_hours represents the time slots when activities are POSSIBLE.
 *
 * Exactly one rule applies. Days off come first — a weekend or a public holiday
 * is free whatever else is going on — then school holidays, then ordinary
 * weekdays.
 */
const isProfileAvailable = (profile, currentTime = new Date(), calendarData = {}, context = {}) => {
    if (!profile || !profile.availability || !profile.availability.non_working_hours) {
        return true; // No restrictions if not defined
    }

    const nwh = profile.availability.non_working_hours;
    const day = currentTime.getDay();
    const hours = currentTime.getHours();
    const isWeekend = day === 0 || day === 6;

    const dateIsFrenchHoliday = Boolean(calendarData.french_holidays) &&
        isFrenchHoliday(currentTime, calendarData.french_holidays);

    // "school_holidays" is the canonical key; the older config called it
    // "school_holidays_zone_b" (and mislabelled the zone).
    const schoolHolidaysConfig = calendarData.school_holidays || calendarData.school_holidays_zone_b;
    const dateIsSchoolHoliday = Boolean(schoolHolidaysConfig) &&
        isSchoolHoliday(currentTime, schoolHolidaysConfig);
    const schoolHolidaysRule = nwh.school_holidays ?? nwh.school_holidays_zone_b;

    let rule;
    if (isWeekend) {
        rule = nwh.weekends;
    } else if (dateIsFrenchHoliday && nwh.holidays !== undefined) {
        rule = nwh.holidays;
    } else if (dateIsSchoolHoliday && schoolHolidaysRule !== undefined) {
        rule = schoolHolidaysRule;
    } else if (dateIsFrenchHoliday || dateIsSchoolHoliday) {
        // A day off with no rule of its own: treat it like a weekend.
        rule = nwh.weekends;
    } else {
        rule = nwh.weekdays;
    }

    return matchesAvailabilityRule(rule, hours, context);
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

// --- Session scoring tuning -------------------------------------------------

/** Tide margin below which the window is about to close (metres). */
const TIDE_COMFORT_MARGIN_M = 0.4;

/** Gust/average ratio above which the wind starts to feel gusty. */
const GUST_FACTOR_COMFORTABLE = 1.35;

/** Maximum points removed for gustiness. */
const GUST_WEIGHT = 15;

/** Maximum points removed for a wind that is inside the band but not ideal. */
const WIND_FIT_WEIGHT = 25;

/**
 * How well the wind speed fits the activity, as a 0..1 score.
 *
 * 1 at the sweet spot, tapering towards the edges of the acceptable band. The
 * sweet spot is `wind_ideal` when the activity declares one, otherwise the
 * upper-middle of the range, which is where most board sports actually plane.
 *
 * @returns {number|null} null when the activity declares no wind preference
 */
const scoreWindFit = (windKnots, ideal_conditions) => {
    if (!Number.isFinite(windKnots)) {
        return null;
    }

    let min = ideal_conditions.wind_min;
    let max = ideal_conditions.wind_max;
    if (Array.isArray(ideal_conditions.wind_range)) {
        [min, max] = ideal_conditions.wind_range;
    }

    if (!Number.isFinite(min) && !Number.isFinite(max)) {
        return null;
    }

    // Open-ended band: any wind past the threshold is equally fine.
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        return 1;
    }

    const ideal = Number.isFinite(ideal_conditions.wind_ideal)
        ? ideal_conditions.wind_ideal
        : min + ((max - min) * 0.6);

    const spread = Math.max(ideal - min, max - ideal);
    if (spread <= 0) {
        return 1;
    }

    const distance = Math.abs(windKnots - ideal) / spread;
    return Math.max(0, 1 - (distance * distance));
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

    // Check profile availability (non-working hours, holidays, school holidays).
    // The sunset is passed through so a rule like "18:00-sunset" can be evaluated.
    const availabilityContext = { sunset: conditions.sunset, isDaylight: conditions.isDaylight };
    if (profile && !isProfileAvailable(profile, currentTime, calendarData, availabilityContext)) {
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

    // Check tide window. A null height means the tide forecast is unavailable:
    // warn rather than silently treating it as a very low tide.
    const hasTideHeight = Number.isFinite(conditions.tideHeight);
    const needsTide = ideal_conditions.tide_min !== undefined || ideal_conditions.tide_max !== undefined;

    if (needsTide && !hasTideHeight) {
        result.score -= 10;
        result.warnings.push("Tide height unknown - window not verified");
    }

    if (hasTideHeight) {
        if (ideal_conditions.tide_min !== undefined && conditions.tideHeight < ideal_conditions.tide_min) {
            result.isValid = false;
            result.reasons.push(`Tide too low (${conditions.tideHeight.toFixed(2)}m < ${ideal_conditions.tide_min}m)`);
            result.score -= 50;
        }

        if (ideal_conditions.tide_max !== undefined && conditions.tideHeight > ideal_conditions.tide_max) {
            result.isValid = false;
            result.reasons.push(`Tide too high (${conditions.tideHeight.toFixed(2)}m > ${ideal_conditions.tide_max}m)`);
            result.score -= 50;
        }

        // Sitting right on the edge of the window means it closes within minutes:
        // the tide moves fastest mid-cycle, up to ~1m per hour here at springs.
        if (result.isValid && needsTide) {
            const margin = Math.min(
                ideal_conditions.tide_min !== undefined ? conditions.tideHeight - ideal_conditions.tide_min : Infinity,
                ideal_conditions.tide_max !== undefined ? ideal_conditions.tide_max - conditions.tideHeight : Infinity
            );
            if (margin < TIDE_COMFORT_MARGIN_M) {
                const penalty = Math.round((1 - (margin / TIDE_COMFORT_MARGIN_M)) * 12);
                result.score -= penalty;
                result.warnings.push(`Close to the tide limit (${margin.toFixed(2)}m of margin)`);
            }
        }
    }

    // Forbidden wind sectors - a hard exclusion, not a preference.
    if (ideal_conditions.wind_direction_forbidden && conditions.windDirection &&
        isDirectionInSectors(conditions.windDirection, ideal_conditions.wind_direction_forbidden)) {
        result.isValid = false;
        result.reasons.push(`Wind from a forbidden sector (${conditions.windDirection})`);
        result.score -= 100;
    }

    // Tidal coefficient window - a hard gate (spring tides required, or excluded).
    if (ideal_conditions.coefficient_min !== undefined ||
        ideal_conditions.coefficient_max !== undefined) {
        if (!Number.isFinite(conditions.tideCoefficient)) {
            result.score -= 10;
            result.warnings.push("Tidal coefficient unknown - not verified");
        } else {
            if (ideal_conditions.coefficient_min !== undefined &&
                conditions.tideCoefficient < ideal_conditions.coefficient_min) {
                result.isValid = false;
                result.reasons.push(`Tidal coefficient too low (${conditions.tideCoefficient} < ${ideal_conditions.coefficient_min})`);
                result.score -= 50;
            }
            if (ideal_conditions.coefficient_max !== undefined &&
                conditions.tideCoefficient > ideal_conditions.coefficient_max) {
                result.isValid = false;
                result.reasons.push(`Tidal coefficient too high (${conditions.tideCoefficient} > ${ideal_conditions.coefficient_max})`);
                result.score -= 50;
            }
        }
    }

    // Window around a tide extreme, e.g. "1h either side of low water".
    if (ideal_conditions.tide_window) {
        const { around, hours_before: hoursBefore = 1, hours_after: hoursAfter = 1 } = ideal_conditions.tide_window;
        const offset = around === "high" ? conditions.minutesFromHighTide : conditions.minutesFromLowTide;

        if (!Number.isFinite(offset)) {
            result.score -= 10;
            result.warnings.push("Tide times unknown - window not verified");
        } else if (offset < -(hoursBefore * 60) || offset > hoursAfter * 60) {
            result.isValid = false;
            const label = around === "high" ? "high water" : "low water";
            const hours = (Math.abs(offset) / 60).toFixed(1);
            result.reasons.push(`Outside the ${label} window (${hours}h away)`);
            result.score -= 50;
        } else {
            // Best right at the extreme, tapering towards the edges of the window.
            const span = offset < 0 ? hoursBefore * 60 : hoursAfter * 60;
            if (span > 0) {
                const distance = Math.abs(offset) / span;
                result.score -= Math.round(distance * distance * 10);
            }
        }
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

    // Grade how well the wind sits inside the acceptable band. Without this every
    // slot that merely passes the gates scores the same, and the planner cannot
    // tell a marginal 15-knot slot from an ideal 20-knot one.
    if (result.isValid) {
        const windFit = scoreWindFit(windKnots, ideal_conditions);
        if (windFit !== null) {
            result.score -= Math.round((1 - windFit) * WIND_FIT_WEIGHT);
        }
    }

    // Gusty wind is exhausting and dangerous on a wing or a sail, even when the
    // average speed is perfect.
    if (Number.isFinite(conditions.windGustKnots) && windKnots > 0) {
        const gustFactor = conditions.windGustKnots / windKnots;
        if (gustFactor > GUST_FACTOR_COMFORTABLE) {
            const excess = Math.min(1, (gustFactor - GUST_FACTOR_COMFORTABLE) / GUST_FACTOR_COMFORTABLE);
            result.score -= Math.round(excess * GUST_WEIGHT);
            result.warnings.push(`Gusty conditions (gusts ${conditions.windGustKnots.toFixed(0)} kn for ${windKnots.toFixed(0)} kn average)`);
        }
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
    if (ideal_conditions.tide_phase && conditions.tidePhase !== "unknown" &&
        conditions.tidePhase !== ideal_conditions.tide_phase) {
        result.score -= 5;
        result.warnings.push(`Tide phase not optimal (prefer ${ideal_conditions.tide_phase} tide)`);
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
                degrees: meteoData?.parsed?.directionDegrees || null,
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
                extremes: tideData.extremes || [],
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
 * @param {object} currentConditions - Current weather/tide conditions
 * @param {object} todayForecast - Today's forecast with sunrise/sunset (optional)
 */
const prepareConditionsForEvaluation = (currentConditions, todayForecast = null) => {
    let currentIsDaylight = isDaylight();
    if (todayForecast?.sunrise && todayForecast?.sunset) {
        const now = new Date();
        const sunrise = new Date(todayForecast.sunrise);
        const sunset = new Date(todayForecast.sunset);
        currentIsDaylight = now >= sunrise && now <= sunset;
    }

    return {
        windKnots: currentConditions.wind.speedKnots || 0,
        windDirection: currentConditions.wind.direction,
        tideHeight: currentConditions.tide?.heightNow || 0,
        tidePhase: currentConditions.tide?.phase || "unknown",
        tideCoefficient: currentConditions.tide?.coefficient ?? null,
        minutesFromLowTide: minutesFromNearestExtreme(new Date(), currentConditions.tide, "Low"),
        minutesFromHighTide: minutesFromNearestExtreme(new Date(), currentConditions.tide, "High"),
        swellHeight: null,
        isRaining: false,
        isStorm: false,
        isWet: false,
        visibility: null,
        temperature: null,
        isDaylight: currentIsDaylight,
        sunset: todayForecast?.sunset ?? null
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
                tideEstimate: slot.conditions?.tideEstimate,
                score: activity.evaluation?.score ?? null
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
            uniqueHours = uniqueHours.filter(hour => hour >= sunriseHour && hour < sunsetHour);
        }
        
        if (uniqueHours.length === 0) {
            return;
        }

        // Build continuous ranges. Slots are hourly, so any missing hour is an hour
        // whose conditions failed: it genuinely breaks the window and must not be
        // merged over.
        const ranges = [];
        let rangeStart = uniqueHours[0];
        let rangeEnd = uniqueHours[0];

        for (let i = 1; i < uniqueHours.length; i++) {
            if (uniqueHours[i] - rangeEnd > 1) {
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
            // The slot at hour H covers H..H+1, so the window ends one hour after
            // the last suitable slot.
            let endHour = range.end + 1;
            if (activityData.ideal_conditions?.daylight_only) {
                endHour = Math.min(endHour, sunsetHour);
            }
            endHour = Math.min(endHour, 24);

            // Get slots at start and end of this range
            const startSlot = activityData.slots.find(s => s.hour === range.start);
            const endSlot = activityData.slots.find(s => s.hour === range.end);

            const rangeSlots = activityData.slots.filter(s => s.hour >= range.start && s.hour <= range.end);
            const avgWind = (rangeSlots.reduce((sum, s) => sum + (s.windKnots || 0), 0) / rangeSlots.length).toFixed(1);
            const avgScore = rangeSlots.length
                ? Math.round(rangeSlots.reduce((sum, s) => sum + (s.score ?? 0), 0) / rangeSlots.length)
                : 0;

            return {
                start: range.start,
                end: endHour,
                durationMinutes: Math.max(0, endHour - range.start) * 60,
                display: `${range.start}h-${endHour}h`,
                tideStart: startSlot?.tideEstimate?.toFixed(1) || '-',
                tideEnd: endSlot?.tideEstimate?.toFixed(1) || '-',
                avgWind: avgWind,
                score: avgScore
            };
        })
            // A window shorter than the session itself is not a session. Rigging,
            // launching and coming back in do not fit in a leftover half hour.
            .filter(range => range.durationMinutes >= (activityData.duration_min || 0));

        if (timeRanges.length === 0) {
            return;
        }

        // Overall average wind, over the hours that actually made it into a window
        const keptHours = new Set(
            timeRanges.flatMap(range => {
                const hours = [];
                for (let h = range.start; h < range.end; h += 1) hours.push(h);
                return hours;
            })
        );
        const validSlots = activityData.slots.filter(s => keptHours.has(s.hour));
        const avgWind = validSlots.length
            ? (validSlots.reduce((sum, s) => sum + (s.windKnots || 0), 0) / validSlots.length).toFixed(1)
            : '0.0';

        // Best window of the day drives how the activity is ranked for that day.
        const bestScore = timeRanges.reduce((best, range) => Math.max(best, range.score), 0);

        mergedActivities.push({
            ...activityData,
            slots: undefined,
            timeRanges,
            avgWind,
            bestScore
        });
    });

    return mergedActivities.sort((a, b) => (b.bestScore ?? 0) - (a.bestScore ?? 0));
};

/**
 * Estimate tide height at a specific time.
 *
 * When the tides plugin exposes its full extremes list (the usual case), the
 * height is interpolated harmonically between the two surrounding extremes. That
 * follows the real spring/neap amplitude cycle, which matters here: the range at
 * Chatelaillon swings between roughly 3m at neaps and 5m at springs within the
 * same month.
 *
 * Only when no extremes list is available do we fall back to projecting the
 * single known half-cycle forward, which is accurate for a few hours at best.
 */
const estimateTideHeightAt = (targetTime, tideData) => {
    if (!tideData) {
        return null;
    }

    if (Array.isArray(tideData.extremes) && tideData.extremes.length >= 2) {
        const interpolated = interpolateTideHeight(tideData.extremes, targetTime);
        if (interpolated !== null) {
            return interpolated;
        }
    }

    return projectTideHeightFromHalfCycle(targetTime, tideData);
};

/**
 * Fallback tide estimate: repeat the known half-cycle to project alternating
 * extrema. Amplitude and period are frozen, so this drifts within a day or two.
 */
const projectTideHeightFromHalfCycle = (targetTime, tideData) => {
    if (!tideData || !tideData.timeHigh || !tideData.timeLow ||
        tideData.heightHigh === null || tideData.heightLow === null) {
        return tideData?.heightNow ?? null;
    }

    const targetMs = new Date(targetTime).getTime();
    const highMs = new Date(tideData.timeHigh).getTime();
    const lowMs = new Date(tideData.timeLow).getTime();

    const highHeight = Number(tideData.heightHigh);
    const lowHeight = Number(tideData.heightLow);

    if (!Number.isFinite(targetMs) || !Number.isFinite(highMs) || !Number.isFinite(lowMs) ||
        !Number.isFinite(highHeight) || !Number.isFinite(lowHeight)) {
        return tideData?.heightNow ?? null;
    }

    const firstExtremumMs = Math.min(highMs, lowMs);
    const secondExtremumMs = Math.max(highMs, lowMs);
    const halfCycleDuration = secondExtremumMs - firstExtremumMs;

    if (halfCycleDuration <= 0) {
        return tideData.heightNow ?? null;
    }

    const firstExtremumHeight = firstExtremumMs === highMs ? highHeight : lowHeight;
    const secondExtremumHeight = secondExtremumMs === highMs ? highHeight : lowHeight;

    const halfCycleIndex = Math.floor((targetMs - firstExtremumMs) / halfCycleDuration);
    const startMs = firstExtremumMs + (halfCycleIndex * halfCycleDuration);
    const startHeight = halfCycleIndex % 2 === 0 ? firstExtremumHeight : secondExtremumHeight;
    const endHeight = halfCycleIndex % 2 === 0 ? secondExtremumHeight : firstExtremumHeight;

    const progress = Math.min(1, Math.max(0, (targetMs - startMs) / halfCycleDuration));
    const sinProgress = (1 - Math.cos(progress * Math.PI)) / 2;

    return parseFloat((startHeight + ((endHeight - startHeight) * sinProgress)).toFixed(2));
};

/**
 * Tide phase ("rising" / "falling") at a given time.
 *
 * Derived from the next extreme in the full list when available. The previous
 * implementation compared the single next high against the single next low, so
 * it returned one constant phase for the entire 5-day planning.
 */
const estimateTidePhaseAt = (targetTime, tideData) => {
    const targetMs = new Date(targetTime).getTime();

    if (Array.isArray(tideData?.extremes) && tideData.extremes.length > 0) {
        const next = tideData.extremes
            .slice()
            .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
            .find((e) => new Date(e.time).getTime() >= targetMs);
        if (next) {
            return next.type === "High" ? "rising" : "falling";
        }
    }

    if (tideData?.timeHigh && tideData?.timeLow) {
        return new Date(tideData.timeHigh) < new Date(tideData.timeLow) ? "rising" : "falling";
    }

    return "unknown";
};

/**
 * Signed offset, in minutes, from the nearest tide extreme of the given type.
 * Negative before the extreme, positive after.
 *
 * Lets an activity be tied to a moment in the cycle ("1h either side of low
 * water") rather than to a height, which is what actually matters for foreshore
 * fishing: the same height happens twice a cycle, but only one of them is the
 * ebb that uncovers the flats.
 */
const minutesFromNearestExtreme = (targetTime, tideData, type) => {
    const targetMs = new Date(targetTime).getTime();
    const extremes = (tideData?.extremes || []).filter((e) => e.type === type);

    if (extremes.length === 0 || !Number.isFinite(targetMs)) {
        return null;
    }

    const nearest = extremes.reduce((closest, extreme) => {
        const distance = Math.abs(new Date(extreme.time).getTime() - targetMs);
        const closestDistance = Math.abs(new Date(closest.time).getTime() - targetMs);
        return distance < closestDistance ? extreme : closest;
    });

    return (targetMs - new Date(nearest.time).getTime()) / 60000;
};

/**
 * Tidal coefficient in force at a given time (French scale, 20-120).
 *
 * The coefficient is attached to high waters; the one that applies to a moment is
 * the one of the nearest high water. It drives the tidal range and therefore the
 * strength of the current, which matters for wingfoil and windsurf sessions.
 */
const estimateTideCoefficientAt = (targetTime, tideData) => {
    const targetMs = new Date(targetTime).getTime();
    const highs = (tideData?.extremes || []).filter(
        (e) => e.type === "High" && Number.isFinite(e.coefficient)
    );

    if (highs.length === 0) {
        return tideData?.coeffNow ?? null;
    }

    return highs.reduce((closest, high) => {
        const distance = Math.abs(new Date(high.time).getTime() - targetMs);
        const closestDistance = Math.abs(new Date(closest.time).getTime() - targetMs);
        return distance < closestDistance ? high : closest;
    }).coefficient;
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

        if (!profile) {
            throw new Error(`Profile ${profileId} not found`);
        }

        // Filter activities suitable for this profile
        const profileActivities = activitiesData.activities.filter((activity) => 
            canProfileDoActivity(profile, activity)
        );

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
                const isHourDuringDaylight = (!sunriseDate || !sunsetDate) ? true : 
                    (hourTime >= sunriseDate && hourTime < sunsetDate);
                
                // Find the corresponding 3-hour period for weather data
                const period = dayForecast.periods.find(p => {
                    const pTime = p.timestamp ? new Date(p.timestamp) : new Date(p.dateTime);
                    const pHour = pTime.getHours();
                    // Match if within 3-hour window
                    return hour >= pHour && hour < pHour + 3;
                }) || dayForecast.periods[0]; // Fallback to first period
                
                // Tide height, phase and coefficient for this specific hour
                const estimatedTide = estimateTideHeightAt(hourTime, tideData);
                const hourTidePhase = estimateTidePhaseAt(hourTime, tideData);
                const hourTideCoefficient = estimateTideCoefficientAt(hourTime, tideData);
                const minutesFromLowTide = minutesFromNearestExtreme(hourTime, tideData, "Low");
                const minutesFromHighTide = minutesFromNearestExtreme(hourTime, tideData, "High");

                const conditions = {
                    windKnots: period.windSpeedKnots || 0,
                    windGustKnots: period.windGustKnots ?? null,
                    windDirection: period.windDirectionCardinal,
                    tideHeight: estimatedTide,
                    tidePhase: hourTidePhase,
                    tideCoefficient: hourTideCoefficient,
                    minutesFromLowTide,
                    minutesFromHighTide,
                    swellHeight: null,
                    isRaining: period.precipitationProbability > 50,
                    isStorm: period.windSpeedKnots > 35,
                    isWet: period.precipitationProbability > 30,
                    visibility: null,
                    temperature: period.temperature,
                    isDaylight: isHourDuringDaylight,
                    sunset: dayForecast.sunset ?? null
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
                        windGustKnots: period.windGustKnots ?? null,
                        windDirection: period.windDirectionCardinal,
                        temperature: period.temperature,
                        precipitationProbability: period.precipitationProbability,
                        tideEstimate: estimatedTide,
                        tidePhase: hourTidePhase,
                        tideCoefficient: hourTideCoefficient
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
        const [activitiesData, currentConditions, forecastConditions, vesselPosition] = await Promise.all([
            fetchActivitiesData(),
            fetchCurrentConditions(),
            fetchForecastConditions().catch((error) => {
                console.error("[PlannerService] Forecast fetch failed:", error.message);
                return { location: null, forecasts: [] };
            }),
            getVesselPosition().catch((error) => {
                console.warn("[PlannerService] Vessel position fetch failed:", error.message);
                return null;
            })
        ]);

        let profile = null;
        let recommendations = null;
        let planning5Day = null;
        
        // Use provided profileId or default to first profile
        const effectiveProfileId = profileId || (activitiesData.profiles?.[0]?.id);

        if (effectiveProfileId) {
            profile = getProfileById(activitiesData.profiles, effectiveProfileId);

            if (profile) {
                // Get immediate recommendations (next 3 hours)
                if (currentConditions.wind.speedKnots && currentConditions.tide) {
                    const todayForecast = forecastConditions?.forecasts?.[0] || null;
                    const conditions = prepareConditionsForEvaluation(currentConditions, todayForecast);
                    
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
            vesselPosition,
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