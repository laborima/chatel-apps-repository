package org.leslaborie.chatel.watch.tile

import android.graphics.Bitmap
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.DimensionBuilders.sp
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.TileBuilders
import java.nio.ByteBuffer

internal const val COLOR_PRIMARY = 0xFF67E8F9.toInt()
internal const val COLOR_WHITE = 0xFFFFFFFF.toInt()
internal const val COLOR_MUTED = 0xFF94A3B8.toInt()
internal const val COLOR_VALID = 0xFF4ADE80.toInt()
internal const val COLOR_INVALID = 0xFFF87171.toInt()

internal fun text(
    content: String,
    sizeSp: Float,
    color: Int = COLOR_WHITE
): LayoutElementBuilders.Text =
    LayoutElementBuilders.Text.Builder()
        .setText(content)
        .setFontStyle(
            LayoutElementBuilders.FontStyle.Builder()
                .setSize(sp(sizeSp))
                .setColor(argb(color))
                .build()
        )
        .build()

/** Clic qui ouvre l'application. */
internal fun openAppClickable(packageName: String): ModifiersBuilders.Clickable =
    ModifiersBuilders.Clickable.Builder()
        .setId("open_app")
        .setOnClick(
            ActionBuilders.LaunchAction.Builder()
                .setAndroidActivity(
                    ActionBuilders.AndroidActivity.Builder()
                        .setPackageName(packageName)
                        .setClassName("$packageName.ui.MainActivity")
                        .build()
                )
                .build()
        )
        .build()

/** Boîte plein écran cliquable qui ouvre l'application. */
internal fun rootBox(
    packageName: String,
    vararg contents: LayoutElementBuilders.LayoutElement
): LayoutElementBuilders.Box {
    val column = LayoutElementBuilders.Column.Builder()
        .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
        .apply { contents.forEach { addContent(it) } }
        .build()

    val openApp = openAppClickable(packageName)

    return LayoutElementBuilders.Box.Builder()
        .setWidth(expand())
        .setHeight(expand())
        .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
        .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
        .setModifiers(
            ModifiersBuilders.Modifiers.Builder()
                .setClickable(openApp)
                .build()
        )
        .addContent(column)
        .build()
}

/**
 * Convertit un Bitmap en ressource d'image inline au format RGB_565 brut,
 * le seul format garanti par le moteur de rendu des tuiles (les formats
 * compressés PNG/JPEG ne sont pas affichés sur toutes les montres).
 */
internal fun bitmapToImageResource(bitmap: Bitmap): ResourceBuilders.ImageResource {
    val rgb565 = if (bitmap.config == Bitmap.Config.RGB_565) {
        bitmap
    } else {
        bitmap.copy(Bitmap.Config.RGB_565, false)
    }
    val buffer = ByteBuffer.allocate(rgb565.byteCount)
    rgb565.copyPixelsToBuffer(buffer)
    return ResourceBuilders.ImageResource.Builder()
        .setInlineResource(
            ResourceBuilders.InlineImageResource.Builder()
                .setData(buffer.array())
                .setWidthPx(rgb565.width)
                .setHeightPx(rgb565.height)
                .setFormat(ResourceBuilders.IMAGE_FORMAT_RGB_565)
                .build()
        )
        .build()
}

internal fun tileOf(
    layout: LayoutElementBuilders.LayoutElement,
    resourcesVersion: String,
    freshnessMillis: Long
): TileBuilders.Tile =
    TileBuilders.Tile.Builder()
        .setResourcesVersion(resourcesVersion)
        .setFreshnessIntervalMillis(freshnessMillis)
        .setTileTimeline(
            TimelineBuilders.Timeline.Builder()
                .addTimelineEntry(
                    TimelineBuilders.TimelineEntry.Builder()
                        .setLayout(
                            LayoutElementBuilders.Layout.Builder()
                                .setRoot(layout)
                                .build()
                        )
                        .build()
                )
                .build()
        )
        .build()
