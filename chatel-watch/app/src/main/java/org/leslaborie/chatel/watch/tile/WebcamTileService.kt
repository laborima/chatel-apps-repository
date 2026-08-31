package org.leslaborie.chatel.watch.tile

import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.tiles.EventBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
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
import org.leslaborie.chatel.watch.data.SignalKApi

/**
 * Tuile Webcam : instantané du port de Châtelaillon, redimensionné
 * pour la montre.
 *
 * Temps réel : tant que la tuile est affichée (onTileEnterEvent),
 * une boucle demande un rafraîchissement toutes les 30 s ; la version
 * des ressources change à chaque tick pour forcer le rechargement de
 * l'image. La boucle s'arrête dès que la tuile n'est plus visible.
 */
class WebcamTileService : TileService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var liveRefreshJob: Job? = null

    // La version des ressources pilote le rechargement de l'image
    // (granularité 30 s, alignée sur la boucle de rafraîchissement)
    private fun currentVersion(): String =
        (System.currentTimeMillis() / 30_000L).toString()

    override fun onTileEnterEvent(requestParams: EventBuilders.TileEnterEvent) {
        liveRefreshJob?.cancel()
        liveRefreshJob = scope.launch {
            while (isActive) {
                delay(30_000)
                getUpdater(this@WebcamTileService).requestUpdate(WebcamTileService::class.java)
            }
        }
    }

    override fun onTileLeaveEvent(requestParams: EventBuilders.TileLeaveEvent) {
        liveRefreshJob?.cancel()
        liveRefreshJob = null
    }

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
            .addContent(image)
            .build()

        tileOf(box, resourcesVersion = currentVersion(), freshnessMillis = 5 * 60 * 1000L)
    }

    override fun onTileResourcesRequest(
        requestParams: RequestBuilders.ResourcesRequest
    ): ListenableFuture<ResourceBuilders.Resources> = scope.future {
        val builder = ResourceBuilders.Resources.Builder().setVersion(currentVersion())
        try {
            // RGB_565 brut : seul format d'image inline garanti par le renderer
            val bitmap = SignalKApi.fetchWebcamBitmap(maxWidthPx = 320)
            builder.addIdToImageMapping("webcam", bitmapToImageResource(bitmap))
            bitmap.recycle()
        } catch (e: Exception) {
            // Image indisponible : la tuile restera vide jusqu'au prochain affichage
        }
        builder.build()
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}
