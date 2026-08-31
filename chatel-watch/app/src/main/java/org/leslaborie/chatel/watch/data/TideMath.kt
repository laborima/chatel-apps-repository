package org.leslaborie.chatel.watch.data

import java.time.Instant
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos

/**
 * Interpolation de la hauteur d'eau à partir de la liste des extrêmes.
 *
 * Tout est calculé **localement** : une fois les extrêmes récupérés (ils sont
 * valables plusieurs jours), la montre n'a plus besoin du réseau pour afficher
 * la marée. C'est ce qui permet à la complication marée de se rafraîchir sans
 * consommer de batterie.
 */
object TideMath {

    /** Intervalle moyen entre deux extrêmes d'une marée semi-diurne (M2 / 2). */
    private const val MEAN_HALF_CYCLE_SECONDS = 6 * 3600L + 12 * 60L + 30L

    /**
     * Hauteur entre deux extrêmes consécutifs, modèle harmonique (cosinus).
     * C'est le modèle physique, et une version lissée de la règle des douzièmes.
     */
    private fun harmonic(startHeight: Double, endHeight: Double, progress: Double): Double {
        val p = progress.coerceIn(0.0, 1.0)
        return startHeight + (endHeight - startHeight) * ((1 - cos(PI * p)) / 2)
    }

    /**
     * Hauteur d'eau à un instant donné.
     *
     * @return la hauteur en mètres, ou null si les extrêmes ne permettent pas
     *         de conclure (liste vide, ou instant hors de la fenêtre couverte).
     */
    fun heightAt(extremes: List<TideExtreme>, at: Instant = Instant.now()): Double? {
        if (extremes.isEmpty()) return null
        val sorted = extremes.sortedBy { it.time }

        val prev = sorted.lastOrNull { !it.time.isAfter(at) }
        val next = sorted.firstOrNull { !it.time.isBefore(at) }

        if (prev != null && next != null) {
            val span = next.time.epochSecond - prev.time.epochSecond
            if (span <= 0) return prev.value
            val progress = (at.epochSecond - prev.time.epochSecond).toDouble() / span
            return harmonic(prev.value, next.value, progress)
        }

        // Hors fenêtre couverte : on se rabat sur l'extrême le plus proche plutôt
        // que d'extrapoler un cycle fictif. L'appelant doit rafraîchir.
        return (prev ?: next)?.value
    }

    /** Prochaine pleine mer à partir de [at]. */
    fun nextHigh(extremes: List<TideExtreme>, at: Instant = Instant.now()): TideExtreme? =
        extremes.filter { it.type == TideExtremeType.HIGH && !it.time.isBefore(at) }.minByOrNull { it.time }

    /** Prochaine basse mer à partir de [at]. */
    fun nextLow(extremes: List<TideExtreme>, at: Instant = Instant.now()): TideExtreme? =
        extremes.filter { it.type == TideExtremeType.LOW && !it.time.isBefore(at) }.minByOrNull { it.time }

    /** La marée monte si le prochain extrême est une pleine mer. */
    fun isRising(extremes: List<TideExtreme>, at: Instant = Instant.now()): Boolean? =
        extremes.filter { !it.time.isBefore(at) }.minByOrNull { it.time }?.let {
            it.type == TideExtremeType.HIGH
        }

    /**
     * Coefficient de marée en vigueur : celui de la pleine mer la plus proche
     * (le coefficient n'est publié que sur les pleines mers).
     */
    fun coefficientAt(extremes: List<TideExtreme>, at: Instant = Instant.now()): Int? =
        extremes
            .filter { it.type == TideExtremeType.HIGH && it.coefficient != null }
            .minByOrNull { abs(it.time.epochSecond - at.epochSecond) }
            ?.coefficient

    /**
     * Bornes du cycle en cours (extrême précédent et suivant), pour afficher la
     * marée comme une jauge entre BM et PM.
     */
    fun currentCycleRange(extremes: List<TideExtreme>, at: Instant = Instant.now()): Pair<Double, Double>? {
        val sorted = extremes.sortedBy { it.time }
        val prev = sorted.lastOrNull { !it.time.isAfter(at) }
        val next = sorted.firstOrNull { !it.time.isBefore(at) }
        if (prev == null || next == null) return null
        val low = minOf(prev.value, next.value)
        val high = maxOf(prev.value, next.value)
        return if (high > low) low to high else null
    }

    /** Vrai si les extrêmes couvrent encore [at] : sinon il faut rafraîchir. */
    fun covers(extremes: List<TideExtreme>, at: Instant = Instant.now()): Boolean {
        if (extremes.size < 2) return false
        val sorted = extremes.sortedBy { it.time }
        return !at.isBefore(sorted.first().time) && !at.isAfter(sorted.last().time)
    }

/**
     * Écart signé, en minutes, avec l'extrême le plus proche du type donné.
     * Négatif avant l'extrême, positif après.
     *
     * Permet de rattacher une activité à un moment du cycle ("1 h autour de la
     * basse mer") plutôt qu'à une hauteur : la même hauteur se produit deux fois
     * par cycle, une fois en montant, une fois en descendant.
     */
    fun minutesFromNearest(
        extremes: List<TideExtreme>,
        type: TideExtremeType,
        at: Instant = Instant.now()
    ): Double? {
        val nearest = extremes
            .filter { it.type == type }
            .minByOrNull { abs(it.time.epochSecond - at.epochSecond) }
            ?: return null
        return (at.epochSecond - nearest.time.epochSecond) / 60.0
    }

    /** Durée typique d'un demi-cycle, pour dimensionner les rafraîchissements. */
    fun meanHalfCycleSeconds(extremes: List<TideExtreme>): Long {
        val sorted = extremes.sortedBy { it.time }
        val gaps = sorted.zipWithNext { a, b -> b.time.epochSecond - a.time.epochSecond }
            .filter { it in 4 * 3600L..9 * 3600L }
        return if (gaps.isEmpty()) MEAN_HALF_CYCLE_SECONDS else gaps.average().toLong()
    }
}
