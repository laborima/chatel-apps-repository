package org.leslaborie.chatel.watch.complication

import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.NoDataComplicationData
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import org.leslaborie.chatel.watch.data.DataCache
import org.leslaborie.chatel.watch.data.LiveWind
import org.leslaborie.chatel.watch.data.Prefs
import kotlin.math.roundToInt

/**
 * Complication « vent temps réel » en nœuds, pour les cadrans Wear OS.
 *
 * Batterie : le service ne tourne jamais en fond. Le système appelle
 * [onComplicationRequest] uniquement quand le cadran est affiché, au plus une
 * fois par `UPDATE_PERIOD_SECONDS` (10 min). Les requêtes réseau passent par
 * [DataCache], donc plusieurs complications sur le même cadran ne déclenchent
 * qu'un seul appel, et une valeur en cache est renvoyée immédiatement.
 */
class WindComplicationService : SuspendingComplicationDataSourceService() {

    /** Échelle de la jauge : au-delà de 40 nœuds on ne sort plus la planche. */
    private val maxKnots = 40f

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        render(LiveWind(speedKnots = 17.0, gustKnots = 23.0, maxGustTodayKnots = null, directionDeg = 270.0, temperatureC = null), type)

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData {
        val baseUrl = Prefs(this).currentBaseUrl()
        val wind = DataCache.liveWind(this, baseUrl)
            ?: return NoDataComplicationData()
        return render(wind, request.complicationType) ?: NoDataComplicationData()
    }

    private fun render(wind: LiveWind, type: ComplicationType): ComplicationData? {
        val knots = wind.speedKnots ?: return null
        val rounded = knots.roundToInt()
        val direction = wind.directionDeg
        val gust = wind.gustKnots?.roundToInt()

        val description = plain(
            buildString {
                append("Vent $rounded nœuds")
                direction?.let { append(" ${cardinal(it)}") }
                gust?.let { append(", rafales $it") }
            }
        )
        val tap = openAppIntent(this)

        return when (type) {
            ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(
                text = plain("$rounded kt"),
                contentDescription = description
            )
                .setTitle(direction?.let { plain(cardinal(it)) })
                .setTapAction(tap)
                .build()

            ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(
                text = plain(
                    buildString {
                        append("$rounded kt")
                        direction?.let { append(" ${cardinal(it)} ${windArrow(it)}") }
                        gust?.let { append(" · raf. $it") }
                    }
                ),
                contentDescription = description
            )
                .setTitle(plain("Vent"))
                .setTapAction(tap)
                .build()

            // La jauge donne l'intensité d'un coup d'œil, sans lire le chiffre.
            ComplicationType.RANGED_VALUE -> RangedValueComplicationData.Builder(
                value = knots.toFloat().coerceIn(0f, maxKnots),
                min = 0f,
                max = maxKnots,
                contentDescription = description
            )
                .setText(plain("$rounded kt"))
                .setTitle(direction?.let { plain(cardinal(it)) })
                .setTapAction(tap)
                .build()

            else -> null
        }
    }
}
