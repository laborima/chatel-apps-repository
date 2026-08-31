package org.leslaborie.chatel.watch.data

/**
 * Port simplifié du moteur de recommandation de chatel-meteo-planner
 * (app/services/plannerService.js). Les critères houle et créneaux
 * calendaires ne sont pas évalués sur la montre (données indisponibles).
 */
object Planner {

    private val CARDINALS = listOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")

    val ACTIVITY_EMOJI = mapOf(
        "cirrus_sailing" to "⛵",
        "windsurf" to "🏄",
        "wingfoil" to "🪁",
        "speedsail" to "🛞",
        "paddle_cruise" to "🛶"
    )

    fun degreesToCardinal(degrees: Double): String {
        val normalized = ((degrees % 360) + 360) % 360
        val index = Math.round(normalized / 45.0).toInt() % 8
        return CARDINALS[index]
    }

    fun buildConditions(data: AppData): Conditions = Conditions(
        // Vent temps réel (station) en priorité, prévision en secours
        windKnots = data.liveWind?.speedKnots ?: data.weather.windKnots,
        windCardinal = (data.liveWind?.directionDeg ?: data.weather.windDirectionDeg)
            ?.let { degreesToCardinal(it) },
        tideHeight = data.tide.heightNow,
        tideRising = data.tide.isRising,
        temperatureC = data.weather.temperatureC,
        visibilityKm = data.weather.visibilityKm,
        isRaining = data.weather.isRaining,
        isDaylight = data.sun.isDaylight()
    )

    fun evaluate(activity: ActivityDef, c: Conditions): Evaluation {
        val ideal = activity.idealConditions
        var score = 100
        var isValid = true
        val reasons = mutableListOf<String>()

        fun fail(penalty: Int, reason: String) {
            isValid = false
            score -= penalty
            reasons.add(reason)
        }

        if (ideal.optBoolean("daylight_only", false) && !c.isDaylight) {
            fail(100, "Nuit")
        }

        val tide = c.tideHeight
        if (tide != null) {
            if (ideal.has("tide_min") && tide < ideal.getDouble("tide_min")) {
                fail(50, "Marée trop basse")
            }
            if (ideal.has("tide_max") && tide > ideal.getDouble("tide_max")) {
                fail(50, "Marée trop haute")
            }
        }

        val wind = c.windKnots
        if (wind != null) {
            val range = ideal.optJSONArray("wind_range")
            if (range != null && range.length() == 2) {
                if (wind < range.getDouble(0)) fail(40, "Vent trop faible (%.0f nd)".format(wind))
                if (wind > range.getDouble(1)) fail(40, "Vent trop fort (%.0f nd)".format(wind))
            }
            if (ideal.has("wind_min") && wind < ideal.getDouble("wind_min")) {
                fail(40, "Vent trop faible (%.0f nd)".format(wind))
            }
            if (ideal.has("wind_max") && wind > ideal.getDouble("wind_max")) {
                fail(40, "Vent trop fort (%.0f nd)".format(wind))
            }
        }

        if (ideal.optBoolean("no_rain", false) && c.isRaining) {
            fail(20, "Pluie")
        }

        val visibility = c.visibilityKm
        if (visibility != null && ideal.has("visibility_min") &&
            visibility < ideal.getDouble("visibility_min")
        ) {
            fail(40, "Visibilité insuffisante")
        }

        val temperature = c.temperatureC
        if (temperature != null && ideal.has("temperature_min") &&
            temperature < ideal.getDouble("temperature_min")
        ) {
            fail(20, "Trop froid (%.0f°C)".format(temperature))
        }

        // Direction du vent : pénalité sans disqualification
        val directions = ideal.optJSONArray("wind_direction")
        if (directions != null && c.windCardinal != null) {
            var preferred = false
            for (i in 0 until directions.length()) {
                val d = directions.getString(i)
                if (d.equals("any", ignoreCase = true) || d.equals(c.windCardinal, ignoreCase = true)) {
                    preferred = true
                    break
                }
            }
            if (!preferred) score -= 15
        }

        // Phase de marée préférée : pénalité légère
        if (ideal.optString("tide_phase") == "rising" && !c.tideRising) {
            score -= 5
        }

        return Evaluation(
            activity = activity,
            score = score.coerceIn(0, 110),
            isValid = isValid,
            mainReason = reasons.firstOrNull()
        )
    }

/**
     * Faisabilité d'une activité sur les seuls critères **vent et marée**.
     *
     * Volontairement plus étroit que [evaluate] : pas de jour/nuit, pas de pluie,
     * pas de température, et surtout aucune notion d'agenda ou de profil. C'est
     * ce que demande la jauge de vent — elle montre l'état de la mer et du vent
     * maintenant, pas si tu es disponible.
     *
     * Une activité qui ne déclare aucune contrainte de vent ni de marée est
     * considérée possible.
     */
    fun isPossibleOnWindAndTide(
        activity: ActivityDef,
        windKnots: Double?,
        tide: TideInfo?
    ): Boolean {
        val ideal = activity.idealConditions

        if (windKnots != null) {
            val range = ideal.optJSONArray("wind_range")
            if (range != null && range.length() == 2) {
                if (windKnots < range.getDouble(0) || windKnots > range.getDouble(1)) return false
            }
            if (ideal.has("wind_min") && windKnots < ideal.getDouble("wind_min")) return false
            if (ideal.has("wind_max") && windKnots > ideal.getDouble("wind_max")) return false
        }

        val height = tide?.heightNow
        if (height != null) {
            if (ideal.has("tide_min") && height < ideal.getDouble("tide_min")) return false
            if (ideal.has("tide_max") && height > ideal.getDouble("tide_max")) return false
        }

        // Coefficient et fenêtre autour d'un extrême : ce sont des notions de
        // marée, elles comptent donc ici.
        val coefficient = tide?.coefficient
        if (coefficient != null) {
            if (ideal.has("coefficient_min") && coefficient < ideal.getInt("coefficient_min")) return false
            if (ideal.has("coefficient_max") && coefficient > ideal.getInt("coefficient_max")) return false
        }

        val window = ideal.optJSONObject("tide_window")
        val extremes = tide?.extremes
        if (window != null && !extremes.isNullOrEmpty()) {
            val type = if (window.optString("around") == "high") TideExtremeType.HIGH else TideExtremeType.LOW
            val offset = TideMath.minutesFromNearest(extremes, type)
            if (offset != null) {
                val before = window.optDouble("hours_before", 1.0) * 60
                val after = window.optDouble("hours_after", 1.0) * 60
                if (offset < -before || offset > after) return false
            }
        }

        return true
    }

    /** Activités évaluées pour un profil, triées par score décroissant. */
    fun recommend(profileId: String, data: AppData): List<Evaluation> {
        val conditions = buildConditions(data)
        return data.config.activities
            .filter { it.suitableFor.isEmpty() || it.suitableFor.contains(profileId) }
            .map { evaluate(it, conditions) }
            .sortedByDescending { it.score }
    }
}
