#include "aim.h"
#include "config.h"
#include "detector.h"
#include "remote.h"
#include "turret_link.h"
#include "shots.h"
#include <Preferences.h>

#ifndef AIM_AUTO
#define AIM_AUTO             1
#endif
#ifndef AIM_AUTO_FIRE
#define AIM_AUTO_FIRE        1
#endif
#ifndef AIM_LASER
#define AIM_LASER            1
#endif
#ifndef AIM_PAN_GAIN
#define AIM_PAN_GAIN         1.0f
#endif
#ifndef AIM_PAN_OFFSET
#define AIM_PAN_OFFSET       0.0f
#endif
#ifndef AIM_TILT_GAIN
#define AIM_TILT_GAIN        1.0f
#endif
#ifndef AIM_TILT_OFFSET
#define AIM_TILT_OFFSET      0.0f
#endif
#ifndef AIM_SETTLE_MS
#define AIM_SETTLE_MS        300
#endif
#ifndef AIM_COOLDOWN_MS
#define AIM_COOLDOWN_MS      2000
#endif
#ifndef AIM_BURST_MS
#define AIM_BURST_MS         150
#endif
#ifndef AIM_LEAD_MS
#define AIM_LEAD_MS          80
#endif
#ifndef AIM_SERVO_DEG_S
#define AIM_SERVO_DEG_S      150.0f  /* turret slew limit ("speed" on its console) */
#endif
#ifndef AIM_FIRE_TOL_DEG
#define AIM_FIRE_TOL_DEG     2.0f    /* fire once the turret is estimated within that of the aim point */
#endif

#define AIM_PERIOD_MS        50      /* AIM refresh while tracking (the turret slews at its own speed) */
#define AIM_MIN_STEP_DEG     0.3f    /* do not resend an AIM that moved less than that */
#define AIM_HOLD_MS          1500    /* laser kept on that long after the target is lost */
#define AIM_MAX_LEAD_S       1.0f    /* never extrapolate further than that */
#define AIM_BLOB_VERSION     2   /* 2: leadMs */

static AimConfig     cfg;
static Preferences   prefs;
static bool          tracking = false;
static bool          laserSent = false;
static uint16_t      targetId = 0;
static unsigned long targetSince = 0;
static unsigned long lastSeen = 0;
static unsigned long lastAim = 0;
static unsigned long lastFire = 0;
static float         sentPan = 1e9f, sentTilt = 1e9f;
static uint32_t      shots = 0;
static float         estPan = 0, estTilt = 0;   /* where the turret should be now (slew-limited) */
static unsigned long estAt = 0;

static AimConfig defaults() {
    AimConfig c;
    c.autoAim = AIM_AUTO != 0;
    c.autoFire = AIM_AUTO_FIRE != 0;
    c.laser = AIM_LASER != 0;
    c.panGain = AIM_PAN_GAIN;
    c.panOffset = AIM_PAN_OFFSET;
    c.tiltGain = AIM_TILT_GAIN;
    c.tiltOffset = AIM_TILT_OFFSET;
    c.settleMs = AIM_SETTLE_MS;
    c.cooldownMs = AIM_COOLDOWN_MS;
    c.burstMs = AIM_BURST_MS;
    c.leadMs = AIM_LEAD_MS;
    return c;
}

static void sendLaser(bool on) {
    if (on == laserSent) return;
    laserSent = on;
    turretLinkSend(on ? "LASER 1" : "LASER 0");
}

static void stopTracking(const char *why) {
    if (tracking) Log.printf("[AIM] Tracking stopped (%s)\n", why);
    tracking = false;
    targetId = 0;
    sentPan = sentTilt = 1e9f;
    sendLaser(false);
}

void aimBegin() {
    cfg = defaults();
    prefs.begin("mostik-aim", false);
    uint8_t ver = prefs.getUChar("ver", 0);
    size_t len = prefs.getBytesLength("cfg");
    if (ver == AIM_BLOB_VERSION && len == sizeof(AimConfig)) {
        prefs.getBytes("cfg", &cfg, sizeof(AimConfig));
        Log.println("[AIM] Calibration loaded from NVS");
    } else if (ver == 1 && len <= sizeof(AimConfig)) {
        prefs.getBytes("cfg", &cfg, len);   /* version 1 = same fields without leadMs, which keeps its default */
        cfg.leadMs = AIM_LEAD_MS;
        Log.println("[AIM] Calibration loaded from NVS (v1)");
    }
    Log.printf("[AIM] auto %s, fire %s, laser %s | pan = %.2f x cam %+.1f | tilt = %.2f x cam %+.1f\n",
               cfg.autoAim ? "on" : "off", cfg.autoFire ? "on" : "off", cfg.laser ? "on" : "off",
               cfg.panGain, cfg.panOffset, cfg.tiltGain, cfg.tiltOffset);
}

void aimLoop() {
    unsigned long now = millis();
    if (!cfg.autoAim || !detectorArmed() || !turretLinkConnected()) {
        if (tracking || laserSent) stopTracking(!cfg.autoAim ? "auto off" : !detectorArmed() ? "detector disarmed" : "turret link down");
        return;
    }

    Target t;
    if (!detectorPrimaryTarget(t)) {
        if (tracking && now - lastSeen >= AIM_HOLD_MS) stopTracking("target lost");
        return;
    }

    lastSeen = now;
    if (!tracking || t.id != targetId) {
        if (!tracking) Log.printf("[AIM] Tracking target #%u\n", t.id);
        tracking = true;
        targetId = t.id;
        targetSince = now;
    }
    if (cfg.laser) sendLaser(true);

    /* Where the turret should be now: it slews at AIM_SERVO_DEG_S towards the last AIM sent */
    float step = AIM_SERVO_DEG_S * (float)(now - estAt) / 1000.0f;
    estAt = now;
    if (sentPan < 1e8f) {
        estPan  += constrain(sentPan - estPan, -step, step);
        estTilt += constrain(sentTilt - estTilt, -step, step);
    }

    /* Predicted meeting point: picture age + fixed latency + servo travel, refined twice since the
     * travel time depends on the point itself */
    const DetectorConfig dc = detectorGetConfig();
    const float age = (float)(now - t.tsMs) / 1000.0f;
    float lead = age + cfg.leadMs / 1000.0f;
    float pan = 0, tilt = 0;
    for (int i = 0; i < 3; i++) {
        if (lead > AIM_MAX_LEAD_S) lead = AIM_MAX_LEAD_S;
        float x = constrain(t.x + t.vx * lead, 0.0f, 1.0f);
        float y = constrain(t.y + t.vy * lead, 0.0f, 1.0f);
        pan  = cfg.panGain  * (x - 0.5f) * dc.hfov + cfg.panOffset;
        tilt = cfg.tiltGain * (0.5f - y) * dc.vfov + cfg.tiltOffset;
        float travel = fmaxf(fabsf(pan - estPan), fabsf(tilt - estTilt)) / AIM_SERVO_DEG_S;
        lead = age + cfg.leadMs / 1000.0f + travel;
    }

    if (now - lastAim >= AIM_PERIOD_MS) {
        if (fabsf(pan - sentPan) >= AIM_MIN_STEP_DEG || fabsf(tilt - sentTilt) >= AIM_MIN_STEP_DEG) {
            char line[40];
            snprintf(line, sizeof(line), "AIM %.1f %.1f", pan, tilt);
            turretLinkSend(line);
            if (sentPan > 1e8f) { estPan = pan; estTilt = tilt; }   /* unknown start: assume it is there */
            sentPan = pan;
            sentTilt = tilt;
        }
        lastAim = now;
    }

    const bool onTarget = fabsf(estTilt - tilt) <= AIM_FIRE_TOL_DEG && fabsf(estPan - pan) <= AIM_FIRE_TOL_DEG;
    if (cfg.autoFire && onTarget && now - targetSince >= cfg.settleMs && (lastFire == 0 || now - lastFire >= cfg.cooldownMs)) {
        lastFire = now;
        shots++;
        char line[24];
        snprintf(line, sizeof(line), "FIRE %u", (unsigned)cfg.burstMs);
        turretLinkSend(line);
        shotsRecordAuto(t, pan, tilt, (int)(lead * 1000));
        Log.printf("[AIM] Fire at target #%u: pan %.1f tilt %.1f, lead %d ms, speed (%.2f, %.2f)/s\n",
                   t.id, pan, tilt, (int)(lead * 1000), t.vx, t.vy);
    }
}

AimConfig aimGetConfig() { return cfg; }

void aimSetConfig(const AimConfig &c, bool save) {
    cfg = c;
    if (save) {
        prefs.putUChar("ver", AIM_BLOB_VERSION);
        prefs.putBytes("cfg", &cfg, sizeof(AimConfig));
    }
    if (!cfg.autoAim || !cfg.laser) stopTracking("settings changed");
}

void aimReset() {
    prefs.remove("cfg");
    prefs.remove("ver");
    aimSetConfig(defaults(), false);
}

bool     aimTracking() { return tracking; }
uint32_t aimShots()    { return shots; }

size_t aimJson(char *buf, size_t cap) {
    return snprintf(buf, cap,
        "\"aim\":{\"auto\":%s,\"fire\":%s,\"laser\":%s,\"pan_gain\":%.3f,\"pan_offset\":%.2f,"
        "\"tilt_gain\":%.3f,\"tilt_offset\":%.2f,\"settle_ms\":%u,\"cooldown_ms\":%u,\"burst_ms\":%u,\"lead_ms\":%u}",
        cfg.autoAim ? "true" : "false", cfg.autoFire ? "true" : "false", cfg.laser ? "true" : "false",
        cfg.panGain, cfg.panOffset, cfg.tiltGain, cfg.tiltOffset,
        (unsigned)cfg.settleMs, (unsigned)cfg.cooldownMs, (unsigned)cfg.burstMs, (unsigned)cfg.leadMs);
}
