package org.leslaborie.chatel.watch.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.currentStateAsState
import androidx.wear.compose.material.HorizontalPageIndicator
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PageIndicatorState
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.TimeText
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.leslaborie.chatel.watch.data.AppData
import org.leslaborie.chatel.watch.data.Prefs
import org.leslaborie.chatel.watch.data.SignalKApi
import org.leslaborie.chatel.watch.tile.EXTRA_PAGE
import java.time.Instant

/**
 * État affiché : les dernières données restent visibles pendant une mise à jour
 * ou après une erreur réseau, au lieu de repasser par un écran de chargement.
 */
data class ScreenState(
    val data: Data? = null,
    val refreshing: Boolean = false,
    val error: String? = null
) {
    data class Data(val app: AppData, val at: Instant)

    val updatedAt: Instant? get() = data?.at
}

/** Dernières données de la session : rouvrir l'app les affiche immédiatement. */
private object LastData {
    @Volatile var value: ScreenState.Data? = null
}

/** Rafraîchissement automatique tant que l'app est au premier plan. */
private const val AUTO_REFRESH_MILLIS = 2 * 60 * 1000L

private const val WEBCAM_PAGE = 3

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Ouverte depuis la tuile webcam : arriver directement sur le direct
        val initialPage = if (intent.getStringExtra(EXTRA_PAGE) == "webcam") WEBCAM_PAGE else 0
        setContent {
            MaterialTheme {
                ChatelWatchApp(initialPage)
            }
        }
    }
}

@Composable
fun ChatelWatchApp(initialPage: Int = 0) {
    val context = LocalContext.current
    val prefs = remember { Prefs(context) }
    val scope = rememberCoroutineScope()

    val profileId by prefs.profileId.collectAsStateWithLifecycle(initialValue = Prefs.DEFAULT_PROFILE)
    val baseUrl by prefs.baseUrl.collectAsStateWithLifecycle(initialValue = Prefs.DEFAULT_BASE_URL)
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    val resumed = lifecycleState.isAtLeast(Lifecycle.State.RESUMED)

    var refreshTick by remember { mutableIntStateOf(0) }
    var screen by remember { mutableStateOf(ScreenState(data = LastData.value)) }

    LaunchedEffect(baseUrl, refreshTick, resumed) {
        if (!resumed) return@LaunchedEffect
        while (true) {
            screen = screen.copy(refreshing = true)
            screen = try {
                val data = ScreenState.Data(SignalKApi.fetchAll(baseUrl), Instant.now())
                LastData.value = data
                ScreenState(data = data)
            } catch (e: Exception) {
                screen.copy(refreshing = false, error = e.message ?: "Erreur réseau")
            }
            delay(AUTO_REFRESH_MILLIS)
        }
    }

    val pageCount = 5
    val pagerState = rememberPagerState(initialPage = initialPage) { pageCount }
    val indicatorState = remember(pagerState) {
        object : PageIndicatorState {
            override val pageOffset: Float
                get() = pagerState.currentPageOffsetFraction
            override val selectedPage: Int
                get() = pagerState.currentPage
            override val pageCount: Int
                get() = pageCount
        }
    }

    val onRefresh: () -> Unit = { refreshTick++ }

    Scaffold(
        timeText = { if (pagerState.currentPage != WEBCAM_PAGE) TimeText() }
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                when (page) {
                    0 -> TideScreen(screen, onRefresh)
                    1 -> WindScreen(screen, onRefresh)
                    2 -> ActivitiesScreen(screen, profileId, onRefresh)
                    WEBCAM_PAGE -> WebcamScreen(
                        baseUrl = baseUrl,
                        active = resumed && pagerState.currentPage == WEBCAM_PAGE
                    )
                    4 -> SettingsScreen(
                        screen = screen,
                        selectedProfileId = profileId,
                        onSelectProfile = { id -> scope.launch { prefs.setProfileId(id) } }
                    )
                }
            }
            HorizontalPageIndicator(pageIndicatorState = indicatorState)
        }
    }
}
