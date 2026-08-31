import { getTideData, getTideExtremes } from "./signalkService";

const toTwoDigits = (value) => value.toString().padStart(2, "0");

const HOUR_MS = 3600_000;

/** Extremes older than this are considered unusable rather than "current". */
const MAX_EXTREME_STALENESS_MS = 24 * HOUR_MS;

const toTimeDisplay = (isoString) => (
    isoString
        ? new Date(isoString).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
        : null
);

const byTime = (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime();

/**
 * Tide height between two consecutive extremes, using the harmonic (cosine) model.
 * This is the physical model, and a smooth version of the rule of twelfths.
 */
const harmonicHeight = (startHeight, endHeight, progress) => {
    const p = Math.min(1, Math.max(0, progress));
    return startHeight + ((endHeight - startHeight) * ((1 - Math.cos(Math.PI * p)) / 2));
};

/**
 * Interpolate the tide height at any instant from a list of extremes.
 *
 * Works on absolute timestamps, so it stays correct across midnight and across
 * days, and it follows the real spring/neap amplitude variation instead of
 * repeating a single half-cycle.
 *
 * @param {Array<{time: string, value: number, type: string}>} extremes - sorted or not
 * @param {Date|string|number} time
 * @returns {number|null} height in metres, or null when it cannot be computed
 */
export const interpolateTideHeight = (extremes, time) => {
    if (!Array.isArray(extremes) || extremes.length === 0) {
        return null;
    }

    const t = new Date(time).getTime();
    if (!Number.isFinite(t)) {
        return null;
    }

    const sorted = extremes
        .filter((e) => e && Number.isFinite(new Date(e.time).getTime()) && Number.isFinite(Number(e.value)))
        .sort(byTime);

    if (sorted.length === 0) {
        return null;
    }

    let prev = null;
    let next = null;
    for (const extreme of sorted) {
        const extremeTime = new Date(extreme.time).getTime();
        if (extremeTime <= t) {
            prev = extreme;
        }
        if (extremeTime >= t) {
            next = extreme;
            break;
        }
    }

    if (prev && next) {
        const prevTime = new Date(prev.time).getTime();
        const nextTime = new Date(next.time).getTime();
        const span = nextTime - prevTime;
        if (span <= 0) {
            return Number(prev.value);
        }
        return parseFloat(harmonicHeight(Number(prev.value), Number(next.value), (t - prevTime) / span).toFixed(2));
    }

    // Outside the covered window: clamp to the nearest known extreme rather than
    // extrapolating a fake cycle. Callers treat this as low-confidence.
    const edge = prev ?? next;
    return edge ? Number(edge.value) : null;
};

/**
 * Next extreme of a given type at or after `time`.
 */
const findNextExtreme = (extremes, time, type) => {
    const t = new Date(time).getTime();
    return extremes
        .slice()
        .sort(byTime)
        .find((e) => e.type === type && new Date(e.time).getTime() >= t) || null;
};

/**
 * Build the tide model from a full extremes list (preferred path).
 */
const buildFromExtremes = (extremes, stationName, now) => {
    const nextHigh = findNextExtreme(extremes, now, "High");
    const nextLow = findNextExtreme(extremes, now, "Low");

    if (!nextHigh && !nextLow) {
        return null;
    }

    const heightNow = interpolateTideHeight(extremes, now);
    if (heightNow === null) {
        return null;
    }

    let isRising = false;
    if (nextHigh && nextLow) {
        isRising = new Date(nextHigh.time) < new Date(nextLow.time);
    } else {
        isRising = Boolean(nextHigh);
    }

    // French tidal coefficient is published on high waters; use the closest one.
    const coefficient = nextHigh?.coefficient
        ?? extremes.filter((e) => e.type === "High" && Number.isFinite(e.coefficient)).at(0)?.coefficient
        ?? null;

    return {
        nowTime: `${toTwoDigits(new Date(now).getHours())}:${toTwoDigits(new Date(now).getMinutes())}`,
        isRising,
        heightNow,
        heightHigh: nextHigh ? Number(nextHigh.value) : null,
        heightLow: nextLow ? Number(nextLow.value) : null,
        timeHigh: nextHigh ? nextHigh.time : null,
        timeLow: nextLow ? nextLow.time : null,
        timeHighDisplay: toTimeDisplay(nextHigh?.time),
        timeLowDisplay: toTimeDisplay(nextLow?.time),
        coeffNow: coefficient,
        extremes,
        stationName,
        source: "signalk-resources"
    };
};

/**
 * Build the tide model from the environment.tide.* delta paths (fallback).
 *
 * These paths are only refreshed when the tides plugin has a live forecast; when
 * it does not, the server keeps serving the last values it ever published, which
 * can be weeks old. Anything stale is rejected instead of being displayed.
 */
const buildFromDeltas = (signalkData, now) => {
    if (!signalkData || signalkData.heightNow === null || signalkData.heightNow === undefined) {
        return null;
    }

    const nowMs = new Date(now).getTime();
    const isUsable = (isoString) => {
        if (!isoString) {
            return false;
        }
        const ms = new Date(isoString).getTime();
        return Number.isFinite(ms) && ms > nowMs - MAX_EXTREME_STALENESS_MS;
    };

    const timeHigh = isUsable(signalkData.timeHigh) ? signalkData.timeHigh : null;
    const timeLow = isUsable(signalkData.timeLow) ? signalkData.timeLow : null;

    if (!timeHigh && !timeLow) {
        console.warn(
            "[TideService] SignalK environment.tide.* extremes are stale " +
            `(high=${signalkData.timeHigh}, low=${signalkData.timeLow}) - discarding`
        );
        return null;
    }

    let isRising = false;
    if (timeHigh && timeLow) {
        isRising = new Date(timeHigh) < new Date(timeLow);
    } else {
        isRising = Boolean(timeHigh);
    }

    // Reconstruct an extremes list so downstream forecasting has something to work
    // with, even though two extremes only cover the current half-cycle.
    const extremes = [
        timeHigh ? { type: "High", value: Number(signalkData.heightHigh), time: timeHigh } : null,
        timeLow ? { type: "Low", value: Number(signalkData.heightLow), time: timeLow } : null
    ].filter(Boolean).sort(byTime);

    return {
        nowTime: `${toTwoDigits(new Date(now).getHours())}:${toTwoDigits(new Date(now).getMinutes())}`,
        isRising,
        heightNow: signalkData.heightNow,
        heightHigh: timeHigh ? signalkData.heightHigh : null,
        heightLow: timeLow ? signalkData.heightLow : null,
        timeHigh,
        timeLow,
        timeHighDisplay: toTimeDisplay(timeHigh),
        timeLowDisplay: toTimeDisplay(timeLow),
        coeffNow: null,
        extremes,
        stationName: signalkData.stationName,
        source: "signalk"
    };
};

/**
 * Fetch tide data from SignalK.
 *
 * Prefers the tides resource collection (`/signalk/v2/api/resources/tides`),
 * which is computed on demand and carries a full week of extremes. Falls back to
 * the `environment.tide.*` delta paths, which only describe the current
 * half-cycle and can go stale.
 */
export const fetchTideData = async (now = new Date()) => {
    try {
        const forecast = await getTideExtremes().catch((error) => {
            console.warn("[TideService] Tides resource unavailable:", error.message);
            return null;
        });

        if (forecast?.extremes?.length) {
            const fromExtremes = buildFromExtremes(forecast.extremes, forecast.stationName, now);
            if (fromExtremes) {
                return fromExtremes;
            }
            console.warn("[TideService] Tides resource has no upcoming extremes, falling back to deltas");
        }

        const signalkData = await getTideData();
        return buildFromDeltas(signalkData, now);
    } catch (error) {
        console.error("[TideService] Failed to fetch tide data from SignalK:", error.message);
        return null;
    }
};
