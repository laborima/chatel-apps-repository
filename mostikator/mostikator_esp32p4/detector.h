#pragma once
#include <Arduino.h>

/**
 * Small moving object detector (mosquito-sized targets).
 *
 * Pipeline (runs in the camera task, on every frame):
 *   RGB565 frame -> luma downscale (1/N) -> running-average background
 *   -> difference mask (dark-on-bright by default) -> connected components
 *   -> area filter -> nearest-neighbour tracker -> confirmed targets
 *
 * Targets are exported in normalised frame coordinates (0..1) plus
 * pan/tilt angles relative to the camera axis and a short-term prediction
 * (leadMs) so the turret can lead its shot.
 */

struct DetectorConfig {
    uint8_t  downscale;       // working grid = frame / downscale (2..8)
    uint8_t  threshold;       // luma difference (0..255)
    uint16_t minArea;         // blob area in working px
    uint16_t maxArea;
    uint8_t  confirmFrames;   // consecutive hits before a track is a target
    uint8_t  missFrames;      // misses before a track is dropped
    uint16_t maxMatchDist;    // working px
    uint8_t  learnShift;      // background rate = 1/2^n
    bool     darkOnly;        // only objects darker than the background
    uint16_t warmupFrames;
    float    roiX0, roiY0, roiX1, roiY1; // normalised region of interest
    float    hfov, vfov;      // degrees
    uint16_t leadMs;          // prediction lead
    uint8_t  noiseK;          // extra threshold per unit of the pixel's own noise (0 = off)
    uint8_t  globalChangePct; // % of the ROI changing at once that marks a shake / exposure change
    bool     isolation;       // only blobs with no other change around them (not fragments of a bigger object)
};

enum DetectorState : uint8_t {
    DET_DISARMED = 0,
    DET_LEARNING = 1,
    DET_ARMED    = 2
};

struct Target {
    uint16_t id;
    float x, y;          // centroid, normalised (0..1)
    float vx, vy;        // normalised units per second
    float predX, predY;  // predicted position at +leadMs
    float pan, tilt;     // degrees from the camera axis (predicted position)
    float w, h;          // bounding box, normalised
    float confidence;    // 0..1
    uint32_t ageMs;
    uint8_t hits, misses;
};

enum DetectorEventType : uint8_t {
    DET_EVT_ACQUIRED = 0,
    DET_EVT_UPDATED  = 1,
    DET_EVT_LOST     = 2
};

struct DetectorEvent {
    DetectorEventType type;
    Target   target;
    uint32_t tsMs;
};

typedef void (*DetectorEventCb)(const DetectorEvent &evt);

DetectorConfig detectorDefaultConfig();
void           detectorBegin(const DetectorConfig &cfg, DetectorEventCb cb);
DetectorConfig detectorGetConfig();
void           detectorSetConfig(const DetectorConfig &cfg);

void          detectorArm(bool armed);
bool          detectorArmed();
DetectorState detectorState();
const char   *detectorStateName();

uint32_t detectorGlobalSkips();   /* frames ignored as a global change (shake, exposure) */

/* Called from the camera task for every frame */
void detectorProcess(const uint8_t *rgb565, uint32_t w, uint32_t h, uint32_t tsMs);

/* What the detector sees, as an 8-bit palettised BMP of the working grid: luma in grey (dimmed),
 * pixels counted as a change in red, brighter changes ignored because of darkOnly in cyan, ROI frame in yellow.
 * Returns the BMP size, 0 if the detector has no buffers yet or cap is too small. Debug view, not locked
 * against the camera task: a torn frame is possible and harmless. */
size_t detectorDebugBmp(uint8_t *out, size_t cap);

/* Snapshot of confirmed targets (thread-safe copy) */
size_t detectorGetTargets(Target *out, size_t max);
/* Best target (highest confidence), false if none */
bool   detectorPrimaryTarget(Target &out);

float    detectorFps();
uint32_t detectorWorkWidth();
uint32_t detectorWorkHeight();
uint32_t detectorBlobCount();
uint32_t detectorFrameCount();
uint32_t detectorProcessMs();
uint32_t detectorActiveTracks();
