#include "ps5_input.h"
#include "config.h"
#include "turret.h"
#include "water_gun.h"
#include <ps5Controller.h>

/*
 * Drive mode
 *   Left stick   : rotation (X) and up/down (Y) of the turret
 *   Right stick  : same, slow (fine aiming)
 *   D-pad        : nudge NUDGE_DEG
 *   Cross (X)    : fire while held (R2 too)
 *   Square       : green LEDs on/off
 *   Circle       : laser sound only
 *   Triangle     : center the turret
 *   L1           : pump on/off (priming)
 *   Options      : arm / disarm (arming starts the pump)
 *   Create       : enter / leave calibration mode
 *
 * Calibration mode (lightbar blue)
 *   D-pad left/right : pan  -/+ step us      D-pad down/up : tilt -/+ step us
 *   L1 / R1          : step /2, x2
 *   Square / Triangle: mark pan  LOW / HIGH  (angles PAN_DEG_LOW / PAN_DEG_HIGH, or set them on the console)
 *   Cross / Circle   : mark tilt LOW / HIGH  (angles TILT_DEG_LOW / TILT_DEG_HIGH)
 *   Options          : save to NVS and leave calibration
 */

/* arduino-esp32 releases the whole BT controller memory at boot unless a linked library says it is
 * in use (weak btInUse() in esp32-hal-bt.c). esp-ps5 does not declare it, so without this override
 * btStart() fails with ESP_ERR_INVALID_STATE and the controller is never found. */
bool btInUse() { return true; }

static bool          wasConnected = false;
static unsigned long lastSend = 0;
static unsigned long lastRepeat = 0;
static int           calStep = CAL_STEP_US;
static uint8_t       lastR = 0, lastG = 0, lastB = 0, lastRumble = 0;

static float stickToSpeed(int v, float maxDegS) {
    int a = abs(v);
    if (a <= STICK_DEADZONE) return 0.0f;
    float n = (float)(a - STICK_DEADZONE) / (127.0f - STICK_DEADZONE);
    n = STICK_EXPO * n * n * n + (1.0f - STICK_EXPO) * n;
    return (v < 0 ? -n : n) * maxDegS;
}

static void onConnect() {
    Serial.printf("[PS5] Controller connected (battery %u%%)\n", ps5.battery);
}

static void onDisconnect() {
    Serial.println("[PS5] Controller lost – everything off");
    gunAllOff();
    turretSetVelocity(AXIS_PAN, 0);
    turretSetVelocity(AXIS_TILT, 0);
}

static void handleDrive() {
    float pan  = stickToSpeed(ps5.lx, STICK_MAX_SPEED_DEGS) + stickToSpeed(ps5.rx, STICK_FINE_SPEED_DEGS);
    float tilt = stickToSpeed(-ps5.ly, STICK_MAX_SPEED_DEGS) + stickToSpeed(-ps5.ry, STICK_FINE_SPEED_DEGS);
#if TILT_STICK_INVERT
    tilt = -tilt;
#endif
    turretSetVelocity(AXIS_PAN, pan);
    turretSetVelocity(AXIS_TILT, tilt);

    if (ps5.left.pressed)  turretNudge(AXIS_PAN,  -NUDGE_DEG);
    if (ps5.right.pressed) turretNudge(AXIS_PAN,   NUDGE_DEG);
    if (ps5.up.pressed)    turretNudge(AXIS_TILT,  NUDGE_DEG);
    if (ps5.down.pressed)  turretNudge(AXIS_TILT, -NUDGE_DEG);

    if (ps5.triangle.pressed) turretCenter();
    if (ps5.square.pressed)   gunLeds(!gunLedsOn());
    if (ps5.circle.pressed)   gunLaserFx();
    if (ps5.l1.pressed)       gunPump(!gunPumpOn());
    if (ps5.options.pressed)  gunSetArmed(!gunArmed());

    gunHold(ps5.cross || ps5.r2 >= FIRE_TRIGGER_THRESHOLD);
}

static void handleCalibration() {
    unsigned long now = millis();
    bool repeat = now - lastRepeat >= 120;
    if (ps5.left.pressed  || (ps5.left  && repeat)) { turretRawStep(AXIS_PAN,  -calStep); lastRepeat = now; }
    if (ps5.right.pressed || (ps5.right && repeat)) { turretRawStep(AXIS_PAN,   calStep); lastRepeat = now; }
    if (ps5.up.pressed    || (ps5.up    && repeat)) { turretRawStep(AXIS_TILT,  calStep); lastRepeat = now; }
    if (ps5.down.pressed  || (ps5.down  && repeat)) { turretRawStep(AXIS_TILT, -calStep); lastRepeat = now; }

    if (ps5.l1.pressed) { calStep = max(1, calStep / 2);   Serial.printf("[PS5] Cal step %d us\n", calStep); }
    if (ps5.r1.pressed) { calStep = min(100, calStep * 2); Serial.printf("[PS5] Cal step %d us\n", calStep); }

    TurretCal c = turretGetCal();
    if (ps5.square.pressed)   turretMark(AXIS_PAN,  false, c.pan.degLow);
    if (ps5.triangle.pressed) turretMark(AXIS_PAN,  true,  c.pan.degHigh);
    if (ps5.cross.pressed)    turretMark(AXIS_TILT, false, c.tilt.degLow);
    if (ps5.circle.pressed)   turretMark(AXIS_TILT, true,  c.tilt.degHigh);

    if (ps5.options.pressed) {
        turretSaveCal();
        turretCalMode(false);
        turretPrint(Serial);
    }
}

/* Lightbar: blue = calibration, red = firing, green = armed, orange = safe. Rumble while firing. */
static void feedback() {
    unsigned long now = millis();
    if (now - lastSend < 40) return;

    uint8_t r, g, b, rumble = 0;
    if (turretInCalMode())  { r = 0;   g = 40;  b = 255; }
    else if (gunFiring())   { r = 255; g = 0;   b = 0;   rumble = 200; }
    else if (gunArmed())    { r = 0;   g = 255; b = 30;  }
    else                    { r = 255; g = 90;  b = 0;   }

    if (r != lastR || g != lastG || b != lastB || rumble != lastRumble) {
        lastR = r; lastG = g; lastB = b; lastRumble = rumble;
        lastSend = now;
        ps5.lightbar(r, g, b).rumble(0, rumble).send();
    }
}

/* ================= API ================= */
void ps5InputBegin() {
    ps5.attachOnConnect(onConnect);
    ps5.attachOnDisconnect(onDisconnect);
    if (strlen(PS5_MAC) > 0) {
        Serial.printf("[PS5] Connecting to %s\n", PS5_MAC);
        ps5.begin(PS5_MAC);
    } else {
        Serial.printf("[PS5] Scanning %d s – hold PS + Create on the controller until the lightbar pulses\n", PS5_PAIR_TIMEOUT_S);
        ps5.begin((uint8_t)PS5_PAIR_TIMEOUT_S);
    }
}

void ps5InputLoop() {
    bool connected = ps5.isConnected();
    if (connected != wasConnected) {
        wasConnected = connected;
        if (!connected) onDisconnect();
        lastR = lastG = lastB = 255;   /* force a lightbar refresh on reconnect */
    }
    if (!connected) return;

    if (ps5.share.pressed) turretCalMode(!turretInCalMode());

    if (turretInCalMode()) handleCalibration();
    else                   handleDrive();
    feedback();
}

bool ps5InputConnected() { return wasConnected; }

static void onScanDevice(const uint8_t mac[6], const char *name, int8_t rssi) {
    Serial.printf("[PS5]   %02X:%02X:%02X:%02X:%02X:%02X  rssi %4d  %s\n",
                  mac[0], mac[1], mac[2], mac[3], mac[4], mac[5], rssi, (name && *name) ? name : "(no name)");
}

void ps5InputScan(uint8_t secs) {
    Serial.printf("[PS5] Scanning %u s for Bluetooth Classic devices...\n", secs);
    ps5.scanDevices(secs, onScanDevice);
    Serial.println("[PS5] Scan done");
}

void ps5InputForget() {
    ps5.forget();
    Serial.println("[PS5] Controller forgotten – reboot and pair again");
}
