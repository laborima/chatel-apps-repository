#include "ps5_input.h"
#include "config.h"
#include "net.h"
#include "turret.h"
#include "water_gun.h"
#include <ps5Controller.h>
#include <Preferences.h>
#include <esp_gap_bt_api.h>

/*
 * Drive mode
 *   Left stick   : rotation (X) and up/down (Y) of the turret
 *   Right stick  : same, slow (fine aiming)
 *   D-pad        : nudge NUDGE_DEG
 *   Cross (X)    : fire while held (R2 too)
 *   Square       : green LEDs on/off (relay 4)
 *   Circle       : aiming laser on/off (relay 3)
 *   Triangle     : center the turret
 *   L1           : pump on/off (priming)
 *   Options      : arm / disarm (arming starts the pump)
 *   Create       : HOLD 1.5 s to enter / leave calibration mode (a tap does nothing: PS + Create is
 *                  also the pairing combo, and that press must not flip the turret into calibration)
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

/*
 * The library is polled from its own task: ps5.isConnected() runs a blocking ~5.5 s Bluetooth inquiry
 * every 5 s while no controller is known, and ps5.begin(mac) blocks up to 10 s. Done from loop(), that
 * froze the whole turret (valve timing, UART link, WiFi console) whenever the controller was off.
 * The input fields are written by the Bluedroid task and the edge flags are latched, so loop() can read
 * them freely; it only touches the library while the controller is connected.
 */
#define PS5_TASK_STACK   4096
#define PS5_RESCAN_MS   20000   /* no controller known yet: one pairing scan every 20 s, not back to back */
#define PS5_FALLBACK_MS 30000   /* known controller silent that long: also look for one in pairing mode */
#define PS5_FALLBACK_SCAN_S 4
#define PS5_PENDING_MS  12000   /* outbound connect still unanswered after that: abandon it and retry */

static TaskHandle_t      ps5Task = nullptr;
static SemaphoreHandle_t btLock = nullptr;    /* one inquiry at a time (background vs console "scan") */
static volatile bool     linkUp = false;
static char              bootMac[18] = "";

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

#define CAL_HOLD_MS 1500
static unsigned long shareSince = 0;
static bool          shareUsed = false;

static bool macIsZero(const uint8_t mac[6]) {
    for (int i = 0; i < 6; i++) if (mac[i]) return false;
    return true;
}

static void macToStr(const uint8_t mac[6], char out[18]) {
    snprintf(out, 18, "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}

/* Remember the controller so the next boots reconnect straight away instead of scanning */
static void rememberController() {
    uint8_t mac[6];
    ps5_l2cap_get_target(mac);
    /* The library only knows the address of links it opened itself. When the controller reconnects
     * on its own (PS button, already bonded) take it from the Bluedroid bond list instead. */
    if (macIsZero(mac)) {
        esp_bd_addr_t bonded[4];
        int n = 4;
        if (esp_bt_gap_get_bond_device_list(&n, bonded) != ESP_OK || n != 1) return;   /* ambiguous: keep scanning */
        memcpy(mac, bonded[0], 6);
    }
    if (macIsZero(mac)) return;
    char str[18];
    macToStr(mac, str);
    if (!strcmp(str, bootMac)) return;
    Preferences p;
    p.begin("mostik-ps5", false);
    p.putString("mac", str);
    p.end();
    strlcpy(bootMac, str, sizeof(bootMac));
    Log.printf("[PS5] Controller %s saved – reconnects without scanning from now on\n", str);
}

/* The edge flags stay latched until read: presses made while pairing (PS + Create) or while the link
 * was down would all fire at once on the first loop. Read them away. */
static void flushButtonEdges() {
    ps5Controller::Button *all[] = { &ps5.l1, &ps5.r1, &ps5.l3, &ps5.r3, &ps5.up, &ps5.down, &ps5.left, &ps5.right,
                                     &ps5.cross, &ps5.circle, &ps5.square, &ps5.triangle,
                                     &ps5.share, &ps5.options, &ps5.ps_btn, &ps5.touchpad, &ps5.mute };
    for (auto *b : all) { (void)(bool)b->pressed; (void)(bool)b->released; }
}

static void onConnect() {
    Log.printf("[PS5] Controller connected (battery %u%%)\n", ps5.battery);
    flushButtonEdges();
    shareSince = 0;
    rememberController();
}

static void onDisconnect() {
    Log.println("[PS5] Controller lost – everything off");
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
    if (ps5.circle.pressed)   gunLaser(!gunLaserOn());
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

    if (ps5.l1.pressed) { calStep = max(1, calStep / 2);   Log.printf("[PS5] Cal step %d us\n", calStep); }
    if (ps5.r1.pressed) { calStep = min(100, calStep * 2); Log.printf("[PS5] Cal step %d us\n", calStep); }

    TurretCal c = turretGetCal();
    if (ps5.square.pressed)   turretMark(AXIS_PAN,  false, c.pan.degLow);
    if (ps5.triangle.pressed) turretMark(AXIS_PAN,  true,  c.pan.degHigh);
    if (ps5.cross.pressed)    turretMark(AXIS_TILT, false, c.tilt.degLow);
    if (ps5.circle.pressed)   turretMark(AXIS_TILT, true,  c.tilt.degHigh);

    if (ps5.options.pressed) {
        turretSaveCal();
        turretCalMode(false);
        turretPrint(Log);
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

/* ================= BACKGROUND TASK ================= */
/* Pairing-mode fallback. With a known MAC the library only pages that controller and never scans, so a
 * controller that has since been paired with something else (console, phone) lost its link key and can
 * never come back: PS + Create made it discoverable, but nobody was listening. While the known one stays
 * silent, scan now and then for a DualSense in pairing mode and connect to it. A bonded controller is
 * not discoverable, so this never steals the link from the known one. */
static volatile bool    pairFound = false;
static uint8_t         pairMac[6];
static volatile uint8_t pairScanResult = 0;   /* 1 found, 2 nothing: reported by loop(), the task never logs */
static bool            pairScanLogged = false;
static volatile uint32_t pairScans = 0, pendingDrops = 0;

static void onPairScan(const uint8_t mac[6], const char *name, int8_t rssi) {
    if (pairFound || !name || (!strstr(name, "DualSense") && !strstr(name, "Wireless Controller"))) return;
    memcpy(pairMac, mac, 6);
    pairFound = true;
}

static bool pairingScan() {
    pairFound = false;
    ps5.scanDevices(PS5_FALLBACK_SCAN_S, onPairScan);
    if (!pairFound) return false;
    ps5_l2cap_connect(pairMac);
    return true;
}

static void ps5TaskFn(void *) {
    xSemaphoreTake(btLock, portMAX_DELAY);
    if (bootMac[0]) ps5.begin(bootMac);                    /* direct connect, blocks up to 10 s */
    else            ps5.begin((uint8_t)PS5_PAIR_TIMEOUT_S);
    xSemaphoreGive(btLock);

    unsigned long downSince = millis();
    unsigned long lastScan = 0;
    unsigned long pendingSince = 0;
    for (;;) {
        xSemaphoreTake(btLock, portMAX_DELAY);
        bool c = ps5.isConnected();   /* also drives reconnect / pairing scans */
        unsigned long now = millis();
        /* An outbound connect to a controller that is off never completes and its CID blocks every retry:
         * drop it after a while so the library pages the controller again (patches/ fixes the case Bluedroid
         * does report, this one covers the silent page timeout) */
        if (!c && !ps5_l2cap_is_active() && ps5_l2cap_has_any_cid()) {
            if (!pendingSince) pendingSince = now;
            else if (now - pendingSince >= PS5_PENDING_MS) { ps5_l2cap_drop_pending(); pendingSince = 0; pendingDrops++; }
        } else {
            pendingSince = 0;
        }
        if (c) {
            downSince = now;
        } else if (ps5_l2cap_has_target() && !ps5_l2cap_has_any_cid()
                   && now - downSince >= PS5_FALLBACK_MS && now - lastScan >= PS5_RESCAN_MS) {
            lastScan = now;
            pairScanResult = pairingScan() ? 1 : 2;
            pairScans++;
        }
        xSemaphoreGive(btLock);
        linkUp = c;
        /* Known controller: poll fast (the library retries the link every 5 s by itself) */
        vTaskDelay(pdMS_TO_TICKS(c ? 20 : (ps5_l2cap_has_target() ? 200 : PS5_RESCAN_MS)));
    }
}

/* ================= API ================= */
void ps5InputBegin() {
    /* No attachOnConnect/attachOnDisconnect: they run in the Bluedroid task. ps5InputLoop() detects the
     * edges instead, so gunAllOff() and the logs always run in loop(). */
    if (strlen(PS5_MAC) > 0) {
        strlcpy(bootMac, PS5_MAC, sizeof(bootMac));
    } else {
        Preferences p;
        p.begin("mostik-ps5", true);
        p.getString("mac", bootMac, sizeof(bootMac));
        p.end();
        if (!strcmp(bootMac, "00:00:00:00:00:00")) bootMac[0] = 0;   /* saved by an older build */
    }
    if (bootMac[0]) Log.printf("[PS5] Connecting to %s (press PS on the controller)\n", bootMac);
    else            Log.printf("[PS5] No controller known: scanning – hold PS + Create until the lightbar pulses\n");

    /* The DualSense is Bluetooth Classic: start the controller in Classic-only mode, which releases the
     * BLE controller + host memory (tens of KB). With BT + WiFi the heap sat at ~20 KB and a burst of
     * TCP traffic ran lwIP out of memory (abort() in lock_init_generic, task "tiT"). The library's own
     * btStart() then finds the controller already running. */
    uint32_t heapBefore = ESP.getFreeHeap();
    if (!btStartMode(BT_MODE_CLASSIC_BT)) Log.println("[PS5] ERROR: Bluetooth Classic start failed");
    Log.printf("[PS5] Bluetooth Classic only, BLE memory released (heap %u -> %u B)\n",
               (unsigned)heapBefore, (unsigned)ESP.getFreeHeap());

    btLock = xSemaphoreCreateMutex();
    /* Core 0 with the Bluetooth stack, loop() stays alone on core 1 */
    xTaskCreatePinnedToCore(ps5TaskFn, "ps5", PS5_TASK_STACK, nullptr, 1, &ps5Task, 0);
}

void ps5InputLoop() {
    uint8_t scan = pairScanResult;
    if (scan) {
        pairScanResult = 0;
        if (scan == 1) {
            char str[18];
            macToStr(pairMac, str);
            Log.printf("[PS5] Controller in pairing mode found (%s) – connecting\n", str);
        } else if (!pairScanLogged) {
            Log.printf("[PS5] %s silent – also scanning for a controller in pairing mode (PS + Create) every %d s\n",
                       bootMac[0] ? bootMac : "Known controller", PS5_RESCAN_MS / 1000);
        }
        pairScanLogged = true;
    }

    bool connected = linkUp;
    if (connected != wasConnected) {
        wasConnected = connected;
        if (connected) { onConnect(); pairScanLogged = false; }
        else           onDisconnect();
        lastR = lastG = lastB = 255;   /* force a lightbar refresh on reconnect */
    }
    if (!connected) return;

    /* Calibration only on a deliberate long press of Create */
    if (ps5.share) {
        unsigned long now = millis();
        if (!shareSince) { shareSince = now; shareUsed = false; }
        if (!shareUsed && now - shareSince >= CAL_HOLD_MS) {
            shareUsed = true;
            turretCalMode(!turretInCalMode());
        }
    } else {
        shareSince = 0;
    }
    (void)(bool)ps5.share.pressed;   /* consume the edge, the level above is what counts */

    if (turretInCalMode()) handleCalibration();
    else                   handleDrive();
    feedback();
}

bool ps5InputConnected() { return wasConnected; }

static void onScanDevice(const uint8_t mac[6], const char *name, int8_t rssi) {
    Log.printf("[PS5]   %02X:%02X:%02X:%02X:%02X:%02X  rssi %4d  %s\n",
                  mac[0], mac[1], mac[2], mac[3], mac[4], mac[5], rssi, (name && *name) ? name : "(no name)");
}

void ps5InputScan(uint8_t secs) {
    if (gunFiring()) { Log.println("[PS5] Firing – scan refused"); return; }
    /* Blocks loop() for the scan: user-requested diagnostic only */
    if (!btLock || xSemaphoreTake(btLock, pdMS_TO_TICKS(8000)) != pdTRUE) { Log.println("[PS5] Bluetooth busy – try again"); return; }
    Log.printf("[PS5] Scanning %u s for Bluetooth Classic devices...\n", secs);
    ps5.scanDevices(secs, onScanDevice);
    xSemaphoreGive(btLock);
    Log.println("[PS5] Scan done");
}

void ps5InputForget() {
    ps5.forget();
    Preferences p;
    p.begin("mostik-ps5", false);
    p.remove("mac");
    p.end();
    bootMac[0] = 0;
    Log.println("[PS5] Controller forgotten – reboot and pair again (PS + Create)");
}

void ps5InputPrintStatus(Print &out) {
    uint8_t mac[6];
    char str[18];
    ps5_l2cap_get_target(mac);
    macToStr(mac, str);
    out.printf("[PS5] %s | known %s | target %s | L2CAP %s%s | pairing scans %lu, stale connects dropped %lu\n",
               wasConnected ? "connected" : "not connected", bootMac[0] ? bootMac : "none",
               ps5_l2cap_has_target() ? str : "none", ps5_l2cap_is_active() ? "up" : "down",
               ps5_l2cap_has_any_cid() ? ", channel pending" : "",
               (unsigned long)pairScans, (unsigned long)pendingDrops);
}
