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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.material.HorizontalPageIndicator
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PageIndicatorState
import kotlinx.coroutines.launch
import org.leslaborie.chatel.watch.data.AppData
import org.leslaborie.chatel.watch.data.Prefs
import org.leslaborie.chatel.watch.data.SignalKApi

sealed interface AppState {
    data object Loading : AppState
    data class Error(val message: String) : AppState
    data class Ready(val data: AppData) : AppState
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                ChatelWatchApp()
            }
        }
    }
}

@Composable
fun ChatelWatchApp() {
    val context = LocalContext.current
    val prefs = remember { Prefs(context) }
    val scope = rememberCoroutineScope()

    val profileId by prefs.profileId.collectAsStateWithLifecycle(initialValue = Prefs.DEFAULT_PROFILE)
    val baseUrl by prefs.baseUrl.collectAsStateWithLifecycle(initialValue = Prefs.DEFAULT_BASE_URL)

    var refreshTick by remember { mutableIntStateOf(0) }
    var state by remember { mutableStateOf<AppState>(AppState.Loading) }

    LaunchedEffect(baseUrl, refreshTick) {
        state = AppState.Loading
        state = try {
            AppState.Ready(SignalKApi.fetchAll(baseUrl))
        } catch (e: Exception) {
            AppState.Error(e.message ?: "Erreur réseau")
        }
    }

    val pageCount = 5
    val pagerState = rememberPagerState { pageCount }
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

    Box(modifier = Modifier.fillMaxSize()) {
        HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
            when (page) {
                0 -> TideScreen(state, onRefresh)
                1 -> WindScreen(state, onRefresh)
                2 -> ActivitiesScreen(state, profileId, onRefresh)
                3 -> WebcamScreen()
                4 -> SettingsScreen(
                    state = state,
                    selectedProfileId = profileId,
                    onSelectProfile = { id -> scope.launch { prefs.setProfileId(id) } }
                )
            }
        }
        HorizontalPageIndicator(pageIndicatorState = indicatorState)
    }
}
