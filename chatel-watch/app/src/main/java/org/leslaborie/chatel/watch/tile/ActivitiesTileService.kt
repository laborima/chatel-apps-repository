package org.leslaborie.chatel.watch.tile

import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.guava.future
import org.leslaborie.chatel.watch.data.Planner
import org.leslaborie.chatel.watch.data.Prefs
import org.leslaborie.chatel.watch.data.SignalKApi

/**
 * Tuile Activités : meilleure activité recommandée pour le profil
 * sélectionné dans les préférences de l'application.
 * Rafraîchie uniquement quand elle est affichée (fraîcheur 30 min).
 */
class ActivitiesTileService : TileService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onTileRequest(
        requestParams: RequestBuilders.TileRequest
    ): ListenableFuture<TileBuilders.Tile> = scope.future {
        val layout = try {
            val prefs = Prefs(this@ActivitiesTileService)
            val baseUrl = prefs.currentBaseUrl()
            val profileId = prefs.currentProfileId()
            val data = SignalKApi.fetchAll(baseUrl)
            val evaluations = Planner.recommend(profileId, data)
            val best = evaluations.firstOrNull { it.isValid }

            if (best != null) {
                val emoji = Planner.ACTIVITY_EMOJI[best.activity.id] ?: "•"
                rootBox(
                    packageName,
                    text("ACTIVITÉ · ${profileId.uppercase()}", 10f, COLOR_PRIMARY),
                    text(emoji, 28f),
                    text(best.activity.name, 14f),
                    text("Possible · score ${best.score}", 11f, COLOR_VALID)
                )
            } else {
                val top = evaluations.firstOrNull()
                rootBox(
                    packageName,
                    text("ACTIVITÉ · ${profileId.uppercase()}", 10f, COLOR_PRIMARY),
                    text("Aucune activité", 14f),
                    text(top?.mainReason ?: "Conditions défavorables", 11f, COLOR_INVALID)
                )
            }
        } catch (e: Exception) {
            rootBox(
                packageName,
                text("ACTIVITÉ", 10f, COLOR_PRIMARY),
                text("Serveur injoignable", 12f, COLOR_INVALID)
            )
        }
        tileOf(layout, resourcesVersion = "1", freshnessMillis = 30 * 60 * 1000L)
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
