/**
 * Configuration Service
 * Centralized service for loading and caching activities.json configuration
 */

let activitiesData = null;

/**
 * Load activities data from activities.json
 * Data is cached after first load to avoid redundant file reads/fetches
 * @returns {Promise<Object>} Complete activities data including profiles, activities, equipment, and planning_config
 */
export const loadActivitiesData = async () => {
    if (activitiesData) {
        return activitiesData;
    }

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
            activitiesData = JSON.parse(fileContent);
            return activitiesData;
        } catch (error) {
            console.error("Failed to read activities.json from filesystem", error);
            throw new Error("Failed to load activities data");
        }
    }

    const response = await fetch("/activities/activities.json", { cache: "no-store" });
    if (!response.ok) {
        throw new Error("Failed to fetch activities data");
    }
    activitiesData = await response.json();
    return activitiesData;
};

/**
 * Get planning configuration from activities.json
 * @returns {Promise<Object>} Planning configuration including location, forecast_days, etc.
 */
export const getPlanningConfig = async () => {
    const data = await loadActivitiesData();
    return data.planning_config;
};

/**
 * Get location configuration
 * @returns {Promise<Object>} Location object with name, latitude, longitude, timezone
 */
export const getLocation = async () => {
    const config = await getPlanningConfig();
    return config.location;
};

/**
 * Get profiles from activities.json
 * @returns {Promise<Array>} Array of user profiles
 */
export const getProfiles = async () => {
    const data = await loadActivitiesData();
    return data.profiles;
};

/**
 * Get activities from activities.json
 * @returns {Promise<Array>} Array of activities
 */
export const getActivities = async () => {
    const data = await loadActivitiesData();
    return data.activities;
};

/**
 * Get equipment from activities.json
 * @returns {Promise<Array>} Array of equipment
 */
export const getEquipment = async () => {
    const data = await loadActivitiesData();
    return data.equipment;
};

/**
 * Clear cached data (useful for testing or forcing reload)
 */
export const clearCache = () => {
    activitiesData = null;
};
