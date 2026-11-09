package org.leslaborie.chatel.watch.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
import kotlinx.coroutines.delay
import org.leslaborie.chatel.watch.data.Planner
import org.leslaborie.chatel.watch.data.SignalKApi
import org.leslaborie.chatel.watch.data.TideMath
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val timeFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault())

private fun formatTime(instant: Instant?): String =
    instant?.let { timeFormatter.format(it) } ?: "--:--"

private val TideColor = Color(0xFF4FC3F7)
private val CalmWind = Color(0xFF81C784)
private val FreshWind = Color(0xFFFFD54F)
private val StrongWind = Color(0xFFFF8A65)

/** Couleur du vent : vert jusqu'à 12 nd, jaune jusqu'à 20 nd, orange au-delà. */
private fun windColor(knots: Double?): Color = when {
    knots == null -> Color.White
    knots < 12 -> CalmWind
    knots < 20 -> FreshWind
    else -> StrongWind
}

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

/**
 * Pied de page commun : âge des données, ou état de la mise à jour en cours.
 * Les données restent affichées pendant le rafraîchissement.
 */
@Composable
private fun UpdateFooter(screen: ScreenState, modifier: Modifier = Modifier) {
    val text = when {
        screen.refreshing -> "Mise à jour…"
        screen.error != null -> "⚠ Hors ligne · ${ageLabel(screen.updatedAt)}"
        else -> ageLabel(screen.updatedAt)
    }
    Text(
        text,
        fontSize = 10.sp,
        color = if (screen.error != null) StrongWind else MaterialTheme.colors.onSurfaceVariant,
        modifier = modifier
    )
}

private fun ageLabel(at: Instant?): String {
    if (at == null) return ""
    val minutes = Duration.between(at, Instant.now()).toMinutes()
    return if (minutes < 1) "À l'instant" else "Il y a $minutes min"
}

/** Squelette des écrans de données : chargement, erreur sans données, puis contenu. */
@Composable
private fun DataScreen(screen: ScreenState, onRefresh: () -> Unit, content: @Composable (ScreenState.Data) -> Unit) {
    val data = screen.data
    when {
        data != null -> content(data)
        screen.error != null -> CenteredMessage("⚠ ${screen.error}", onRefresh)
        else -> LoadingIndicator()
    }
}

@Composable
fun TideScreen(screen: ScreenState, onRefresh: () -> Unit) {
    DataScreen(screen, onRefresh) { data ->
        val tide = data.app.tide
        val now = Instant.now()
        val extremes = tide.extremes
        val height = tide.heightNow
        val range = if (extremes.isNotEmpty()) TideMath.currentCycleRange(extremes, now) else null
        val rising = if (extremes.isNotEmpty()) TideMath.isRising(extremes, now) ?: tide.isRising else tide.isRising
        val progress = if (height != null && range != null) {
            ((height - range.first) / (range.second - range.first)).toFloat().coerceIn(0f, 1f)
        } else {
            null
        }

        Box(modifier = Modifier.fillMaxSize().clickable { onRefresh() }) {
            // Jauge sur le bord : vide à la basse mer, pleine à la pleine mer
            if (progress != null) {
                CircularProgressIndicator(
                    progress = progress,
                    modifier = Modifier.fillMaxSize().padding(4.dp),
                    startAngle = 135f,
                    endAngle = 45f,
                    indicatorColor = TideColor,
                    strokeWidth = 5.dp
                )
            }
            Column(
                modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Marée", color = TideColor, fontSize = 13.sp)
                Text(
                    height?.let { "%.2f m".format(it) } ?: "-- m",
                    fontSize = 34.sp,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    buildString {
                        append(if (rising) "↑ Montante" else "↓ Descendante")
                        tide.coefficient?.let { append(" · coef $it") }
                    },
                    fontSize = 12.sp,
                    color = MaterialTheme.colors.secondary
                )
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    ExtremeLabel("PM", tide.timeHigh, tide.heightHigh)
                    ExtremeLabel("BM", tide.timeLow, tide.heightLow)
                }
                Spacer(Modifier.height(6.dp))
                UpdateFooter(screen)
            }
        }
    }
}

@Composable
private fun ExtremeLabel(label: String, time: Instant?, height: Double?) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text("$label ${formatTime(time)}", fontSize = 13.sp)
        Text(
            height?.let { "%.2f m".format(it) } ?: "",
            fontSize = 10.sp,
            color = MaterialTheme.colors.secondary
        )
    }
}

@Composable
fun WindScreen(screen: ScreenState, onRefresh: () -> Unit) {
    DataScreen(screen, onRefresh) { data ->
        val app = data.app
        val wind = app.liveWind
        val speed = wind?.speedKnots ?: app.weather.windKnots
        val gust = wind?.gustKnots ?: app.weather.gustKnots
        val directionDeg = wind?.directionDeg ?: app.weather.windDirectionDeg
        val temperature = wind?.temperatureC ?: app.weather.temperatureC

        Column(
            modifier = Modifier
                .fillMaxSize()
                .clickable { onRefresh() }
                .padding(horizontal = 14.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Vent", color = MaterialTheme.colors.primary, fontSize = 13.sp)
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (directionDeg != null) {
                    // La direction est celle d'où vient le vent : la flèche montre où il va
                    Text(
                        "↑",
                        fontSize = 26.sp,
                        color = windColor(speed),
                        modifier = Modifier.rotate((directionDeg + 180).toFloat())
                    )
                    Spacer(Modifier.size(6.dp))
                }
                Text(
                    speed?.let { "%.0f nd".format(it) } ?: "-- nd",
                    fontSize = 34.sp,
                    fontWeight = FontWeight.Medium,
                    color = windColor(speed)
                )
            }
            Text(
                directionDeg?.let { "${Planner.degreesToCardinal(it)} · %.0f°".format(it) } ?: "Direction inconnue",
                fontSize = 12.sp,
                color = MaterialTheme.colors.secondary
            )
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                WindStat("Rafales", gust?.let { "%.0f".format(it) }, windColor(gust))
                WindStat("Max jour", wind?.maxGustTodayKnots?.let { "%.0f".format(it) }, windColor(wind?.maxGustTodayKnots))
                WindStat("Temp.", temperature?.let { "%.0f°".format(it) }, Color.White)
            }
            Spacer(Modifier.height(6.dp))
            UpdateFooter(screen)
        }
    }
}

@Composable
private fun WindStat(label: String, value: String?, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, fontSize = 10.sp, color = MaterialTheme.colors.secondary)
        Text(value ?: "--", fontSize = 14.sp, color = color)
    }
}

@Composable
fun ActivitiesScreen(screen: ScreenState, profileId: String, onRefresh: () -> Unit) {
    DataScreen(screen, onRefresh) { data ->
        val evaluations = remember(data, profileId) {
            Planner.recommend(profileId, data.app)
        }
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = 28.dp, bottom = 28.dp, start = 8.dp, end = 8.dp)
        ) {
            item {
                Text("Activités", color = MaterialTheme.colors.primary, fontSize = 13.sp)
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
            item { UpdateFooter(screen) }
        }
    }
}

/**
 * Webcam du port : image du relais du serveur, renouvelée toutes les 2 s tant que
 * la page est visible ([active]). Hors de la page, plus aucune requête.
 */
@Composable
fun WebcamScreen(baseUrl: String, active: Boolean) {
    var frame by remember { mutableStateOf<Bitmap?>(null) }
    var frameAt by remember { mutableLongStateOf(0L) }
    var failed by remember { mutableStateOf(false) }

    LaunchedEffect(baseUrl, active) {
        while (active) {
            val result = runCatching { SignalKApi.fetchWebcamFrame(baseUrl) }
            result.onSuccess {
                frame = it
                frameAt = System.currentTimeMillis()
                failed = false
            }
            result.onFailure { failed = true }
            delay(if (result.isSuccess) 2_000 else 5_000)
        }
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val current = frame
        if (current != null) {
            Image(
                bitmap = current.asImageBitmap(),
                contentDescription = "Webcam du port de Châtelaillon",
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
        } else if (failed) {
            CenteredMessage("Webcam indisponible")
        } else {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator()
                Spacer(Modifier.height(8.dp))
                Text("Démarrage du direct…", fontSize = 11.sp)
            }
        }
        val stale = current != null && (failed || System.currentTimeMillis() - frameAt > 10_000)
        Text(
            if (stale) "Port de Châtelaillon · en pause" else "● DIRECT · Port de Châtelaillon",
            fontSize = 10.sp,
            color = if (stale) Color.White else StrongWind,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 10.dp)
        )
    }
}

@Composable
fun SettingsScreen(
    screen: ScreenState,
    selectedProfileId: String,
    onSelectProfile: (String) -> Unit
) {
    val profiles = screen.data?.app?.config?.profiles ?: emptyList()

    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 28.dp, bottom = 28.dp, start = 8.dp, end = 8.dp)
    ) {
        item {
            Text("Profil", color = MaterialTheme.colors.primary, fontSize = 13.sp)
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
