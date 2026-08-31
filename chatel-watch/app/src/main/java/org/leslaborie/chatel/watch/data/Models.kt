package org.leslaborie.chatel.watch.data

import org.json.JSONObject
import java.time.Instant

enum class TideExtremeType { HIGH, LOW }

/**
 * Un extrême de marée (pleine ou basse mer).
 * Le coefficient (20-120) n'est renseigné que sur les pleines mers.
 */
data class TideExtreme(
    val type: TideExtremeType,
    val value: Double,
    val time: Instant,
    val coefficient: Int? = null
)

data class TideInfo(
    val heightNow: Double?,
    val heightHigh: Double?,
    val heightLow: Double?,
    val timeHigh: Instant?,
    val timeLow: Instant?,
    val stationName: String?,
    /**
     * Extrêmes des prochains jours, quand le serveur les expose. Ils permettent
     * de recalculer la marée hors ligne, sans nouvelle requête réseau.
     */
    val extremes: List<TideExtreme> = emptyList(),
    val coefficient: Int? = null
) {
    // La marée monte si le prochain extrême est la pleine mer
    val isRising: Boolean
        get() = when {
            timeHigh != null && timeLow != null -> timeHigh.isBefore(timeLow)
            timeHigh != null -> true
            else -> false
        }
}

data class CurrentWeather(
    val windKnots: Double?,
    val gustKnots: Double?,
    val windDirectionDeg: Double?,
    val temperatureC: Double?,
    val visibilityKm: Double?,
    val description: String?
) {
    val isRaining: Boolean
        get() {
            val d = description?.lowercase() ?: return false
            return listOf("rain", "drizzle", "shower", "pluie", "averse", "thunder", "orage")
                .any { d.contains(it) }
        }
}

data class SunTimes(
    val sunrise: Instant?,
    val sunset: Instant?
) {
    fun isDaylight(at: Instant = Instant.now()): Boolean {
        if (sunrise == null || sunset == null) {
            return true // pas de donnée : ne pas disqualifier
        }
        return at.isAfter(sunrise) && at.isBefore(sunset)
    }
}

data class LiveWind(
    val speedKnots: Double?,
    val gustKnots: Double?,
    val maxGustTodayKnots: Double?,
    val directionDeg: Double?,
    val temperatureC: Double?
)

data class Profile(
    val id: String,
    val name: String
)

data class ActivityDef(
    val id: String,
    val name: String,
    val description: String?,
    val suitableFor: List<String>,
    val idealConditions: JSONObject
)

data class Location(
    val name: String,
    val latitude: Double,
    val longitude: Double
)

data class ActivitiesConfig(
    val profiles: List<Profile>,
    val activities: List<ActivityDef>,
    val location: Location
)

data class Conditions(
    val windKnots: Double?,
    val windCardinal: String?,
    val tideHeight: Double?,
    val tideRising: Boolean,
    val temperatureC: Double?,
    val visibilityKm: Double?,
    val isRaining: Boolean,
    val isDaylight: Boolean
)

data class Evaluation(
    val activity: ActivityDef,
    val score: Int,
    val isValid: Boolean,
    val mainReason: String?
)

data class AppData(
    val config: ActivitiesConfig,
    val tide: TideInfo,
    val weather: CurrentWeather,
    val sun: SunTimes,
    val liveWind: LiveWind?
)
