package org.leslaborie.chatel.watch.tile

import android.util.Log
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
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

/**
 * Tuile Webcam : image du port de Châtelaillon, fournie par le relais
 * du serveur (déjà à la taille de la montre).
 *
 * Wear OS ne transmet plus l'entrée dans la tuile en temps réel : c'est la
 * fraîcheur de 30 s qui fait redemander la tuile tant qu'elle est affichée, et la
 * version des ressources, changée au même rythme, force le rechargement de
 * l'image. Toucher la tuile ouvre la page webcam de l'app, en direct.
 */
class WebcamTileService : TileService() {

    companion object {
        private const val REFRESH_MILLIS = 30_000L
        private const val TAG = "WebcamTile"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private fun currentVersion(): String =
        (System.currentTimeMillis() / REFRESH_MILLIS).toString()

    override fun onTileRequest(
        requestParams: RequestBuilders.TileRequest
    ): ListenableFuture<TileBuilders.Tile> = scope.future {
        val image = LayoutElementBuilders.Image.Builder()
            .setResourceId("webcam")
            .setWidth(expand())
            .setHeight(expand())
            .setContentScaleMode(LayoutElementBuilders.CONTENT_SCALE_MODE_CROP)
            .build()

        val box = LayoutElementBuilders.Box.Builder()
            .setWidth(expand())
            .setHeight(expand())
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setClickable(openAppClickable(packageName, page = "webcam"))
                    .build()
            )
            .addContent(image)
            .build()

        tileOf(box, resourcesVersion = currentVersion(), freshnessMillis = REFRESH_MILLIS)
    }

    override fun onTileResourcesRequest(
        requestParams: RequestBuilders.ResourcesRequest
    ): ListenableFuture<ResourceBuilders.Resources> = scope.future {
        // Rendre la version demandée : sinon le renderer redemande en boucle
        val builder = ResourceBuilders.Resources.Builder().setVersion(requestParams.version)
        try {
            // RGB_565 brut : seul format d'image inline garanti par le renderer
            val baseUrl = Prefs(this@WebcamTileService).currentBaseUrl()
            val bitmap = SignalKApi.fetchWebcamFrame(baseUrl, maxWidthPx = 320)
            builder.addIdToImageMapping("webcam", bitmapToImageResource(bitmap))
            bitmap.recycle()
        } catch (e: Exception) {
            // Image indisponible : la tuile restera vide jusqu'au prochain affichage
            Log.w(TAG, "webcam frame unavailable: ${e.message}")
        }
        builder.build()
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}
