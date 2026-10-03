#pragma once
#include <Arduino.h>

/**
 * Automatic mode: the camera drives the turret over the serial link.
 *
 * While the detector is armed and a confirmed target exists, the primary target's angles (camera axis)
 * are turned into turret angles with a linear calibration per axis
 *     turret = gain * camera + offset
 * and sent as "AIM <pan> <tilt>" every AIM_PERIOD_MS. The aiming laser follows the target ("LASER 1"),
 * and once the aim has held AIM_SETTLE_MS a burst is ordered ("FIRE <ms>"), at most every cooldown.
 * A disarmed water gun turns the burst into a dry shot: green LEDs + blaster, no water.
 *
 * The turret refuses all of it while the PS5 controller is in use (manual always wins).
 * The calibration comes from tools/calibrate_aim.py (laser dot seen by the camera at several angles).
 */
struct AimConfig {
    bool     autoAim;       // send AIM orders
    bool     autoFire;      // send FIRE orders once the aim has settled
    bool     laser;         // aiming laser on while tracking
    float    panGain, panOffset;     // turret pan  = panGain  * camera pan  + panOffset  (degrees)
    float    tiltGain, tiltOffset;   // turret tilt = tiltGain * camera tilt + tiltOffset (degrees)
    uint16_t settleMs;      // aim held that long before firing
    uint16_t cooldownMs;    // minimum time between two bursts
    uint16_t burstMs;       // valve opening per burst (ignored by a disarmed gun)
};

void      aimBegin();
void      aimLoop();
AimConfig aimGetConfig();
void      aimSetConfig(const AimConfig &c, bool save);
void      aimReset();
bool      aimTracking();        /* a target is being followed right now */
uint32_t  aimShots();           /* bursts ordered since boot */
size_t    aimJson(char *buf, size_t cap);   /* "aim":{...} fragment, no braces around */
