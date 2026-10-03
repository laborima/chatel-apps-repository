#pragma once
#include <Arduino.h>

/** Pan / tilt servos with a two-point calibration per axis, slew limiting and NVS persistence. */

enum Axis : uint8_t { AXIS_PAN = 0, AXIS_TILT = 1 };

/** One axis: pulse width and real-world angle at two reference points (the mechanical stops). */
struct AxisCal {
    uint16_t usLow;
    uint16_t usHigh;
    float    degLow;
    float    degHigh;
};

struct TurretCal {
    AxisCal pan;
    AxisCal tilt;
    float   maxSpeedDegS;
};

void      turretBegin();
void      turretLoop();

TurretCal turretDefaultCal();
TurretCal turretGetCal();
void      turretSetCal(const TurretCal &c);
bool      turretLoadCal();
void      turretSaveCal();
void      turretResetCal();

/* Angle control (deg, camera frame: 0 = straight ahead / horizontal) */
void      turretSetAngle(Axis a, float deg);
void      turretSetAngles(float pan, float tilt);
void      turretSetVelocity(Axis a, float degPerS);   /* manual drive, 0 = hold */
void      turretNudge(Axis a, float deg);
void      turretCenter();
float     turretAngle(Axis a);          /* where the servo is being driven right now */
float     turretTargetAngle(Axis a);
float     turretMinDeg(Axis a);
float     turretMaxDeg(Axis a);
uint16_t  turretUs(Axis a);
bool      turretMoving();

/* Calibration: raw pulse-width drive, then mark the stops */
void      turretCalMode(bool on);
bool      turretInCalMode();
void      turretRawUs(Axis a, int us);
void      turretRawStep(Axis a, int deltaUs);
void      turretMark(Axis a, bool high, float deg);

bool      turretHasAxis(Axis a);        /* false when PIN_SERVO_x = -1 */
const char *turretAxisName(Axis a);
void      turretPrint(Print &out);
