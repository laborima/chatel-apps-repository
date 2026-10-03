#include "shots.h"
#include "camera.h"
#include "remote.h"
#include "stats.h"
#include "esp_heap_caps.h"
#include <time.h>

#define SHOT_AFTER_MS     200     /* the "after" photo: once the burst (150 ms) is out */
#define SHOT_RESULT_MS    700     /* target still tracked that long after the order = missed */
#define SHOT_ECHO_MS      600     /* a turret "FIRE" this soon after an automatic order is its echo */
#define SHOT_BMP_CAP      (14 + 40 + 1024 + 400 * 400)

struct Shot {
    uint32_t n;              /* 0 = empty slot */
    uint32_t ms;
    time_t   epoch;
    bool     automatic;
    uint16_t target;
    float    x, y, pan, tilt;
    int      leadMs;
    char     result[8];      /* "lost" | "missed" | "manual" | "" (pending) */
    uint8_t *bmp;  size_t bmpLen;
    uint8_t *jpg;  size_t jpgLen;
    bool     afterPending;   /* photo requested, waiting for a fresh JPEG */
    uint32_t afterSeq;
};

static Shot     log_[SHOT_LOG_SIZE];
static uint32_t nextN = 1;
static int      newest = -1;
static uint32_t lastAutoMs = 0;
static bool     demandHeld = false;

void shotsBegin() {
    size_t jpgCap = cameraJpegMaxSize();
    for (int i = 0; i < SHOT_LOG_SIZE; i++) {
        log_[i] = Shot();
        log_[i].bmp = (uint8_t *)heap_caps_malloc(SHOT_BMP_CAP, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
        log_[i].jpg = jpgCap ? (uint8_t *)heap_caps_malloc(jpgCap, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT) : nullptr;
    }
}

static Shot &newSlot(bool automatic) {
    newest = (newest + 1) % SHOT_LOG_SIZE;
    Shot &s = log_[newest];
    /* the camera may have started after shotsBegin() (ribbon retried later): allocate on first use */
    if (!s.jpg && cameraJpegMaxSize()) s.jpg = (uint8_t *)heap_caps_malloc(cameraJpegMaxSize(), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    s.n = nextN++;
    s.ms = millis();
    s.epoch = time(nullptr);
    s.automatic = automatic;
    s.target = 0;
    s.x = s.y = -1;
    s.pan = s.tilt = 0;
    s.leadMs = 0;
    s.result[0] = 0;
    s.bmpLen = s.bmp ? detectorDebugBmp(s.bmp, SHOT_BMP_CAP) : 0;
    s.jpgLen = 0;
    s.afterPending = s.jpg != nullptr;
    s.afterSeq = cameraJpegSeq();
    return s;
}

void shotsRecordAuto(const Target &t, float pan, float tilt, int leadMs) {
    Shot &s = newSlot(true);
    s.target = t.id;
    s.x = t.x;
    s.y = t.y;
    s.pan = pan;
    s.tilt = tilt;
    s.leadMs = leadMs;
    lastAutoMs = s.ms;
    statsFired(t.id);
}

void shotsRecordTurret() {
    if (lastAutoMs && millis() - lastAutoMs < SHOT_ECHO_MS) return;   /* our own order coming back */
    Shot &s = newSlot(false);
    strlcpy(s.result, "manual", sizeof(s.result));
    statsFired(0);
}

static bool stillTracked(uint16_t id) {
    Target t[16];
    size_t n = detectorGetTargets(t, 16);
    for (size_t i = 0; i < n; i++) if (t[i].id == id) return true;
    return false;
}

void shotsLoop() {
    unsigned long now = millis();
    bool wantJpeg = false;
    for (int i = 0; i < SHOT_LOG_SIZE; i++) {
        Shot &s = log_[i];
        if (!s.n) continue;
        if (s.afterPending) {
            if (now - s.ms > SHOT_AFTER_MS + 2000) {
                s.afterPending = false;   /* no frame came: give up */
            } else if (now - s.ms >= SHOT_AFTER_MS) {
                wantJpeg = true;
                if (demandHeld) {
                    size_t len = cameraCopyJpeg(s.jpg, cameraJpegMaxSize(), &s.afterSeq, 0);
                    if (len) { s.jpgLen = len; s.afterPending = false; }
                }
            }
        }
        if (s.automatic && !s.result[0] && now - s.ms >= SHOT_RESULT_MS) {
            bool missed = stillTracked(s.target);
            strlcpy(s.result, missed ? "missed" : "lost", sizeof(s.result));
            statsOutcome(!missed);
            Log.printf("[SHOT] #%lu at target #%u: %s\n", (unsigned long)s.n, s.target,
                       missed ? "missed (still tracked)" : "target lost (hit or fled)");
        }
    }
    /* JPEG encoding only while a photo is awaited: it costs camera time */
    if (wantJpeg != demandHeld) {
        demandHeld = wantJpeg;
        cameraJpegDemand(wantJpeg ? +1 : -1);
        if (wantJpeg) for (int i = 0; i < SHOT_LOG_SIZE; i++) if (log_[i].afterPending) log_[i].afterSeq = cameraJpegSeq();
    }
}

size_t shotsJson(char *buf, size_t cap) {
    size_t pos = snprintf(buf, cap, "{\"type\":\"shots\",\"shots\":[");
    unsigned long now = millis();
    bool first = true;
    for (int k = 0; k < SHOT_LOG_SIZE && pos < cap; k++) {
        int i = (newest - k + SHOT_LOG_SIZE) % SHOT_LOG_SIZE;
        if (newest < 0) break;
        const Shot &s = log_[i];
        if (!s.n) continue;
        pos += snprintf(buf + pos, cap - pos,
            "%s{\"n\":%lu,\"ago_ms\":%lu,\"epoch\":%ld,\"auto\":%s,\"target\":%u,\"x\":%.3f,\"y\":%.3f,"
            "\"pan\":%.1f,\"tilt\":%.1f,\"lead_ms\":%d,\"result\":\"%s\",\"before\":%s,\"after\":%s}",
            first ? "" : ",", (unsigned long)s.n, (unsigned long)(now - s.ms), (long)s.epoch,
            s.automatic ? "true" : "false", s.target, s.x, s.y, s.pan, s.tilt, s.leadMs, s.result,
            s.bmpLen ? "true" : "false", s.jpgLen ? "true" : "false");
        first = false;
    }
    if (pos < cap) pos += snprintf(buf + pos, cap - pos, "]}");
    return pos;
}

const uint8_t *shotsImage(uint32_t n, bool after, size_t *len) {
    for (int i = 0; i < SHOT_LOG_SIZE; i++) {
        const Shot &s = log_[i];
        if (s.n != n) continue;
        if (after ? !s.jpgLen : !s.bmpLen) return nullptr;
        *len = after ? s.jpgLen : s.bmpLen;
        return after ? s.jpg : s.bmp;
    }
    return nullptr;
}
