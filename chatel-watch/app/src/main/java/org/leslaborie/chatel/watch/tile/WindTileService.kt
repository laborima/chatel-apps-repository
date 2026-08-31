package org.leslaborie.chatel.watch.tile

import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.degrees
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.tiles.EventBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.guava.future
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.leslaborie.chatel.watch.data.ActivityDef
import org.leslaborie.chatel.watch.data.Planner
import org.leslaborie.chatel.watch.data.Prefs
import org.leslaborie.chatel.watch.data.SignalKApi

/**
 * Tuile Vent : jauge circulaire qui fait le tour de l'écran.
 * - Anneau extérieur : vent courant (cyan) sur échelle 0-40 nd,
 *   marqueur blanc au maximum atteint (rafale).
 * - Anneaux intérieurs : plage de vent praticable de chaque activité.
 *
 * Temps réel : tant que la tuile est affichée (onTileEnterEvent),
 * une boucle demande un rafraîchissement toutes les 30 s.
 */
class WindTileService : TileService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var liveRefreshJob: Job? = null

    companion object {
        private const val GAUGE_MAX_KN = 40.0
        private const val GAUGE_SWEEP = 300f
        private const val GAUGE_START = -150f

        /** Anneau d'une activité hors de ses conditions : présent mais éteint. */
        private const val COLOR_DIMMED = 0xFF3F4A5A.toInt()

        /** Remplissage quand on est tout en bas ou tout en haut de la plage. */
        private const val COLOR_EDGE = 0xFFFBBF24.toInt()

        /** Fraction de la plage considérée comme "en limite". */
        private const val EDGE_FRACTION = 0.15

        /**
         * Longueur minimale du remplissage. Pile sur la limite basse le
         * remplissage vaut 0 : sans ce plancher, l'alerte ambre serait invisible
         * au moment precis ou elle est la plus utile.
         */
        private const val MIN_FILL_DEG = 6f

        /** Assombrit une couleur pour servir de fond de jauge. */
        private fun dim(color: Int, factor: Float = 0.30f): Int {
            val r = ((color shr 16 and 0xFF) * factor).toInt()
            val g = ((color shr 8 and 0xFF) * factor).toInt()
            val b = ((color and 0xFF) * factor).toInt()
            return (0xFF shl 24) or (r shl 16) or (g shl 8) or b
        }

        private val ACTIVITY_COLORS = mapOf(
            "paddle_cruise" to 0xFF4ADE80.toInt(),   // vert
            "cirrus_sailing" to 0xFF14B8A6.toInt(),  // turquoise
            "wingfoil" to 0xFFA855F7.toInt(),        // violet
            "windsurf" to 0xFFF97316.toInt(),        // orange
            "speedsail" to 0xFFEAB308.toInt()        // jaune
        )

        private fun fractionOf(knots: Double): Float =
            (knots.coerceIn(0.0, GAUGE_MAX_KN) / GAUGE_MAX_KN).toFloat()

        private fun angleOf(knots: Double): Float =
            GAUGE_START + GAUGE_SWEEP * fractionOf(knots)
    }

    override fun onTileEnterEvent(requestParams: EventBuilders.TileEnterEvent) {
        liveRefreshJob?.cancel()
        liveRefreshJob = scope.launch {
            while (isActive) {
                delay(30_000)
                getUpdater(this@WindTileService).requestUpdate(WindTileService::class.java)
            }
        }
    }

    override fun onTileLeaveEvent(requestParams: EventBuilders.TileLeaveEvent) {
        liveRefreshJob?.cancel()
        liveRefreshJob = null
    }

    private fun gaugeArc(
        startDeg: Float,
        sweepDeg: Float,
        color: Int,
        thicknessDp: Float
    ): LayoutElementBuilders.Arc =
        LayoutElementBuilders.Arc.Builder()
            .setAnchorAngle(degrees(startDeg))
            .setAnchorType(LayoutElementBuilders.ARC_ANCHOR_START)
            .addContent(
                LayoutElementBuilders.ArcLine.Builder()
                    .setLength(degrees(sweepDeg))
                    .setThickness(dp(thicknessDp))
                    .setColor(argb(color))
                    .build()
            )
            .build()

    /** Anneau inséré vers le centre via un padding croissant. */
    private fun insetRing(
        insetDp: Float,
        arc: LayoutElementBuilders.Arc
    ): LayoutElementBuilders.Box =
        LayoutElementBuilders.Box.Builder()
            .setWidth(expand())
            .setHeight(expand())
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setPadding(
                        ModifiersBuilders.Padding.Builder()
                            .setAll(dp(insetDp))
                            .build()
                    )
                    .build()
            )
            .addContent(arc)
            .build()

    /**
     * Plage de vent praticable d'une activité, en nœuds.
     *
     * [hasMax] distingue un maximum réel d'une borne implicite : une activité
     * qui n'a qu'un `wind_min` n'a pas de "limite haute", et il ne faut donc pas
     * l'alerter comme si elle en avait une.
     */
    private data class WindRange(val min: Double, val max: Double, val hasMax: Boolean)

    private fun windRangeOf(activity: ActivityDef): WindRange? {
        val ideal = activity.idealConditions
        val range = ideal.optJSONArray("wind_range")
        if (range != null && range.length() == 2) {
            return WindRange(range.getDouble(0), range.getDouble(1), hasMax = true)
        }
        val min = if (ideal.has("wind_min")) ideal.getDouble("wind_min") else null
        val max = if (ideal.has("wind_max")) ideal.getDouble("wind_max") else null
        if (min == null && max == null) {
            return null
        }
        return WindRange(min ?: 0.0, max ?: GAUGE_MAX_KN, hasMax = max != null)
    }

    override fun onTileRequest(
        requestParams: RequestBuilders.TileRequest
    ): ListenableFuture<TileBuilders.Tile> = scope.future {
        val root = try {
            val baseUrl = Prefs(this@WindTileService).currentBaseUrl()
            val wind = SignalKApi.fetchLiveWind(baseUrl)
            val activities = runCatching {
                SignalKApi.fetchActivitiesConfig(baseUrl).activities
            }.getOrDefault(emptyList())
            // La marée conditionne autant que le vent : sans elle on ne peut pas
            // dire si une activité est praticable maintenant.
            val tide = runCatching { SignalKApi.fetchTide(baseUrl) }.getOrNull()

            val speed = wind.speedKnots ?: 0.0
            val gust = wind.gustKnots
            // "Max atteint" : rafale max du jour (anémomètre), sinon rafale courante
            val maxReached = wind.maxGustTodayKnots ?: gust
            val direction = wind.directionDeg?.let { Planner.degreesToCardinal(it) } ?: "--"

            val box = LayoutElementBuilders.Box.Builder()
                .setWidth(expand())
                .setHeight(expand())
                .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
                .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
                .setModifiers(
                    ModifiersBuilders.Modifiers.Builder()
                        .setClickable(openAppClickable(packageName))
                        .build()
                )
                // Fond de jauge (0-40 nd)
                .addContent(gaugeArc(GAUGE_START, GAUGE_SWEEP, 0xFF1E293B.toInt(), 8f))
                // Vent courant
                .addContent(gaugeArc(GAUGE_START, GAUGE_SWEEP * fractionOf(speed), COLOR_PRIMARY, 8f))

            // Maximum atteint : marqueur blanc sur la jauge
            if (maxReached != null && maxReached > 0) {
                box.addContent(gaugeArc(angleOf(maxReached) - 1.5f, 3f, COLOR_WHITE, 8f))
            }

            // Praticable ou non, sur les seuls critères vent et marée : cette
            // tuile décrit l'état du plan d'eau, pas la disponibilité de qui que
            // ce soit. Aucune notion d'agenda ici.
            val gaugeActivities = activities.filter { windRangeOf(it) != null }
            val possible = gaugeActivities.filter {
                Planner.isPossibleOnWindAndTide(it, wind.speedKnots, tide)
            }
            val possibleIds = possible.map { it.id }.toSet()

            // Couleur de remplissage par activité : ambre quand le vent est dans
            // les 15 % bas ou hauts de sa plage. Calculée une fois, pour que
            // l'anneau et sa pastille de légende racontent la même chose.
            val fillColors = possible.associate { activity ->
                val wr = windRangeOf(activity)!!
                val width = (wr.max - wr.min).takeIf { it > 0 } ?: 1.0
                val position = ((speed - wr.min) / width).coerceIn(0.0, 1.0)
                val atEdge = position < EDGE_FRACTION ||
                    (wr.hasMax && position > 1 - EDGE_FRACTION)
                activity.id to if (atEdge) COLOR_EDGE else (ACTIVITY_COLORS[activity.id] ?: COLOR_MUTED)
            }

            // Un anneau par activité. Praticable, l'anneau devient lui-même une
            // jauge : la portion allumée va du minimum de l'activité jusqu'au vent
            // du moment, ce qui montre d'un coup d'oeil si on est en bas ou en
            // haut de sa plage. En limite (15 % de chaque bord) le remplissage
            // passe en ambre.
            var inset = 9f
            for (activity in gaugeActivities) {
                val wr = windRangeOf(activity) ?: continue
                val isPossible = activity.id in possibleIds
                val baseColor = ACTIVITY_COLORS[activity.id] ?: COLOR_MUTED
                val span = GAUGE_SWEEP * fractionOf(wr.max - wr.min)

                if (!isPossible) {
                    box.addContent(insetRing(inset, gaugeArc(angleOf(wr.min), span, COLOR_DIMMED, 2.5f)))
                    inset += 5f
                    continue
                }

                // Fond : toute la plage de l'activité, en sourdine
                box.addContent(insetRing(inset, gaugeArc(angleOf(wr.min), span, dim(baseColor), 4f)))

                // Remplissage : du minimum jusqu'au vent actuel
                val fillColor = fillColors[activity.id] ?: baseColor
                val fillSweep = maxOf(MIN_FILL_DEG, GAUGE_SWEEP * fractionOf(speed - wr.min))
                box.addContent(
                    insetRing(inset, gaugeArc(angleOf(wr.min), fillSweep, fillColor, 4f))
                )
                inset += 5f
            }

            // Légende : uniquement les activités praticables maintenant. Lister
            // les autres ne ferait qu'encombrer un écran de 480 px.
            val legend = LayoutElementBuilders.Row.Builder()
                .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            if (possible.isEmpty()) {
                legend.addContent(text("aucune activité", 14f, COLOR_MUTED))
            } else {
                for (activity in possible) {
                    val emoji = Planner.ACTIVITY_EMOJI[activity.id] ?: "•"
                    legend.addContent(text("●", 13f, fillColors[activity.id] ?: COLOR_MUTED))
                    legend.addContent(text("$emoji ", 15f))
                }
            }

            // Valeurs au centre. La vitesse est l'information qu'on lit d'un
            // coup d'oeil depuis la plage : elle domine, le reste suit.
            box.addContent(
                LayoutElementBuilders.Column.Builder()
                    .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
                    .addContent(text("💨 VENT", 15f, COLOR_PRIMARY))
                    .addContent(text("%.0f".format(speed), 58f))
                    .addContent(text("nœuds · $direction", 18f, COLOR_MUTED))
                    .addContent(
                        text(
                            buildString {
                                append("raf. ")
                                append(gust?.let { "%.0f".format(it) } ?: "--")
                                append(" · max ")
                                append(maxReached?.let { "%.0f".format(it) } ?: "--")
                            },
                            17f,
                            COLOR_MUTED
                        )
                    )
                    .addContent(legend.build())
                    .build()
            )

            box.build()
        } catch (e: Exception) {
            rootBox(
                packageName,
                text("💨 VENT", 15f, COLOR_PRIMARY),
                text("Serveur injoignable", 15f, COLOR_INVALID)
            )
        }
        tileOf(root, resourcesVersion = "1", freshnessMillis = 5 * 60 * 1000L)
    }

    override fun onTileResourcesRequest(
        requestParams: RequestBuilders.ResourcesRequest
    ): ListenableFuture<ResourceBuilders.Resources> =
        Futures.immediateFuture(
            ResourceBuilders.Resources.Builder().setVersion("1").build()
        )

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}
