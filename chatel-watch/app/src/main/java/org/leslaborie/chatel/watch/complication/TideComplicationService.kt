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
import org.leslaborie.chatel.watch.data.Prefs
import org.leslaborie.chatel.watch.data.TideExtreme
import org.leslaborie.chatel.watch.data.TideExtremeType
import org.leslaborie.chatel.watch.data.TideSnapshot
import java.time.Instant

/**
 * Complication « marée » pour les cadrans Wear OS.
 *
 * Batterie : la hauteur est **recalculée localement** à partir des extrêmes déjà
 * en cache (voir [org.leslaborie.chatel.watch.data.TideMath]). Une seule requête
 * réseau tous les ~12 h suffit pour couvrir la semaine, donc les
 * rafraîchissements intermédiaires ne coûtent que quelques microsecondes de CPU.
 */
class TideComplicationService : SuspendingComplicationDataSourceService() {

    override fun getPreviewData(type: ComplicationType): ComplicationData? {
        val now = Instant.now()
        val preview = TideSnapshot(
            heightMeters = 4.2,
            isRising = true,
            nextHigh = TideExtreme(TideExtremeType.HIGH, 6.2, now.plusSeconds(5400), 91),
            nextLow = TideExtreme(TideExtremeType.LOW, 1.1, now.plusSeconds(28800)),
            coefficient = 91,
            cycleRange = 1.1 to 6.2
        )
        return render(preview, type)
    }

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData {
        val baseUrl = Prefs(this).currentBaseUrl()
        val tide = DataCache.tide(this, baseUrl)
            ?: return NoDataComplicationData()
        return render(tide, request.complicationType) ?: NoDataComplicationData()
    }

    private fun render(tide: TideSnapshot, type: ComplicationType): ComplicationData? {
        val arrow = if (tide.isRising) "↑" else "↓"
        val height = String.format("%.1f", tide.heightMeters)
        val nextExtreme = listOfNotNull(tide.nextHigh, tide.nextLow).minByOrNull { it.time }

        val description = plain(
            buildString {
                append("Marée $height m, ")
                append(if (tide.isRising) "montante" else "descendante")
                nextExtreme?.let {
                    val label = if (it.type == TideExtremeType.HIGH) "pleine mer" else "basse mer"
                    append(", $label à ${it.time.atWatch()}")
                }
                tide.coefficient?.let { append(", coefficient $it") }
            }
        )
        val tap = openAppIntent(this)

        return when (type) {
            ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(
                text = plain("$height m"),
                contentDescription = description
            )
                .setTitle(plain(arrow + (nextExtreme?.let { it.time.atWatch() } ?: "")))
                .setTapAction(tap)
                .build()

            ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(
                text = plain(
                    buildString {
                        append("$height m $arrow")
                        nextExtreme?.let {
                            val label = if (it.type == TideExtremeType.HIGH) "PM" else "BM"
                            append("  $label ${it.time.atWatch()}")
                        }
                    }
                ),
                contentDescription = description
            )
                .setTitle(plain(tide.coefficient?.let { "Marée · coef $it" } ?: "Marée"))
                .setTapAction(tap)
                .build()

            // Jauge entre la BM et la PM du cycle en cours : on lit la marée comme
            // un cadran, sans avoir à comparer des chiffres.
            ComplicationType.RANGED_VALUE -> {
                val (low, high) = tide.cycleRange ?: return null
                RangedValueComplicationData.Builder(
                    value = tide.heightMeters.toFloat().coerceIn(low.toFloat(), high.toFloat()),
                    min = low.toFloat(),
                    max = high.toFloat(),
                    contentDescription = description
                )
                    .setText(plain("$height m"))
                    .setTitle(plain(arrow + (nextExtreme?.let { it.time.atWatch() } ?: "")))
                    .setTapAction(tap)
                    .build()
            }

            else -> null
        }
    }
}
