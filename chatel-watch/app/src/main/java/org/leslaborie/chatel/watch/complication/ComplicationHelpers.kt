package org.leslaborie.chatel.watch.complication

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.wear.watchface.complications.data.PlainComplicationText
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

internal val HOUR_MINUTE: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

internal fun Instant.atWatch(): String =
    HOUR_MINUTE.format(atZone(ZoneId.systemDefault()))

internal fun plain(text: String): PlainComplicationText =
    PlainComplicationText.Builder(text).build()

/** Rose des vents en 8 secteurs, suffisant sur un cadran. */
internal fun cardinal(degrees: Double): String {
    val points = listOf("N", "NE", "E", "SE", "S", "SO", "O", "NO")
    val normalized = ((degrees % 360) + 360) % 360
    return points[((normalized / 45.0).roundToInt()) % 8]
}

/** Flèche pointant dans la direction vers laquelle le vent souffle. */
internal fun windArrow(degrees: Double): String {
    val arrows = listOf("↓", "↙", "←", "↖", "↑", "↗", "→", "↘")
    val normalized = ((degrees % 360) + 360) % 360
    return arrows[((normalized / 45.0).roundToInt()) % 8]
}

/** Ouvre l'application quand on touche la complication. */
internal fun openAppIntent(context: Context): PendingIntent {
    val intent = Intent().apply {
        component = ComponentName(context, "org.leslaborie.chatel.watch.ui.MainActivity")
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
    }
    return PendingIntent.getActivity(
        context,
        0,
        intent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
}
