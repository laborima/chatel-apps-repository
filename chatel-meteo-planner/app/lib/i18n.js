/**
 * Simple i18n utility
 * Loads French translations for the application
 */

import frTranslations from "../locales/fr.json";

const translations = {
    fr: frTranslations
};

let currentLang = "fr";

/**
 * Get translation for a key using dot notation
 * Example: t("weather.wind") returns "Vent"
 */
export const t = (key, defaultValue = "") => {
    const keys = key.split(".");
    let value = translations[currentLang];

    for (const k of keys) {
        if (value && typeof value === "object") {
            value = value[k];
        } else {
            return defaultValue || key;
        }
    }

    return value || defaultValue || key;
};

/**
 * Set current language
 */
export const setLanguage = (lang) => {
    if (translations[lang]) {
        currentLang = lang;
    }
};

/**
 * Get current language
 */
export const getLanguage = () => {
    return currentLang;
};

export default { t, setLanguage, getLanguage };
