#pragma once
#include "detector.h"
#include "camera.h"

/** Detector / camera settings persisted in NVS (survive reboots). */
void persistBegin();
bool persistLoadDetector(DetectorConfig &cfg);
void persistSaveDetector(const DetectorConfig &cfg);
bool persistLoadCamera(CameraSettings &s);
void persistSaveCamera(const CameraSettings &s);
void persistClear();
