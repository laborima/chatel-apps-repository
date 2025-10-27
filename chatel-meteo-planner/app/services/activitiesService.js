/**
 * Activities Service
 * Manages activity filtering based on weather conditions, tides, and sailor preferences
 */

const WIND_DIRECTIONS = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
    E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSO: 202.5, SO: 225, OSO: 247.5,
    O: 270, ONO: 292.5, NO: 315, NNO: 337.5
};

/**
 * Converts km/h to knots
 */
const kmhToKnots = (kmh) => {
    return kmh * 0.539957;
};

/**
 * Converts m/s to knots
 */
const msToKnots = (ms) => {
    return ms * 1.94384;
};

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
 * Checks if a direction is within preferred directions
 */
const isDirectionPreferred = (currentDirection, preferredDirections, idealDirection) => {
    const currentDeg = normalizeDirection(currentDirection);
    if (currentDeg === null) {
        return false;
    }

    const idealDeg = normalizeDirection(idealDirection);
    if (idealDeg !== null && Math.abs(currentDeg - idealDeg) <= 22.5) {
        return true;
    }

    return preferredDirections.some((preferred) => {
        const preferredDeg = normalizeDirection(preferred);
        if (preferredDeg === null) {
            return false;
        }
        return Math.abs(currentDeg - preferredDeg) <= 22.5;
    });
};

/**
 * Checks if current time matches activity constraints
 */
const matchesTimeConstraints = (timeConstraints, currentTime = new Date()) => {
    if (!timeConstraints) {
        return true;
    }

    const day = currentTime.getDay();
    const hours = currentTime.getHours();
    const isWeekend = day === 0 || day === 6;

    if (timeConstraints.weekendOnly && !isWeekend) {
        return false;
    }

    if (timeConstraints.after18h && hours < 18) {
        return false;
    }

    if (timeConstraints.daylightOnly) {
        if (hours < 7 || hours > 21) {
            return false;
        }
    }

    return true;
};

/**
 * Evaluates if an activity is feasible given current conditions
 */
export const evaluateActivity = (activity, conditions, currentTime = new Date()) => {
    const { conditions: activityConditions, preferredDirections, idealDirection, timeConstraints } = activity;

    const result = {
        isValid: true,
        score: 100,
        reasons: []
    };

    if (!matchesTimeConstraints(timeConstraints, currentTime)) {
        result.isValid = false;
        result.reasons.push("Time constraints not met");
        result.score -= 100;
    }

    if (activityConditions.tideMinMeters !== undefined && conditions.tideHeight < activityConditions.tideMinMeters) {
        result.isValid = false;
        result.reasons.push(`Tide too low (${conditions.tideHeight.toFixed(2)}m < ${activityConditions.tideMinMeters}m)`);
        result.score -= 50;
    }

    if (activityConditions.tideMaxMeters !== undefined && conditions.tideHeight > activityConditions.tideMaxMeters) {
        result.isValid = false;
        result.reasons.push(`Tide too high (${conditions.tideHeight.toFixed(2)}m > ${activityConditions.tideMaxMeters}m)`);
        result.score -= 50;
    }

    const windKnots = conditions.windKnots;
    if (activityConditions.windMinKnots !== undefined && windKnots < activityConditions.windMinKnots) {
        result.isValid = false;
        result.reasons.push(`Wind too low (${windKnots.toFixed(1)} knots < ${activityConditions.windMinKnots} knots)`);
        result.score -= 40;
    }

    if (activityConditions.windMaxKnots !== undefined && windKnots > activityConditions.windMaxKnots) {
        result.isValid = false;
        result.reasons.push(`Wind too high (${windKnots.toFixed(1)} knots > ${activityConditions.windMaxKnots} knots)`);
        result.score -= 40;
    }

    if (activityConditions.swellMaxMeters !== null && conditions.swellHeight && conditions.swellHeight > activityConditions.swellMaxMeters) {
        result.isValid = false;
        result.reasons.push(`Swell too high (${conditions.swellHeight}m > ${activityConditions.swellMaxMeters}m)`);
        result.score -= 30;
    }

    if (!activityConditions.allowRain && conditions.isRaining) {
        result.isValid = false;
        result.reasons.push("Rain is not allowed for this activity");
        result.score -= 20;
    }

    if (preferredDirections && conditions.windDirection) {
        if (!isDirectionPreferred(conditions.windDirection, preferredDirections, idealDirection)) {
            result.score -= 15;
            result.reasons.push("Wind direction is not ideal");
        } else {
            result.score += 10;
        }
    }

    result.score = Math.max(0, result.score);
    return result;
};

/**
 * Filters activities that match current conditions
 */
export const filterActivities = (activities, conditions, currentTime = new Date()) => {
    return activities
        .map((activity) => ({
            ...activity,
            evaluation: evaluateActivity(activity, conditions, currentTime)
        }))
        .filter((activity) => activity.evaluation.isValid)
        .sort((a, b) => b.evaluation.score - a.evaluation.score);
};

/**
 * Gets recommended gear for a sailor based on wind conditions
 */
export const getRecommendedGear = (sailor, windKnots) => {
    const recommended = {
        boards: [],
        sails: [],
        wings: [],
        speedsails: []
    };

    if (!sailor || !sailor.windRanges) {
        return recommended;
    }

    for (const [gearName, range] of Object.entries(sailor.windRanges)) {
        if (windKnots >= range.minKnots && windKnots <= range.maxKnots) {
            if (gearName.includes("Wing") || gearName.includes("Strike") || gearName.includes("Unit") || gearName.includes("Mantis")) {
                recommended.wings.push({ name: gearName, ...range });
            } else if (gearName.includes("Speedster") || gearName.includes("TR-XI")) {
                recommended.speedsails.push({ name: gearName, ...range });
            } else if (gearName.toLowerCase().includes("sail") || gearName.includes("Pryde") || gearName.includes("Duotone") || gearName.includes("North") || gearName.includes("Severne")) {
                recommended.sails.push({ name: gearName, ...range });
            } else {
                recommended.boards.push({ name: gearName, ...range });
            }
        }
    }

    return recommended;
};

/**
 * Matches activity gear with sailor's favorite gear
 */
export const matchGearWithFavorites = (activityGear, sailorGear) => {
    const matches = {
        boards: [],
        sails: [],
        wings: [],
        speedsails: []
    };

    const favoriteBoard = sailorGear?.board;
    const favoriteSail = sailorGear?.sail;
    const favoriteWing = sailorGear?.wing;
    const favoriteSpeedsail = sailorGear?.speedsail;

    if (activityGear.boards) {
        matches.boards = activityGear.boards.map((board) => ({
            name: board,
            isFavorite: board === favoriteBoard
        }));
    }

    if (activityGear.sails) {
        matches.sails = activityGear.sails.map((sail) => ({
            name: sail,
            isFavorite: sail === favoriteSail
        }));
    }

    if (activityGear.wings) {
        matches.wings = activityGear.wings.map((wing) => ({
            name: wing,
            isFavorite: wing === favoriteWing
        }));
    }

    if (activityGear.speedsails) {
        matches.speedsails = activityGear.speedsails.map((speedsail) => ({
            name: speedsail,
            isFavorite: speedsail === favoriteSpeedsail
        }));
    }

    return matches;
};

/**
 * Fetches activities data from public folder
 */
export const fetchActivitiesData = async () => {
    if (typeof window === "undefined") {
        try {
            const [{ readFile }, path] = await Promise.all([
                import("fs/promises"),
                import("path")
            ]);

            const filePath = path.join(
                process.cwd(),
                "public",
                "activities",
                "activities.json"
            );

            const fileContent = await readFile(filePath, "utf-8");
            return JSON.parse(fileContent);
        } catch (error) {
            console.error("Failed to read activities.json from filesystem", error);
            throw new Error("Failed to load activities data");
        }
    }

    const response = await fetch("/activities/activities.json", { cache: "no-store" });
    if (!response.ok) {
        throw new Error("Failed to fetch activities data");
    }
    return response.json();
};

/**
 * Gets a sailor by name
 */
export const getSailorByName = (sailors, name) => {
    return sailors.find((sailor) => sailor.name.toLowerCase() === name.toLowerCase());
};
