#pragma once
#include <Arduino.h>
#include "detector.h"

/**
 * Shot log: the last SHOT_LOG_SIZE shots, camera or controller, each with
 *   - "before": the detector's working grid at the moment of the decision (BMP, see detectorDebugBmp)
 *   - "after":  a full-resolution JPEG taken SHOT_AFTER_MS after the order (jet, laser, insect gone or not)
 *   - the result: automatic shot -> "lost" when the target vanished within SHOT_RESULT_MS (hit, or fled),
 *     "missed" when it is still tracked; controller shot -> "manual".
 * Kept in PSRAM, lost at reboot. The counters of the stats card follow (shots, hits = lost, misses).
 */
#define SHOT_LOG_SIZE 3

void shotsBegin();
void shotsLoop();

/* Automatic shot ordered by aim.cpp */
void shotsRecordAuto(const Target &t, float pan, float tilt, int leadMs);
/* "FIRE" announced by the turret: a controller shot, or the echo of an automatic one (then ignored) */
void shotsRecordTurret();

size_t shotsJson(char *buf, size_t cap);
/* Image of shot number n ("before" BMP or "after" JPEG); nullptr when gone or not taken */
const uint8_t *shotsImage(uint32_t n, bool after, size_t *len);
