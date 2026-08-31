package org.leslaborie.chatel.watch.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/**
 * Cache partagé par toutes les complications et tuiles.
 *
 * Sans lui, un cadran portant quatre complications déclencherait quatre requêtes
 * réseau simultanées à chaque rafraîchissement. Ici :
 *
 * - un seul appel réseau par fenêtre de fraîcheur, quel que soit le nombre de
 *   complications (verrou + réutilisation du résultat) ;
 * - la marée est recalculée **hors ligne** à partir des extrêmes déjà en cache
 *   (valables plusieurs jours), donc la complication marée ne coûte quasiment
 *   rien en batterie ;
 * - persistance sur disque, pour qu'un rendu après redémarrage affiche une
 *   valeur immédiatement au lieu d'attendre le réseau.
 */
object DataCache {

    /** Le vent temps réel n'est utile que frais. */
    private const val WIND_TTL_SECONDS = 8L * 60L

    /**
     * Les extrêmes couvrent ~7 jours : inutile de les redemander souvent. On
     * rafraîchit une fois par demi-journée, ou dès qu'ils ne couvrent plus l'heure
     * courante.
     */
    private const val EXTREMES_TTL_SECONDS = 12L * 3600L

    /** Une complication ne doit jamais faire attendre le cadran. */
    private const val NETWORK_BUDGET_MILLIS = 8_000L

    private const val PREFS_NAME = "chatel_cache"
    private const val KEY_EXTREMES = "tide_extremes"
    private const val KEY_EXTREMES_AT = "tide_extremes_at"
    private const val KEY_WIND = "live_wind"
    private const val KEY_WIND_AT = "live_wind_at"

    private val tideLock = Mutex()
    private val windLock = Mutex()

    @Volatile private var extremes: List<TideExtreme>? = null
    @Volatile private var extremesAt: Instant? = null
    @Volatile private var wind: LiveWind? = null
    @Volatile private var windAt: Instant? = null

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun isFresh(at: Instant?, ttlSeconds: Long): Boolean =
        at != null && at.isAfter(Instant.now().minusSeconds(ttlSeconds))

    // ---------------------------------------------------------------- marée

    /**
     * Extrêmes de marée, depuis la mémoire, le disque, puis le réseau.
     * Retourne les données périmées plutôt que rien si le réseau échoue.
     */
    suspend fun tideExtremes(context: Context, baseUrl: String): List<TideExtreme> {
        extremes?.let { cached ->
            if (isFresh(extremesAt, EXTREMES_TTL_SECONDS) && TideMath.covers(cached)) {
                return cached
            }
        }

        return tideLock.withLock {
            // Une autre complication a pu rafraîchir pendant l'attente du verrou.
            extremes?.let { cached ->
                if (isFresh(extremesAt, EXTREMES_TTL_SECONDS) && TideMath.covers(cached)) {
                    return@withLock cached
                }
            }

            if (extremes == null) {
                loadExtremesFromDisk(context)?.let { (list, at) ->
                    extremes = list
                    extremesAt = at
                    if (isFresh(at, EXTREMES_TTL_SECONDS) && TideMath.covers(list)) {
                        return@withLock list
                    }
                }
            }

            val fetched = withTimeoutOrNull(NETWORK_BUDGET_MILLIS) {
                runCatching { SignalKApi.fetchTideExtremes(baseUrl) }.getOrNull()
            }

            if (!fetched.isNullOrEmpty()) {
                extremes = fetched
                extremesAt = Instant.now()
                saveExtremesToDisk(context, fetched)
                fetched
            } else {
                // Mieux vaut une marée légèrement datée qu'un cadran vide.
                extremes.orEmpty()
            }
        }
    }

    /** État de la marée, calculé localement à partir des extrêmes en cache. */
    suspend fun tide(context: Context, baseUrl: String, at: Instant = Instant.now()): TideSnapshot? {
        val list = tideExtremes(context, baseUrl)
        val height = TideMath.heightAt(list, at) ?: return null
        return TideSnapshot(
            heightMeters = height,
            isRising = TideMath.isRising(list, at) ?: return null,
            nextHigh = TideMath.nextHigh(list, at),
            nextLow = TideMath.nextLow(list, at),
            coefficient = TideMath.coefficientAt(list, at),
            cycleRange = TideMath.currentCycleRange(list, at)
        )
    }

    // ----------------------------------------------------------------- vent

    /** Vent temps réel, une requête au plus toutes les [WIND_TTL_SECONDS]. */
    suspend fun liveWind(context: Context, baseUrl: String): LiveWind? {
        wind?.let { if (isFresh(windAt, WIND_TTL_SECONDS)) return it }

        return windLock.withLock {
            wind?.let { if (isFresh(windAt, WIND_TTL_SECONDS)) return@withLock it }

            if (wind == null) {
                loadWindFromDisk(context)?.let { (value, at) ->
                    wind = value
                    windAt = at
                    if (isFresh(at, WIND_TTL_SECONDS)) return@withLock value
                }
            }

            val fetched = withTimeoutOrNull(NETWORK_BUDGET_MILLIS) {
                runCatching { SignalKApi.fetchLiveWind(baseUrl) }.getOrNull()
            }

            if (fetched?.speedKnots != null) {
                wind = fetched
                windAt = Instant.now()
                saveWindToDisk(context, fetched)
                fetched
            } else {
                wind
            }
        }
    }

    /** Âge de la mesure de vent en cache, pour signaler une valeur datée. */
    fun windAge(): java.time.Duration? =
        windAt?.let { java.time.Duration.between(it, Instant.now()) }

    // -------------------------------------------------------------- disque

    private fun saveExtremesToDisk(context: Context, list: List<TideExtreme>) {
        val array = JSONArray()
        list.forEach { e ->
            array.put(
                JSONObject().apply {
                    put("type", e.type.name)
                    put("value", e.value)
                    put("time", e.time.toString())
                    e.coefficient?.let { put("coefficient", it) }
                }
            )
        }
        prefs(context).edit()
            .putString(KEY_EXTREMES, array.toString())
            .putString(KEY_EXTREMES_AT, Instant.now().toString())
            .apply()
    }

    private fun loadExtremesFromDisk(context: Context): Pair<List<TideExtreme>, Instant>? {
        val p = prefs(context)
        val raw = p.getString(KEY_EXTREMES, null) ?: return null
        val at = p.getString(KEY_EXTREMES_AT, null)?.let {
            runCatching { Instant.parse(it) }.getOrNull()
        } ?: return null

        return runCatching {
            val array = JSONArray(raw)
            val list = (0 until array.length()).mapNotNull { i ->
                val o = array.getJSONObject(i)
                val time = runCatching { Instant.parse(o.getString("time")) }.getOrNull()
                    ?: return@mapNotNull null
                TideExtreme(
                    type = TideExtremeType.valueOf(o.getString("type")),
                    value = o.getDouble("value"),
                    time = time,
                    coefficient = if (o.has("coefficient")) o.getInt("coefficient") else null
                )
            }
            list to at
        }.getOrNull()?.takeIf { it.first.isNotEmpty() }
    }

    private fun saveWindToDisk(context: Context, value: LiveWind) {
        val json = JSONObject().apply {
            value.speedKnots?.let { put("speed", it) }
            value.gustKnots?.let { put("gust", it) }
            value.maxGustTodayKnots?.let { put("maxGust", it) }
            value.directionDeg?.let { put("direction", it) }
            value.temperatureC?.let { put("temperature", it) }
        }
        prefs(context).edit()
            .putString(KEY_WIND, json.toString())
            .putString(KEY_WIND_AT, Instant.now().toString())
            .apply()
    }

    private fun loadWindFromDisk(context: Context): Pair<LiveWind, Instant>? {
        val p = prefs(context)
        val raw = p.getString(KEY_WIND, null) ?: return null
        val at = p.getString(KEY_WIND_AT, null)?.let {
            runCatching { Instant.parse(it) }.getOrNull()
        } ?: return null

        return runCatching {
            val o = JSONObject(raw)
            fun num(key: String): Double? = if (o.has(key)) o.getDouble(key) else null
            LiveWind(
                speedKnots = num("speed"),
                gustKnots = num("gust"),
                maxGustTodayKnots = num("maxGust"),
                directionDeg = num("direction"),
                temperatureC = num("temperature")
            ) to at
        }.getOrNull()
    }
}

/** Instantané de marée prêt à afficher, calculé sans réseau. */
data class TideSnapshot(
    val heightMeters: Double,
    val isRising: Boolean,
    val nextHigh: TideExtreme?,
    val nextLow: TideExtreme?,
    val coefficient: Int?,
    /** Bornes (BM, PM) du cycle en cours, pour une jauge. */
    val cycleRange: Pair<Double, Double>?
)
