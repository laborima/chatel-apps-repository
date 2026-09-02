#pragma once
#include "detector.h"

/**
 * Cross-module hooks implemented in the main sketch.
 */

/* Called by the turret (POST /api/shot) or the UI to report a shot outcome. */
void appReportShot(uint16_t targetId, bool hit);

/* Detector callback (runs in the camera task, must not block). */
void appOnDetectorEvent(const DetectorEvent &evt);

/* Broadcast the current config to WS clients after a change. */
void appConfigChanged();
