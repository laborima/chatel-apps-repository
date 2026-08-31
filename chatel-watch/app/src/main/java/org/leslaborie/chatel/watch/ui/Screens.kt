package org.leslaborie.chatel.watch.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.Icon
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.ToggleChip
import androidx.wear.compose.material.ToggleChipDefaults
import coil.compose.AsyncImage
import coil.request.CachePolicy
import coil.request.ImageRequest
import org.leslaborie.chatel.watch.data.Planner
import org.leslaborie.chatel.watch.data.SignalKApi
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val timeFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault())

private fun formatTime(instant: Instant?): String =
    instant?.let { timeFormatter.format(it) } ?: "--:--"

@Composable
private fun CenteredMessage(text: String, onRetry: (() -> Unit)? = null) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .clickable(enabled = onRetry != null) { onRetry?.invoke() },
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(text, textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 16.dp))
        if (onRetry != null) {
            Spacer(Modifier.height(8.dp))
            Text("Toucher pour réessayer", fontSize = 10.sp, color = MaterialTheme.colors.secondary)
        }
    }
}

@Composable
private fun LoadingIndicator() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}

@Composable
fun TideScreen(state: AppState, onRefresh: () -> Unit) {
    when (state) {
        is AppState.Loading -> LoadingIndicator()
        is AppState.Error -> CenteredMessage("⚠ ${state.message}", onRefresh)
        is AppState.Ready -> {
            val tide = state.data.tide
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .clickable { onRefresh() }
                    .padding(horizontal = 12.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("🌊 Marée", color = MaterialTheme.colors.primary, fontSize = 14.sp)
                Spacer(Modifier.height(4.dp))
                Text(
                    tide.heightNow?.let { "%.2f m".format(it) } ?: "-- m",
                    fontSize = 32.sp
                )
                Text(
                    if (tide.isRising) "↑ Montante" else "↓ Descendante",
                    fontSize = 13.sp,
                    color = MaterialTheme.colors.secondary
                )
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("PM ${formatTime(tide.timeHigh)}", fontSize = 12.sp)
                        Text(
                            tide.heightHigh?.let { "%.2f m".format(it) } ?: "",
                            fontSize = 10.sp,
                            color = MaterialTheme.colors.secondary
                        )
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("BM ${formatTime(tide.timeLow)}", fontSize = 12.sp)
                        Text(
                            tide.heightLow?.let { "%.2f m".format(it) } ?: "",
                            fontSize = 10.sp,
                            color = MaterialTheme.colors.secondary
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun WindScreen(state: AppState, onRefresh: () -> Unit) {
    when (state) {
        is AppState.Loading -> LoadingIndicator()
        is AppState.Error -> CenteredMessage("⚠ ${state.message}", onRefresh)
        is AppState.Ready -> {
            val wind = state.data.liveWind
            val speed = wind?.speedKnots ?: state.data.weather.windKnots
            val gust = wind?.gustKnots ?: state.data.weather.gustKnots
            val directionDeg = wind?.directionDeg ?: state.data.weather.windDirectionDeg
            val temperature = wind?.temperatureC ?: state.data.weather.temperatureC

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .clickable { onRefresh() }
                    .padding(horizontal = 12.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("💨 Vent", color = MaterialTheme.colors.primary, fontSize = 14.sp)
                Spacer(Modifier.height(4.dp))
                Text(
                    speed?.let { "%.0f nd".format(it) } ?: "-- nd",
                    fontSize = 32.sp
                )
                Text(
                    directionDeg?.let {
                        "${Planner.degreesToCardinal(it)} · %.0f°".format(it)
                    } ?: "Direction inconnue",
                    fontSize = 13.sp,
                    color = MaterialTheme.colors.secondary
                )
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Rafales", fontSize = 10.sp, color = MaterialTheme.colors.secondary)
                        Text(gust?.let { "%.0f nd".format(it) } ?: "--", fontSize = 13.sp)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Max jour", fontSize = 10.sp, color = MaterialTheme.colors.secondary)
                        Text(
                            state.data.liveWind?.maxGustTodayKnots?.let { "%.0f nd".format(it) } ?: "--",
                            fontSize = 13.sp
                        )
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Temp.", fontSize = 10.sp, color = MaterialTheme.colors.secondary)
                        Text(temperature?.let { "%.0f°C".format(it) } ?: "--", fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

@Composable
fun ActivitiesScreen(state: AppState, profileId: String, onRefresh: () -> Unit) {
    when (state) {
        is AppState.Loading -> LoadingIndicator()
        is AppState.Error -> CenteredMessage("⚠ ${state.message}", onRefresh)
        is AppState.Ready -> {
            val evaluations = remember(state, profileId) {
                Planner.recommend(profileId, state.data)
            }
            ScalingLazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = 24.dp, bottom = 24.dp, start = 8.dp, end = 8.dp)
            ) {
                item {
                    Text("🏄 Activités", color = MaterialTheme.colors.primary, fontSize = 14.sp)
                }
                if (evaluations.isEmpty()) {
                    item { Text("Aucune activité pour ce profil", fontSize = 12.sp) }
                }
                items(evaluations) { eval ->
                    val emoji = Planner.ACTIVITY_EMOJI[eval.activity.id] ?: "•"
                    Chip(
                        onClick = onRefresh,
                        modifier = Modifier.fillMaxWidth(),
                        colors = if (eval.isValid) {
                            ChipDefaults.primaryChipColors()
                        } else {
                            ChipDefaults.secondaryChipColors()
                        },
                        label = { Text("$emoji ${eval.activity.name}", fontSize = 12.sp) },
                        secondaryLabel = {
                            Text(
                                if (eval.isValid) "Possible · score ${eval.score}"
                                else eval.mainReason ?: "Indisponible",
                                fontSize = 10.sp
                            )
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun WebcamScreen() {
    var streamUrl by remember { mutableStateOf<String?>(null) }
    var videoFailed by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        streamUrl = runCatching { SignalKApi.fetchWebcamStreamUrl() }
            .getOrDefault(SignalKApi.WEBCAM_HLS_FALLBACK)
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val url = streamUrl
        when {
            !videoFailed && url == null -> CircularProgressIndicator()
            !videoFailed && url != null ->
                WebcamLivePlayer(url = url, onError = { videoFailed = true })
            else -> WebcamSnapshot()
        }
        Text(
            if (videoFailed) "Port de Châtelaillon" else "● LIVE · Port de Châtelaillon",
            fontSize = 10.sp,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 8.dp)
        )
    }
}

/** Lecture du flux HLS live (ExoPlayer), uniquement tant que la vue est affichée. */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@Composable
private fun WebcamLivePlayer(url: String, onError: () -> Unit) {
    val context = LocalContext.current
    val exoPlayer = remember(url) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            playWhenReady = true
            prepare()
        }
    }

    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                onError()
            }
        }
        exoPlayer.addListener(listener)
        onDispose {
            exoPlayer.removeListener(listener)
            exoPlayer.release()
        }
    }

    AndroidView(
        factory = { ctx ->
            PlayerView(ctx).apply {
                player = exoPlayer
                useController = false
                resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            }
        },
        modifier = Modifier.fillMaxSize()
    )
}

/** Mode secours : instantané rafraîchi toutes les 30 s. */
@Composable
private fun WebcamSnapshot() {
    val context = LocalContext.current
    var refreshKey by remember { mutableLongStateOf(System.currentTimeMillis()) }

    LaunchedEffect(Unit) {
        while (true) {
            kotlinx.coroutines.delay(30_000)
            refreshKey = System.currentTimeMillis()
        }
    }

    AsyncImage(
        model = ImageRequest.Builder(context)
            .data("${SignalKApi.WEBCAM_URL}?t=$refreshKey")
            .memoryCachePolicy(CachePolicy.DISABLED)
            .diskCachePolicy(CachePolicy.DISABLED)
            .crossfade(true)
            .build(),
        contentDescription = "Webcam du port de Châtelaillon",
        modifier = Modifier
            .fillMaxSize()
            .clickable { refreshKey = System.currentTimeMillis() },
        contentScale = ContentScale.Crop
    )
}

@Composable
fun SettingsScreen(
    state: AppState,
    selectedProfileId: String,
    onSelectProfile: (String) -> Unit
) {
    val profiles = (state as? AppState.Ready)?.data?.config?.profiles ?: emptyList()

    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 24.dp, bottom = 24.dp, start = 8.dp, end = 8.dp)
    ) {
        item {
            Text("⚙ Profil", color = MaterialTheme.colors.primary, fontSize = 14.sp)
        }
        if (profiles.isEmpty()) {
            item { Text("Profils indisponibles", fontSize = 12.sp) }
        }
        items(profiles) { profile ->
            ToggleChip(
                checked = profile.id == selectedProfileId,
                onCheckedChange = { checked -> if (checked) onSelectProfile(profile.id) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text(profile.name, fontSize = 13.sp) },
                toggleControl = {
                    Icon(
                        imageVector = ToggleChipDefaults.radioIcon(profile.id == selectedProfileId),
                        contentDescription = null
                    )
                }
            )
        }
    }
}
