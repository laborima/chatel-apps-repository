package org.leslaborie.chatel.watch.data

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlin.math.PI
import kotlin.math.max

/**
 * Client REST pour le serveur SignalK (signalk.example.org).
 * Aucune connexion persistante : uniquement des requêtes ponctuelles
 * quand l'app ou une tuile est affichée (pas de fond de batterie).
 */
object SignalKApi {

    const val WEBCAM_URL = "https://filmspv.viewsurf.com/chatelaillon02_live/media.jpg"

    // Flux vidéo live Viewsurf/Quanteec (webcam du port)
    private const val WEBCAM_SOURCE_ID = "61701253-3b92-4587-3334-3630-6d61-63-aa4f-03743e306fd3d"
    const val WEBCAM_HLS_FALLBACK =
        "https://ds2-cache.quanteec.com/contents/encodings/live/$WEBCAM_SOURCE_ID/master.m3u8"
    private val QUANTEEC_PLATFORMS = listOf(
        "https://platforms6.joada.net",
        "https://platforms7.joada.net",
        "https://platforms8.joada.net"
    )

    /** Au-delà, un extrême servi par `environment.tide.*` est considéré périmé. */
    private const val STALE_EXTREME_SECONDS = 24L * 3600L

    private const val MS_TO_KNOTS = 1.94384
    private const val KELVIN = 273.15
    private const val RAD_TO_DEG = 180.0 / PI

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private suspend fun get(url: String): String = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(url).header("Accept", "application/json").build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("HTTP ${response.code} pour $url")
            }
            response.body?.string() ?: throw IOException("Réponse vide pour $url")
        }
    }

    private suspend fun getBytes(url: String): ByteArray = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(url).build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("HTTP ${response.code} pour $url")
            }
            response.body?.bytes() ?: throw IOException("Réponse vide pour $url")
        }
    }

    private fun JSONObject.valueAt(key: String): Any? =
        optJSONObject(key)?.opt("value")

    private fun parseInstant(value: Any?): Instant? =
        (value as? String)?.let { runCatching { Instant.parse(it) }.getOrNull() }

    /**
     * Extrêmes de marée des prochains jours, via l'API Resources v2.
     *
     * Cette ressource est recalculée à chaque requête côté serveur : contrairement
     * aux chemins `environment.tide.*`, elle ne peut pas servir des valeurs
     * périmées. Une seule requête couvre ~7 jours, donc la montre peut ensuite
     * calculer la marée hors ligne (voir [TideMath]).
     */
    suspend fun fetchTideExtremes(baseUrl: String): List<TideExtreme> {
        val collection = JSONObject(get("$baseUrl/signalk/v2/api/resources/tides"))
        val extremes = mutableListOf<TideExtreme>()
        val seen = mutableSetOf<String>()

        for (key in collection.keys()) {
            val properties = collection.optJSONObject(key)?.optJSONObject("properties") ?: continue
            val array = properties.optJSONArray("extremes") ?: continue
            for (i in 0 until array.length()) {
                val e = array.getJSONObject(i)
                val time = parseInstant(e.opt("time")) ?: continue
                val value = e.optDouble("value").takeIf { !it.isNaN() } ?: continue
                val type = if (e.optString("type") == "High") TideExtremeType.HIGH else TideExtremeType.LOW
                // Les jours se recouvrent aux bornes : dédoublonner.
                if (!seen.add("$time|$type")) continue
                extremes.add(
                    TideExtreme(
                        type = type,
                        value = value,
                        time = time,
                        coefficient = e.opt("coefficient")?.let { (it as? Number)?.toInt() }
                    )
                )
            }
        }
        return extremes.sortedBy { it.time }
    }

    /**
     * État de la marée. On privilégie la liste complète des extrêmes ; les chemins
     * `environment.tide.*` ne servent que de repli, et sont écartés s'ils sont
     * périmés (le serveur continue de les servir même quand le plugin ne les met
     * plus à jour).
     */
    suspend fun fetchTide(baseUrl: String): TideInfo {
        val extremes = runCatching { fetchTideExtremes(baseUrl) }.getOrNull().orEmpty()
        if (extremes.isNotEmpty()) {
            val now = Instant.now()
            val height = TideMath.heightAt(extremes, now)
            if (height != null) {
                val high = TideMath.nextHigh(extremes, now)
                val low = TideMath.nextLow(extremes, now)
                return TideInfo(
                    heightNow = height,
                    heightHigh = high?.value,
                    heightLow = low?.value,
                    timeHigh = high?.time,
                    timeLow = low?.time,
                    stationName = null,
                    extremes = extremes,
                    coefficient = TideMath.coefficientAt(extremes, now)
                )
            }
        }

        val json = JSONObject(get("$baseUrl/signalk/v1/api/vessels/self/environment/tide"))
        val timeHigh = parseInstant(json.valueAt("timeHigh"))
        val timeLow = parseInstant(json.valueAt("timeLow"))
        val cutoff = Instant.now().minusSeconds(STALE_EXTREME_SECONDS)
        return TideInfo(
            heightNow = (json.valueAt("heightNow") as? Number)?.toDouble(),
            heightHigh = (json.valueAt("heightHigh") as? Number)?.toDouble(),
            heightLow = (json.valueAt("heightLow") as? Number)?.toDouble(),
            timeHigh = timeHigh?.takeIf { it.isAfter(cutoff) },
            timeLow = timeLow?.takeIf { it.isAfter(cutoff) },
            stationName = json.valueAt("stationName") as? String
        )
    }

    suspend fun fetchCurrentWeather(baseUrl: String, lat: Double, lon: Double): CurrentWeather {
        val array = JSONArray(get("$baseUrl/signalk/v2/api/weather/forecasts/point?lat=$lat&lon=$lon&count=1"))
        if (array.length() == 0) {
            throw IOException("Prévision météo vide")
        }
        val now = array.getJSONObject(0)
        val wind = now.optJSONObject("wind")
        val outside = now.optJSONObject("outside")
        return CurrentWeather(
            windKnots = wind?.optDouble("speedTrue")?.takeIf { !it.isNaN() }?.times(MS_TO_KNOTS),
            gustKnots = wind?.optDouble("gust")?.takeIf { !it.isNaN() }?.times(MS_TO_KNOTS),
            windDirectionDeg = wind?.optDouble("directionTrue")?.takeIf { !it.isNaN() }?.times(RAD_TO_DEG),
            temperatureC = outside?.optDouble("temperature")?.takeIf { !it.isNaN() }?.minus(KELVIN),
            visibilityKm = outside?.optDouble("horizontalVisibility")?.takeIf { !it.isNaN() }?.div(1000.0),
            description = now.optString("description").takeIf { it.isNotEmpty() }
        )
    }

    suspend fun fetchSunTimes(baseUrl: String, lat: Double, lon: Double): SunTimes {
        val array = JSONArray(get("$baseUrl/signalk/v2/api/weather/forecasts/daily?lat=$lat&lon=$lon&count=1"))
        if (array.length() == 0) {
            return SunTimes(null, null)
        }
        val sun = array.getJSONObject(0).optJSONObject("sun")
        return SunTimes(
            sunrise = parseInstant(sun?.opt("sunrise")),
            sunset = parseInstant(sun?.opt("sunset"))
        )
    }

    /**
     * Observations vent temps réel (station météo, pas la prévision).
     * Les noms de chemins varient selon le provider : on essaie les variantes.
     */
    suspend fun fetchLiveWind(baseUrl: String): LiveWind {
        val json = JSONObject(get("$baseUrl/signalk/v1/api/vessels/self/environment/wind"))

        fun firstValue(vararg keys: String): Double? =
            keys.firstNotNullOfOrNull { (json.valueAt(it) as? Number)?.toDouble() }

        val temperatureC = runCatching {
            val t = JSONObject(get("$baseUrl/signalk/v1/api/vessels/self/environment/outside/temperature"))
            (t.opt("value") as? Number)?.toDouble()?.minus(KELVIN)
        }.getOrNull()

        val directionRad = firstValue("directionTrue", "angleTrueGround", "directionGround")
        return LiveWind(
            speedKnots = firstValue("speedOverGround", "speedTrueGround", "speedTrue")?.times(MS_TO_KNOTS),
            gustKnots = firstValue("gustOverGround", "gustTrueGround", "gust")?.times(MS_TO_KNOTS),
            maxGustTodayKnots = firstValue("maxGustToday")?.times(MS_TO_KNOTS),
            directionDeg = directionRad?.times(RAD_TO_DEG)?.let { ((it % 360) + 360) % 360 },
            temperatureC = temperatureC
        )
    }

    suspend fun fetchActivitiesConfig(baseUrl: String): ActivitiesConfig {
        val json = JSONObject(get("$baseUrl/chatel-meteo-planner/activities/activities.json"))

        val profiles = mutableListOf<Profile>()
        val profilesJson = json.optJSONArray("profiles") ?: JSONArray()
        for (i in 0 until profilesJson.length()) {
            val p = profilesJson.getJSONObject(i)
            profiles.add(Profile(id = p.getString("id"), name = p.optString("name", p.getString("id"))))
        }

        val activities = mutableListOf<ActivityDef>()
        val activitiesJson = json.optJSONArray("activities") ?: JSONArray()
        for (i in 0 until activitiesJson.length()) {
            val a = activitiesJson.getJSONObject(i)
            val suitable = mutableListOf<String>()
            a.optJSONArray("suitable_for")?.let { arr ->
                for (j in 0 until arr.length()) suitable.add(arr.getString(j))
            }
            activities.add(
                ActivityDef(
                    id = a.getString("id"),
                    name = a.optString("name", a.getString("id")),
                    description = a.optString("description").takeIf { it.isNotEmpty() },
                    suitableFor = suitable,
                    idealConditions = a.optJSONObject("ideal_conditions") ?: JSONObject()
                )
            )
        }

        val locationJson = json.getJSONObject("planning_config").getJSONObject("location")
        val location = Location(
            name = locationJson.optString("name", "Châtelaillon"),
            latitude = locationJson.getDouble("latitude"),
            longitude = locationJson.getDouble("longitude")
        )

        return ActivitiesConfig(profiles, activities, location)
    }

    /** Récupère toutes les données nécessaires en parallèle. */
    suspend fun fetchAll(baseUrl: String): AppData = coroutineScope {
        val configDeferred = async { fetchActivitiesConfig(baseUrl) }
        val tideDeferred = async { fetchTide(baseUrl) }
        val config = configDeferred.await()
        val weatherDeferred = async {
            fetchCurrentWeather(baseUrl, config.location.latitude, config.location.longitude)
        }
        val sunDeferred = async {
            fetchSunTimes(baseUrl, config.location.latitude, config.location.longitude)
        }
        val liveWindDeferred = async {
            runCatching { fetchLiveWind(baseUrl) }.getOrNull()
        }
        AppData(
            config = config,
            tide = tideDeferred.await(),
            weather = weatherDeferred.await(),
            sun = sunDeferred.await(),
            liveWind = liveWindDeferred.await()
        )
    }

    /**
     * Résout l'URL du flux HLS live de la webcam via l'API Quanteec
     * (l'URL du CDN peut changer), avec repli sur la dernière URL connue.
     */
    suspend fun fetchWebcamStreamUrl(): String {
        for (platform in QUANTEEC_PLATFORMS) {
            val url = runCatching {
                JSONObject(get("$platform/api/videos/manifest/$WEBCAM_SOURCE_ID"))
                    .optString("m3u8")
                    .takeIf { it.isNotEmpty() }
            }.getOrNull()
            if (url != null) {
                return url
            }
        }
        return WEBCAM_HLS_FALLBACK
    }

    /**
     * Récupère l'image webcam et la redimensionne pour l'écran de la montre
     * (l'original fait ~400 Ko, trop lourd pour une tuile).
     */
    suspend fun fetchWebcamBitmap(maxWidthPx: Int = 450): Bitmap = withContext(Dispatchers.IO) {
        val bytes = getBytes("$WEBCAM_URL?t=${System.currentTimeMillis() / 60000}")
        val full = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            ?: throw IOException("Image webcam illisible")
        if (full.width <= maxWidthPx) {
            full
        } else {
            val scale = maxWidthPx.toDouble() / full.width
            val scaled = Bitmap.createScaledBitmap(
                full, maxWidthPx, max(1, (full.height * scale).toInt()), true
            )
            full.recycle()
            scaled
        }
    }
}
