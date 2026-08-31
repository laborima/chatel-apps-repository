package org.leslaborie.chatel.watch.tile

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Shader
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.guava.future
import org.leslaborie.chatel.watch.data.Prefs
import org.leslaborie.chatel.watch.data.SignalKApi
import org.leslaborie.chatel.watch.data.TideInfo
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.PI
import kotlin.math.cos

/**
 * Tuile Marée : hauteur actuelle, sens, prochaines PM/BM et courbe
 * sinusoïdale de la marée avec le seuil de 4 m en arrière-plan.
 * Rafraîchie uniquement quand elle est affichée.
 */
class TideTileService : TileService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val timeFormatter = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault())

    companion object {
        private const val THRESHOLD_M = 4.0f
        private const val SCALE_MAX_M = 7.0f

        // Carre : la courbe sert de fond a toute la tuile ronde. On reste sous
        // le demi-mega-octet une fois converti en RGB_565 (360*360*2 = 259 Ko),
        // et l'upscale d'une courbe lisse ne se voit pas.
        private const val IMG_SIZE = 360
        private const val IMG_W = IMG_SIZE
        private const val IMG_H = IMG_SIZE

        // Demi-période de marée par défaut (semi-diurne) si un seul extrême connu
        private val DEFAULT_HALF_PERIOD: Duration = Duration.ofMinutes(6 * 60 + 12)
    }

    private fun fmt(instant: Instant?): String =
        instant?.let { timeFormatter.format(it) } ?: "--:--"

    /**
     * Reconstruit la liste des extrêmes (alternance BM/PM) couvrant la
     * fenêtre affichée, à partir des prochains PM/BM connus, en
     * extrapolant par périodicité.
     */
    private fun buildExtremes(tide: TideInfo, from: Instant, to: Instant): List<Pair<Instant, Float>> {
        // Le serveur expose desormais la semaine complete : on prefere les vraies
        // amplitudes (vives-eaux / mortes-eaux) a une extrapolation periodique.
        if (tide.extremes.size >= 2) {
            return tide.extremes.map { it.time to it.value.toFloat() }
        }

        val high = tide.timeHigh?.let { it to (tide.heightHigh ?: 5.5).toFloat() }
        val low = tide.timeLow?.let { it to (tide.heightLow ?: 1.5).toFloat() }
        val known = listOfNotNull(high, low).sortedBy { it.first }
        if (known.isEmpty()) {
            return emptyList()
        }

        val halfPeriod = if (known.size == 2) {
            Duration.between(known[0].first, known[1].first).abs()
        } else {
            DEFAULT_HALF_PERIOD
        }

        val extremes = ArrayDeque(known)
        // Extrapolation vers le passé
        while (extremes.first().first.isAfter(from)) {
            val (t, _) = extremes.first()
            val prevHeight = if (extremes.size >= 2) extremes[1].second else known.first().second
            extremes.addFirst(t.minus(halfPeriod) to prevHeight)
        }
        // Extrapolation vers le futur
        while (extremes.last().first.isBefore(to)) {
            val (t, _) = extremes.last()
            val prevHeight = if (extremes.size >= 2) extremes[extremes.size - 2].second else known.first().second
            extremes.addLast(t.plus(halfPeriod) to prevHeight)
        }
        return extremes.toList()
    }

    /** Hauteur interpolée (cosinus) entre les extrêmes encadrants. */
    private fun heightAt(extremes: List<Pair<Instant, Float>>, t: Instant): Float {
        val next = extremes.indexOfFirst { it.first.isAfter(t) }
        if (next <= 0) {
            return extremes.firstOrNull()?.second ?: 0f
        }
        val (t1, h1) = extremes[next - 1]
        val (t2, h2) = extremes[next]
        val total = Duration.between(t1, t2).toMillis().toFloat()
        val done = Duration.between(t1, t).toMillis().toFloat()
        val phase = (done / total).coerceIn(0f, 1f)
        return h1 + (h2 - h1) * (1f - cos(PI.toFloat() * phase)) / 2f
    }

    /** Dessine la sinusoïde de marée, le seuil 4 m et le point "maintenant". */
    private fun drawCurve(tide: TideInfo): Bitmap {
        val bitmap = Bitmap.createBitmap(IMG_W, IMG_H, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        // Fond opaque : l'image est transmise en RGB_565 (sans alpha)
        canvas.drawColor(Color.BLACK)

        val now = Instant.now()
        // Fenetre centree sur maintenant : le point courant tombe au milieu du
        // cercle, on voit d'ou vient la maree et ou elle va.
        val from = now.minus(Duration.ofHours(6))
        val to = now.plus(Duration.ofHours(6))
        val extremes = buildExtremes(tide, from.minus(Duration.ofHours(8)), to.plus(Duration.ofHours(8)))

        fun xOf(t: Instant): Float =
            Duration.between(from, t).toMillis().toFloat() /
                Duration.between(from, to).toMillis().toFloat() * IMG_W

        // La courbe balaie toute la hauteur : elle epouse le cercle au lieu de
        // rester dans une bande centrale.
        fun yOf(h: Float): Float =
            IMG_H - (h.coerceIn(0f, SCALE_MAX_M) / SCALE_MAX_M) * IMG_H

        // Seuil 4 m en arrière-plan (pointillés)
        val thresholdPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(180, 248, 113, 113)
            strokeWidth = 2.5f
            style = Paint.Style.STROKE
            pathEffect = DashPathEffect(floatArrayOf(10f, 8f), 0f)
        }
        val yThreshold = yOf(THRESHOLD_M)
        canvas.drawLine(0f, yThreshold, IMG_W.toFloat(), yThreshold, thresholdPaint)
        val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(220, 248, 113, 113)
            textSize = 22f
        }
        // Ecran rond : rester dans le carre inscrit, sinon le repere est rogne.
        canvas.drawText("4m", IMG_W * 0.055f, yThreshold - 10f, labelPaint)

        if (extremes.isNotEmpty()) {
            // Courbe + remplissage
            val curve = Path()
            val fill = Path()
            val stepMillis = Duration.between(from, to).toMillis() / 120
            var t = from
            var first = true
            while (!t.isAfter(to)) {
                val x = xOf(t)
                val y = yOf(heightAt(extremes, t))
                if (first) {
                    curve.moveTo(x, y)
                    fill.moveTo(x, IMG_H.toFloat())
                    fill.lineTo(x, y)
                    first = false
                } else {
                    curve.lineTo(x, y)
                    fill.lineTo(x, y)
                }
                t = t.plusMillis(stepMillis)
            }
            fill.lineTo(IMG_W.toFloat(), IMG_H.toFloat())
            fill.close()

            canvas.drawPath(fill, Paint().apply {
                // Assez sombre pour que le texte blanc pose par-dessus reste lisible.
                color = Color.argb(70, 34, 150, 180)
                style = Paint.Style.FILL
            })
            canvas.drawPath(curve, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.rgb(103, 232, 249)
                strokeWidth = 5f
                style = Paint.Style.STROKE
            })

            // Point "maintenant"
            val nowX = xOf(now)
            val nowY = yOf(tide.heightNow?.toFloat() ?: heightAt(extremes, now))
            canvas.drawLine(nowX, IMG_H * 0.62f, nowX, IMG_H.toFloat(), Paint().apply {
                color = Color.argb(70, 255, 255, 255)
                strokeWidth = 2f
            })
            canvas.drawCircle(nowX, nowY, 9f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                style = Paint.Style.FILL
            })
        }

        val centre = IMG_SIZE / 2f
        canvas.drawCircle(centre, centre, centre, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = RadialGradient(
                centre, centre, centre,
                intArrayOf(
                    Color.argb(190, 0, 0, 0),
                    Color.argb(150, 0, 0, 0),
                    Color.argb(0, 0, 0, 0)
                ),
                floatArrayOf(0f, 0.45f, 0.85f),
                Shader.TileMode.CLAMP
            )
        })

        return bitmap
    }

    // La courbe évolue : version par tranche de 5 minutes
    private fun currentVersion(): String =
        (System.currentTimeMillis() / (5 * 60 * 1000L)).toString()

    override fun onTileRequest(
        requestParams: RequestBuilders.TileRequest
    ): ListenableFuture<TileBuilders.Tile> = scope.future {
        val layout = try {
            val baseUrl = Prefs(this@TideTileService).currentBaseUrl()
            val tide = SignalKApi.fetchTide(baseUrl)

            LayoutElementBuilders.Box.Builder()
                .setWidth(expand())
                .setHeight(expand())
                .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
                .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
                .setModifiers(
                    androidx.wear.protolayout.ModifiersBuilders.Modifiers.Builder()
                        .setClickable(openAppClickable(packageName))
                        .build()
                )
                // Fond : la courbe occupe toute la tuile, jusqu'aux bords du cercle
                .addContent(
                    LayoutElementBuilders.Image.Builder()
                        .setResourceId("curve")
                        .setWidth(expand())
                        .setHeight(expand())
                        .setContentScaleMode(LayoutElementBuilders.CONTENT_SCALE_MODE_FILL_BOUNDS)
                        .build()
                )
                // Valeurs par-dessus
                .addContent(
                    LayoutElementBuilders.Column.Builder()
                        .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
                        .addContent(text("🌊 MARÉE", 15f, COLOR_PRIMARY))
                        .addContent(
                            text(
                                (tide.heightNow?.let { "%.2f m".format(it) } ?: "-- m") +
                                    if (tide.isRising) "  ↑" else "  ↓",
                                40f
                            )
                        )
                        .addContent(
                            text(
                                tide.coefficient?.let { "coef $it" } ?: " ",
                                16f,
                                COLOR_PRIMARY
                            )
                        )
                        .addContent(
                            text(
                                "PM ${fmt(tide.timeHigh)} · BM ${fmt(tide.timeLow)}",
                                16f
                            )
                        )
                        .build()
                )
                .build()
        } catch (e: Exception) {
            rootBox(
                packageName,
                text("🌊 MARÉE", 15f, COLOR_PRIMARY),
                text("Serveur injoignable", 15f, COLOR_INVALID)
            )
        }
        tileOf(layout, resourcesVersion = currentVersion(), freshnessMillis = 15 * 60 * 1000L)
    }

    override fun onTileResourcesRequest(
        requestParams: RequestBuilders.ResourcesRequest
    ): ListenableFuture<ResourceBuilders.Resources> = scope.future {
        val builder = ResourceBuilders.Resources.Builder().setVersion(currentVersion())
        try {
            val baseUrl = Prefs(this@TideTileService).currentBaseUrl()
            val tide = SignalKApi.fetchTide(baseUrl)
            val curve = drawCurve(tide)
            builder.addIdToImageMapping("curve", bitmapToImageResource(curve))
            curve.recycle()
        } catch (e: Exception) {
            // Pas d'image : la tuile affichera le reste des données
        }
        builder.build()
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}
