#include "turret.h"
#include "config.h"
#include "net.h"
#include <Preferences.h>
#include <math.h>

#define CAL_VERSION 1

/* Servo pulses straight from the LEDC peripheral (core 3.x API): 50 Hz, 14-bit duty */
#define SERVO_PWM_HZ    50
#define SERVO_PWM_BITS  14
static const int   servoPins[2] = { PIN_SERVO_PAN, PIN_SERVO_TILT };
static Preferences prefs;
static TurretCal   cal;

static float         current[2];    /* angle currently written to the servo */
static float         target[2];
static float         velocity[2];   /* manual drive, deg/s */
static uint16_t      rawUs[2];
static bool          calMode = false;
static unsigned long lastTick = 0;

static bool hasServo(Axis a) { return servoPins[a] >= 0; }

static float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

bool turretHasAxis(Axis a) { return hasServo(a); }

const char *turretAxisName(Axis a) { return a == AXIS_PAN ? "pan" : "tilt"; }

static AxisCal &axisCal(Axis a) { return a == AXIS_PAN ? cal.pan : cal.tilt; }

float turretMinDeg(Axis a) { const AxisCal &c = axisCal(a); return fminf(c.degLow, c.degHigh); }
float turretMaxDeg(Axis a) { const AxisCal &c = axisCal(a); return fmaxf(c.degLow, c.degHigh); }

/* Linear interpolation between the two calibration points, clamped to them */
static uint16_t degToUs(Axis a, float deg) {
    const AxisCal &c = axisCal(a);
    float span = c.degHigh - c.degLow;
    float t = fabsf(span) < 0.01f ? 0.0f : (deg - c.degLow) / span;
    t = clampf(t, 0.0f, 1.0f);
    float us = (float)c.usLow + t * ((float)c.usHigh - (float)c.usLow);
    return (uint16_t)clampf(us, SERVO_US_MIN, SERVO_US_MAX);
}

static float usToDeg(Axis a, uint16_t us) {
    const AxisCal &c = axisCal(a);
    float span = (float)c.usHigh - (float)c.usLow;
    if (fabsf(span) < 0.5f) return c.degLow;
    float t = ((float)us - (float)c.usLow) / span;
    return c.degLow + t * (c.degHigh - c.degLow);
}

static void writeUs(Axis a, int us) {
    us = constrain(us, SERVO_US_MIN, SERVO_US_MAX);
    rawUs[a] = (uint16_t)us;
    if (!hasServo(a)) return;   /* axis without servo: angle tracked, nothing driven */
    uint32_t duty = (uint32_t)((uint64_t)us * (1UL << SERVO_PWM_BITS) / (1000000UL / SERVO_PWM_HZ));
    ledcWrite(servoPins[a], duty);
}

/* ================= CALIBRATION DATA ================= */
TurretCal turretDefaultCal() {
    TurretCal c;
    c.pan  = { PAN_US_LOW,  PAN_US_HIGH,  PAN_DEG_LOW,  PAN_DEG_HIGH };
    c.tilt = { TILT_US_LOW, TILT_US_HIGH, TILT_DEG_LOW, TILT_DEG_HIGH };
    c.maxSpeedDegS = TURRET_MAX_SPEED_DEGS;
    return c;
}

TurretCal turretGetCal() { return cal; }

void turretSetCal(const TurretCal &c) {
    cal = c;
    if (cal.maxSpeedDegS < 5.0f) cal.maxSpeedDegS = 5.0f;
    for (int i = 0; i < 2; i++) {
        Axis a = (Axis)i;
        target[a]  = clampf(target[a],  turretMinDeg(a), turretMaxDeg(a));
        current[a] = clampf(current[a], turretMinDeg(a), turretMaxDeg(a));
    }
}

bool turretLoadCal() {
    if (prefs.getUChar("cal_ver", 0) != CAL_VERSION) return false;
    if (prefs.getBytesLength("cal") != sizeof(TurretCal)) return false;
    TurretCal c;
    prefs.getBytes("cal", &c, sizeof(TurretCal));
    turretSetCal(c);
    return true;
}

void turretSaveCal() {
    prefs.putUChar("cal_ver", CAL_VERSION);
    prefs.putBytes("cal", &cal, sizeof(TurretCal));
    Log.println("[TUR] Calibration saved to NVS");
}

void turretResetCal() {
    prefs.remove("cal");
    prefs.remove("cal_ver");
    turretSetCal(turretDefaultCal());
    Log.println("[TUR] Calibration reset to config.h defaults");
}

/* ================= SETUP / LOOP ================= */
void turretBegin() {
    prefs.begin("mostik-tur", false);
    cal = turretDefaultCal();
    if (turretLoadCal()) Log.println("[TUR] Calibration loaded from NVS");
    else                 Log.println("[TUR] Using default calibration from config.h (not calibrated yet)");

    for (int i = 0; i < 2; i++) {
        Axis a = (Axis)i;
        current[a] = target[a] = clampf(a == AXIS_PAN ? TURRET_HOME_PAN : TURRET_HOME_TILT,
                                        turretMinDeg(a), turretMaxDeg(a));
        velocity[a] = 0;
        if (hasServo(a) && !ledcAttach(servoPins[a], SERVO_PWM_HZ, SERVO_PWM_BITS))
            Log.printf("[TUR] ERROR: LEDC attach failed on GPIO%d (%s)\n", servoPins[a], turretAxisName(a));
        writeUs(a, degToUs(a, current[a]));
    }
    lastTick = millis();
    turretPrint(Log);
}

void turretLoop() {
    unsigned long now = millis();
    float dt = (now - lastTick) / 1000.0f;
    if (dt < 0.005f) return;
    lastTick = now;
    if (calMode) return;

    float maxStep = cal.maxSpeedDegS * dt;
    for (int i = 0; i < 2; i++) {
        Axis a = (Axis)i;
        if (velocity[a] != 0.0f) {
            target[a] = clampf(target[a] + velocity[a] * dt, turretMinDeg(a), turretMaxDeg(a));
        }
        float d = target[a] - current[a];
        if (fabsf(d) <= maxStep) current[a] = target[a];
        else                     current[a] += (d > 0 ? maxStep : -maxStep);

        uint16_t us = degToUs(a, current[a]);
        if (us != rawUs[a]) writeUs(a, us);
    }
}

/* ================= ANGLE CONTROL ================= */
void turretSetAngle(Axis a, float deg) {
    velocity[a] = 0;
    target[a] = clampf(deg, turretMinDeg(a), turretMaxDeg(a));
}

void turretSetAngles(float pan, float tilt) {
    turretSetAngle(AXIS_PAN, pan);
    turretSetAngle(AXIS_TILT, tilt);
}

void turretSetVelocity(Axis a, float degPerS) {
    velocity[a] = degPerS;
    if (degPerS == 0.0f) target[a] = current[a];   /* stick released: hold where we are, no overshoot */
}

void turretNudge(Axis a, float deg) { turretSetAngle(a, target[a] + deg); }

void turretCenter() { turretSetAngles(TURRET_HOME_PAN, TURRET_HOME_TILT); }

float    turretAngle(Axis a)       { return calMode ? usToDeg(a, rawUs[a]) : current[a]; }
float    turretTargetAngle(Axis a) { return target[a]; }
uint16_t turretUs(Axis a)          { return rawUs[a]; }
bool     turretMoving()            { return fabsf(target[0] - current[0]) > 0.05f || fabsf(target[1] - current[1]) > 0.05f; }

/* ================= CALIBRATION MODE ================= */
void turretCalMode(bool on) {
    if (on == calMode) return;
    calMode = on;
    velocity[0] = velocity[1] = 0;
    if (on) {
        Log.println("[TUR] Calibration mode ON – raw pulse drive, angles ignored");
    } else {
        /* Resume angle control from wherever the servos were left */
        for (int i = 0; i < 2; i++) {
            Axis a = (Axis)i;
            current[a] = target[a] = clampf(usToDeg(a, rawUs[a]), turretMinDeg(a), turretMaxDeg(a));
        }
        Log.println("[TUR] Calibration mode OFF");
    }
}

bool turretInCalMode() { return calMode; }

void turretRawUs(Axis a, int us) {
    if (!calMode) turretCalMode(true);
    writeUs(a, us);
    Log.printf("[TUR] %s -> %u us\n", turretAxisName(a), rawUs[a]);
}

void turretRawStep(Axis a, int deltaUs) { turretRawUs(a, (int)rawUs[a] + deltaUs); }

void turretMark(Axis a, bool high, float deg) {
    AxisCal &c = axisCal(a);
    if (high) { c.usHigh = rawUs[a]; c.degHigh = deg; }
    else      { c.usLow  = rawUs[a]; c.degLow  = deg; }
    Log.printf("[TUR] %s %s point = %u us at %.1f deg\n", turretAxisName(a), high ? "HIGH" : "LOW", rawUs[a], deg);
    if (c.usLow == c.usHigh) Log.println("[TUR] WARNING: low and high points have the same pulse width – move the other stop before saving");
}

void turretPrint(Print &out) {
    for (int i = 0; i < 2; i++) {
        Axis a = (Axis)i;
        const AxisCal &c = axisCal(a);
        if (!hasServo(a)) { out.printf("[TUR] %-4s no servo (PIN_SERVO_%s = -1)\n", turretAxisName(a), a == AXIS_PAN ? "PAN" : "TILT"); continue; }
        out.printf("[TUR] %-4s low %4u us = %6.1f deg | high %4u us = %6.1f deg | now %4u us = %6.1f deg%s\n",
                   turretAxisName(a), c.usLow, c.degLow, c.usHigh, c.degHigh,
                   rawUs[a], turretAngle(a), calMode ? " (CAL)" : "");
    }
    out.printf("[TUR] max speed %.0f deg/s, pulse limits %d-%d us\n", cal.maxSpeedDegS, SERVO_US_MIN, SERVO_US_MAX);
}
