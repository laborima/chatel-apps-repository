/**
 * Mostikator – mosquito detection node
 * "Le moustique a tort. L'Empire contre-attaque."
 *
 * Firmware for the Waveshare ESP32-P4-WIFI6 (ESP32-P4 + ESP32-C6 radio)
 * with an OV5647 MIPI-CSI camera.
 *
 * What it does:
 *   - Captures RGB565 frames continuously (ESP_Video, MIPI-CSI)
 *   - Detects small moving objects (background subtraction + blob tracking)
 *   - Exposes confirmed targets as normalised coordinates + pan/tilt angles
 *   - Publishes to SignalK through the MQTT bridge (topic signalk/delta)
 *   - Streams JSON events on a WebSocket (port WS_PORT)
 *   - Serves a REST API + MJPEG stream + the webapp itself (LittleFS)
 *   - Keeps hunt statistics (seen / shots / hits / misses) in NVS
 *   - Optional 16x2 LCD with the live scoreboard
 *   - Fires a blaster sound on the on-board ES8311 codec / speaker header at every shot,
 *     including the manual ones the turret announces on the UART2 link. With no turret
 *     answering, a confirmed target fires it on its own so the detection stays audible.
 *
 *   - Remote maintenance: OTA updates (firmware + webapp), telnet console with the log history,
 *     GET /api/log (see remote.h)
 *
 * Deployment:
 *   - firmware    : mostikator_esp32p4/deploy-ota.sh (WiFi) or --usb for the first flash
 *   - on SignalK  : chatel-signalk-weatherprovider/deploy-signalk.sh --mostikator
 *   - on the ESP32: signalk-mostikator/deploy-esp.sh --ota (LittleFS image over WiFi) or USB
 *
 * Arduino IDE settings:
 *   arduino-esp32 >= 3.3.11, board "ESP32P4 Dev Module", PSRAM: Enabled,
 *   Flash Size: 32MB, Partition Scheme: Custom (partitions.csv in this folder),
 *   Chip Variant: match the ROM banner on the serial console –
 *   "esp32p4-eco2" (Waveshare ESP32-P4-WIFI6 rev 1.x) = "Before v3.00",
 *   "esp32p4-eco5" = "v3.00 or newer" (a wrong variant crashes the bootloader).
 *   USB CDC On Boot: Disabled when the serial console is the CH343 "UART" port,
 *   Enabled when using the native "USB" port.
 *
 * Dependencies (Library Manager):
 *   PubSubClient, WebSockets (Links2004), LiquidCrystal (optional)
 *
 * @author Matthieu Laborie
 */

#include <Arduino.h>
#include <LittleFS.h>
#include <esp_task_wdt.h>
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include <atomic>

#include "config.h"
#include "remote.h"
#include "wifi_manager.h"
#include "camera.h"
#include "detector.h"
#include "stats.h"
#include "persist.h"
#include "json_builders.h"
#include "signalk_mqtt.h"
#include "events_ws.h"
#include "http_api.h"
#include "lcd_display.h"
#include "audio.h"
#include "turret_link.h"
#include "aim.h"
#include "app_events.h"

static QueueHandle_t evtQueue = nullptr;
static char          json[4096];
static unsigned long lastStatusPublish = 0;
static unsigned long lastTargetPublish = 0;
static bool          targetsDirty = false;
/* Set by the camera task on every tracked frame (36/s per target): as a flag, not a queued event,
 * so a short stall of loop() never fills the queue and drops the ACQUIRED / LOST events */
static std::atomic<bool> targetsMoved{false};
static bool          hadTarget = false;
static bool          cameraOk = false;

/* ================= LED ================= */
static void ledSet(bool on) {
#if LED_PIN >= 0
    digitalWrite(LED_PIN, on ? HIGH : LOW);
#else
    (void)on;
#endif
}

/* ================= CAMERA -> DETECTOR ================= */
static void onCameraFrame(const uint8_t *rgb565, uint32_t w, uint32_t h, uint32_t ts) {
    detectorProcess(rgb565, w, h, ts);
}

/* ================= DETECTOR EVENTS (camera task context) ================= */
void appOnDetectorEvent(const DetectorEvent &evt) {
    if (evt.type == DET_EVT_UPDATED) { targetsMoved = true; return; }
    if (!evtQueue) return;
    xQueueSend(evtQueue, &evt, 0);   // drop when full – the tracker snapshot is authoritative
}

/* ================= HOOKS ================= */
void appReportShot(uint16_t targetId, bool hit) {
    statsShot(hit, targetId);
    Log.printf("[SHOT] target #%u -> %s\n", targetId, hit ? "HIT" : "miss");

    audioLaserFx();

    jsonShotEvent(targetId, hit, json, sizeof(json));
    wsBroadcast(json);
    jsonStats(json, sizeof(json));
    wsBroadcast(json);

    skShotValues(targetId, hit, json, sizeof(json));
    signalkPublishValues(json);

    lcdMessage("PEW PEW !", hit ? "  MOUSTIQUE KO" : "  LOUPE...");
}

void appConfigChanged() {
    targetsDirty = true;   /* a disarm clears the tracks: publish the empty list, clear SignalK's target */
    jsonConfig(json, sizeof(json));
    wsBroadcast(json);
    jsonStatus(json, sizeof(json));
    wsBroadcast(json);
    ledSet(detectorArmed());
}

/* With no turret on the link nothing ever fires, so the detector would be silent.
 * Play the blaster ourselves on a confirmed target - the turret takes the trigger back
 * as soon as it answers. Rate limited: a swarm must not machine-gun the speaker. */
static void simulateShotIfNoTurret() {
#if SIMULATE_SHOT_NO_TURRET
    if (turretLinkConnected()) return;
    static unsigned long lastSimMs = 0;
    unsigned long now = millis();
    if (lastSimMs != 0 && now - lastSimMs < SIMULATE_SHOT_MIN_GAP_MS) return;
    lastSimMs = now;
    audioLaserFx();
    Log.println("[SIM] No turret on the link – blaster fired for the detection");
#endif
}

/* ================= EVENT PUMP ================= */
static void drainEvents() {
    DetectorEvent evt;
    int budget = 32;
    while (budget-- > 0 && xQueueReceive(evtQueue, &evt, 0) == pdTRUE) {
        esp_task_wdt_reset();   /* each event broadcasts to WS clients; a stalled one can take seconds */
        switch (evt.type) {
            case DET_EVT_ACQUIRED:
                statsTargetSeen();
                simulateShotIfNoTurret();
                Log.printf("[DET] Target #%u acquired at (%.2f, %.2f) pan %.1f tilt %.1f\n",
                              evt.target.id, evt.target.x, evt.target.y, evt.target.pan, evt.target.tilt);
                jsonDetectorEvent(evt, json, sizeof(json));
                wsBroadcast(json);
                skEventValues(evt, json, sizeof(json));
                signalkPublishValues(json);
                jsonStats(json, sizeof(json));
                wsBroadcast(json);
                targetsDirty = true;
                break;
            case DET_EVT_LOST:
                Log.printf("[DET] Target #%u lost after %lu ms\n", evt.target.id, (unsigned long)evt.target.ageMs);
                jsonDetectorEvent(evt, json, sizeof(json));
                wsBroadcast(json);
                skEventValues(evt, json, sizeof(json));
                signalkPublishValues(json);
                targetsDirty = true;
                break;
            case DET_EVT_UPDATED:
            default:
                targetsDirty = true;
                break;
        }
    }
}

static void publishTargets() {
    if (targetsMoved.exchange(false)) targetsDirty = true;
    unsigned long now = millis();
    if (!targetsDirty || now - lastTargetPublish < PUBLISH_TARGET_MS) return;
    lastTargetPublish = now;
    targetsDirty = false;

    jsonTargets(json, sizeof(json));
    wsBroadcast(json);

    Target primary;
    if (detectorPrimaryTarget(primary)) {
        skTargetValues(&primary, json, sizeof(json));
        signalkPublishValues(json);
        hadTarget = true;
    } else if (hadTarget) {
        skTargetValues(nullptr, json, sizeof(json));
        signalkPublishValues(json);
        hadTarget = false;
    }
}

static void publishStatus() {
    unsigned long now = millis();
    if (now - lastStatusPublish < PUBLISH_STATUS_MS) return;
    lastStatusPublish = now;

    jsonStatus(json, sizeof(json));
    wsBroadcast(json);

    skStatusValues(json, sizeof(json));
    signalkPublishValues(json);

    // Retry the camera if it failed at boot (ribbon plugged late, etc.)
    static unsigned long lastCameraRetry = 0;
    if (!cameraOk && now - lastCameraRetry >= 30000) {
        lastCameraRetry = now;
        cameraOk = cameraBegin(onCameraFrame);
        if (cameraOk && DET_AUTO_ARM) detectorArm(true);
    }
}

/* ================= SETUP ================= */
void setup() {
    Serial.begin(115200);
    delay(300);
    remoteBegin();    /* first: the log history must hold the whole boot */
    if (esp_reset_reason() == ESP_RST_PANIC || esp_reset_reason() == ESP_RST_TASK_WDT) remotePrintCrash(Log, false);
    Log.println();
    Log.printf("[BOOT] Mostikator – le moustique a tort (built " __DATE__ " " __TIME__ ", reset reason %d)\n",
               (int)esp_reset_reason());
    Log.printf("[BOOT] PSRAM: %s (%u bytes)\n", psramFound() ? "YES" : "NO",
                  psramFound() ? (unsigned)ESP.getPsramSize() : 0);

#if LED_PIN >= 0
    pinMode(LED_PIN, OUTPUT);
#endif
    ledSet(false);

    esp_task_wdt_config_t wdtConfig = {
        .timeout_ms = WDT_TIMEOUT_S * 1000,
        .idle_core_mask = 0,
        .trigger_panic = true
    };
    if (esp_task_wdt_reconfigure(&wdtConfig) != ESP_OK) {
        esp_task_wdt_init(&wdtConfig);
    }
    esp_task_wdt_add(NULL);
    Log.println("[WDT] Watchdog enabled");

    if (!LittleFS.begin(true)) {
        Log.println("[FS] LittleFS mount failed – webapp unavailable, API still works");
    } else {
        Log.printf("[FS] LittleFS mounted (%u / %u bytes used)\n",
                      (unsigned)LittleFS.usedBytes(), (unsigned)LittleFS.totalBytes());
    }

    evtQueue = xQueueCreate(64, sizeof(DetectorEvent));

    persistBegin();
    statsBegin();

    DetectorConfig dc = detectorDefaultConfig();
    if (persistLoadDetector(dc)) Log.println("[DET] Config loaded from NVS");
    detectorBegin(dc, appOnDetectorEvent);

    CameraSettings cs = cameraGetSettings();
    if (persistLoadCamera(cs)) {
        cameraApplySettings(cs);
        Log.println("[CAM] Settings loaded from NVS");
    }

    /* Before the camera: the ES8311 shares the SCCB bus, which the camera driver keeps for good. */
    audioBegin();
    uint8_t savedVolume;
    if (persistLoadAudioVolume(savedVolume)) {
        audioSetVolume(savedVolume);
        Log.printf("[AUDIO] Volume %u%% loaded from NVS\n", (unsigned)savedVolume);
    }

    wifiBegin();

    cameraOk = cameraBegin(onCameraFrame);
    if (!cameraOk) Log.printf("[CAM] Init failed (%s) – will retry periodically\n", cameraLastError());

    httpBegin();
    wsBegin();
    signalkBegin();
    lcdBegin();
    turretLinkBegin();
    aimBegin();

    if (DET_AUTO_ARM && cameraOk) detectorArm(true);
    ledSet(detectorArmed());

    Log.println("[BOOT] Setup complete");
}

/* ================= LOOP ================= */
void loop() {
    esp_task_wdt_reset();
    wifiLoop();
    remoteLoop();     /* OTA + telnet + serial console */
    signalkLoop();
    httpLoop();
    wsLoop();
    statsLoop();
    lcdLoop();
    turretLinkLoop();
    drainEvents();
    aimLoop();
    publishTargets();
    publishStatus();
    delay(1);
}
