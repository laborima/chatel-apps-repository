#include "http_api.h"
#include "config.h"
#include "remote.h"
#include "camera.h"
#include "detector.h"
#include "stats.h"
#include "persist.h"
#include "json_builders.h"
#include "app_events.h"
#include "audio.h"
#include "aim.h"

#include <WiFi.h>
#include <WebServer.h>
#include <LittleFS.h>
#include "esp_heap_caps.h"
#include <esp_task_wdt.h>
#include <atomic>

static WebServer server(HTTP_PORT);
static char json[4096];
static std::atomic<int> activeStreamClients{0};   /* ++ in loop() (core 1), -- in the MJPEG tasks (core 0) */

/* ================= HELPERS ================= */
static void cors() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type, X-Mostikator-Key");
}

static void sendJson(int code, const char *body) {
    cors();
    server.sendHeader("Cache-Control", "no-cache");
    server.send(code, "application/json", body);
}

/* ================= AUTH ================= */
/* Every command (arm, sound, settings, shots...) needs CONTROL_PASSWORD in the X-Mostikator-Key header.
 * A burst of wrong keys locks the commands out for a while: the password is short and the API is public
 * through the SignalK proxy. */
#define AUTH_MAX_FAILURES  5
#define AUTH_LOCKOUT_MS    60000

static uint8_t       authFailures = 0;
static unsigned long authLockedUntil = 0;

static bool keyMatches(const String &key) {
    const char *p = CONTROL_PASSWORD;
    size_t n = strlen(p);
    uint8_t diff = (uint8_t)(key.length() != n);
    for (size_t i = 0; i < n; i++) diff |= (uint8_t)((i < key.length() ? key[i] : 0) ^ p[i]);
    return diff == 0;
}

/* true when the request may run a command; otherwise the 401/429 answer has been sent */
static bool authorized() {
    if (!CONTROL_PASSWORD[0]) return true;
    if (authLockedUntil && (long)(millis() - authLockedUntil) < 0) {
        sendJson(429, "{\"error\":\"too many wrong passwords, retry in a minute\"}");
        return false;
    }
    if (keyMatches(server.header("X-Mostikator-Key"))) {
        authFailures = 0;
        authLockedUntil = 0;
        return true;
    }
    if (server.hasHeader("X-Mostikator-Key") && ++authFailures >= AUTH_MAX_FAILURES) {
        authFailures = 0;
        authLockedUntil = millis() + AUTH_LOCKOUT_MS;
        Log.printf("[HTTP] %d wrong control passwords – commands locked for %d s\n", AUTH_MAX_FAILURES, AUTH_LOCKOUT_MS / 1000);
    }
    sendJson(401, "{\"error\":\"authentication required\"}");
    return false;
}

/* GET /api/auth -> 200 when the key is right (or no password is set), 401 otherwise. Used by the webapp login. */
static void handleAuth() {
    if (!authorized()) return;
    sendJson(200, CONTROL_PASSWORD[0] ? "{\"auth\":true,\"required\":true}" : "{\"auth\":true,\"required\":false}");
}

static void handleOptions() {
    cors();
    server.send(204);
}

/* ================= API ================= */
static void handleStatus() {
    jsonStatus(json, sizeof(json));
    sendJson(200, json);
}

static void handleTargets() {
    jsonTargets(json, sizeof(json));
    sendJson(200, json);
}

static void handleStats() {
    jsonStats(json, sizeof(json));
    sendJson(200, json);
}

static void handleStatsReset() {
    if (!authorized()) return;
    statsReset();
    jsonStats(json, sizeof(json));
    sendJson(200, json);
    appConfigChanged();
}

static void handleArm() {
    if (!authorized()) return;
    detectorArm(true);
    appConfigChanged();
    jsonStatus(json, sizeof(json));
    sendJson(200, json);
}

static void handleDisarm() {
    if (!authorized()) return;
    detectorArm(false);
    appConfigChanged();
    jsonStatus(json, sizeof(json));
    sendJson(200, json);
}

/**
 * POST /api/shot?target=<id>&result=hit|miss
 * Reported by the turret controller (or manually from the UI).
 */
static void handleShot() {
    if (!authorized()) return;
    if (!server.hasArg("result")) {
        sendJson(400, "{\"error\":\"missing result=hit|miss\"}");
        return;
    }
    String result = server.arg("result");
    bool hit = (result == "hit" || result == "1" || result == "true");
    uint16_t targetId = server.hasArg("target") ? (uint16_t)server.arg("target").toInt() : 0;
    appReportShot(targetId, hit);
    jsonStats(json, sizeof(json));
    sendJson(200, json);
}

/**
 * GET  /api/sound                  -> current volume
 * POST /api/sound?volume=<0-100>   -> set it (persisted in NVS)
 * POST /api/sound?test=1           -> play the blaster once
 * POST /api/sound?tone=1           -> play a 1 kHz sine instead (audio path diagnostic)
 * Both parameters can be combined, the volume is applied before the test plays.
 */
static void handleSound() {
    if ((server.hasArg("volume") || server.hasArg("tone") || server.hasArg("test")) && !authorized()) return;
    if (server.hasArg("volume")) {
        long v = server.arg("volume").toInt();
        if (v < 0 || v > 100) {
            sendJson(400, "{\"error\":\"volume must be 0-100\"}");
            return;
        }
        audioSetVolume((uint8_t)v);
        persistSaveAudioVolume((uint8_t)v);
        Log.printf("[AUDIO] Volume set to %ld%%\n", v);
    }
    if (server.hasArg("tone")) {
        audioPlayTone();
        Log.println("[AUDIO] Test tone");
    } else if (server.hasArg("test")) {
        audioLaserFx();
        Log.println("[AUDIO] Test shot");
    }
    snprintf(json, sizeof(json), "{\"type\":\"sound\",\"ready\":%s,\"volume\":%u}",
             audioReady() ? "true" : "false", (unsigned)audioVolume());
    sendJson(200, json);
}

/**
 * GET  /api/config -> current detector + camera settings
 * POST /api/config -> apply (form-encoded or query params), persisted in NVS
 *   detector: downscale threshold min_area max_area confirm_frames miss_frames
 *             max_match_dist learn_shift dark_only warmup_frames
 *             roi_x0 roi_y0 roi_x1 roi_y1 hfov vfov lead_ms noise_k global_change_pct isolation
 *   camera:   gain exposure vflip hflip quality
 *   aim:      aim_auto aim_fire aim_laser aim_pan_gain aim_pan_offset aim_tilt_gain aim_tilt_offset
 *             aim_settle_ms aim_cooldown_ms aim_burst_ms (camera -> turret calibration, tools/calibrate_aim.py)
 *   reset=1   -> factory defaults
 */
static void handleConfig() {
    if (server.method() == HTTP_POST) {
        if (!authorized()) return;
        DetectorConfig c = detectorGetConfig();
        CameraSettings cs = cameraGetSettings();
        bool detChanged = false, camChanged = false, aimChanged = false;
        AimConfig ac = aimGetConfig();

        if (server.hasArg("reset")) {
            c = detectorDefaultConfig();
            cs.gain = CAM_GAIN; cs.exposure = CAM_EXPOSURE;
            cs.vflip = CAM_VFLIP != 0; cs.hflip = CAM_HFLIP != 0;
            cs.jpegQuality = JPEG_QUALITY;
            persistClear();
            aimReset();
            ac = aimGetConfig();
            audioSetVolume(AUDIO_VOLUME);   /* persistClear() also erased the saved volume */
            detChanged = camChanged = true;
            Log.println("[CONFIG] Reset to defaults");
        }

        /* Strict parsing: "", "undefined" or "abc" would read as 0 with toInt() and pass the range
         * check (exposure 0 = black camera, saved in NVS). Anything not fully numeric is ignored. */
        auto argLong = [&](const char *name, long minVal, long maxVal, long &out) -> bool {
            if (!server.hasArg(name)) return false;
            String s = server.arg(name);
            char *end = nullptr;
            long v = strtol(s.c_str(), &end, 10);
            if (s.isEmpty() || *end || v < minVal || v > maxVal) return false;
            out = v;
            return true;
        };
        auto argFloat = [&](const char *name, float minVal, float maxVal, float &out) -> bool {
            if (!server.hasArg(name)) return false;
            String s = server.arg(name);
            char *end = nullptr;
            float v = strtof(s.c_str(), &end);
            if (s.isEmpty() || *end || !(v >= minVal && v <= maxVal)) return false;
            out = v;
            return true;
        };

        long v;
        if (argLong("downscale", 2, 8, v))          { c.downscale = v; detChanged = true; }
        if (argLong("threshold", 1, 255, v))        { c.threshold = v; detChanged = true; }
        if (argLong("min_area", 1, 5000, v))        { c.minArea = v; detChanged = true; }
        if (argLong("max_area", 1, 20000, v))       { c.maxArea = v; detChanged = true; }
        if (argLong("confirm_frames", 1, 50, v))    { c.confirmFrames = v; detChanged = true; }
        if (argLong("miss_frames", 1, 100, v))      { c.missFrames = v; detChanged = true; }
        if (argLong("max_match_dist", 1, 500, v))   { c.maxMatchDist = v; detChanged = true; }
        if (argLong("learn_shift", 1, 10, v))       { c.learnShift = v; detChanged = true; }
        if (argLong("dark_only", 0, 1, v))          { c.darkOnly = v != 0; detChanged = true; }
        if (argLong("warmup_frames", 1, 500, v))    { c.warmupFrames = v; detChanged = true; }
        if (argLong("lead_ms", 0, 2000, v))         { c.leadMs = v; detChanged = true; }
        if (argLong("noise_k", 0, 20, v))           { c.noiseK = v; detChanged = true; }
        if (argLong("global_change_pct", 1, 100, v)) { c.globalChangePct = v; detChanged = true; }
        if (argLong("isolation", 0, 1, v))          { c.isolation = v != 0; detChanged = true; }
        float f;
        if (argFloat("roi_x0", 0, 1, f)) { c.roiX0 = f; detChanged = true; }
        if (argFloat("roi_y0", 0, 1, f)) { c.roiY0 = f; detChanged = true; }
        if (argFloat("roi_x1", 0, 1, f)) { c.roiX1 = f; detChanged = true; }
        if (argFloat("roi_y1", 0, 1, f)) { c.roiY1 = f; detChanged = true; }
        if (argFloat("hfov", 5, 180, f)) { c.hfov = f; detChanged = true; }
        if (argFloat("vfov", 5, 180, f)) { c.vfov = f; detChanged = true; }

        if (argLong("gain", -1, 100000, v))     { cs.gain = v; camChanged = true; }
        if (argLong("exposure", -1, 100000, v)) { cs.exposure = v; camChanged = true; }
        if (argLong("vflip", 0, 1, v))          { cs.vflip = v != 0; camChanged = true; }
        if (argLong("hflip", 0, 1, v))          { cs.hflip = v != 0; camChanged = true; }
        if (argLong("quality", 1, 100, v))      { cs.jpegQuality = v; camChanged = true; }

        if (argLong("aim_auto", 0, 1, v))               { ac.autoAim = v != 0; aimChanged = true; }
        if (argLong("aim_fire", 0, 1, v))               { ac.autoFire = v != 0; aimChanged = true; }
        if (argLong("aim_laser", 0, 1, v))              { ac.laser = v != 0; aimChanged = true; }
        if (argFloat("aim_pan_gain", -10, 10, f))       { ac.panGain = f; aimChanged = true; }
        if (argFloat("aim_pan_offset", -180, 180, f))   { ac.panOffset = f; aimChanged = true; }
        if (argFloat("aim_tilt_gain", -10, 10, f))      { ac.tiltGain = f; aimChanged = true; }
        if (argFloat("aim_tilt_offset", -180, 180, f))  { ac.tiltOffset = f; aimChanged = true; }
        if (argLong("aim_settle_ms", 0, 5000, v))       { ac.settleMs = v; aimChanged = true; }
        if (argLong("aim_cooldown_ms", 200, 60000, v))  { ac.cooldownMs = v; aimChanged = true; }
        if (argLong("aim_burst_ms", 20, 2000, v))       { ac.burstMs = v; aimChanged = true; }
        if (aimChanged) aimSetConfig(ac, true);

        if (detChanged) {
            detectorSetConfig(c);
            persistSaveDetector(detectorGetConfig());
        }
        if (camChanged) {
            cameraApplySettings(cs);
            persistSaveCamera(cameraGetSettings());
        }
        if (detChanged || camChanged || aimChanged) {
            Log.println("[CONFIG] Updated");
            appConfigChanged();
        }
    }

    jsonConfig(json, sizeof(json));
    sendJson(200, json);
}

/**
 * GET /api/log -> tail of the firmware log (text/plain), same history as the telnet console.
 * Read only: remote diagnostics through the SignalK proxy without the USB cable.
 */
static void handleLog() {
    static char *buf = nullptr;
    const size_t cap = 32 * 1024;
    if (!buf) buf = (char *)heap_caps_malloc(cap, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!buf) { sendJson(500, "{\"error\":\"no memory\"}"); return; }
    size_t n = remoteLogCopy(buf, cap);
    cors();
    server.sendHeader("Cache-Control", "no-cache");
    server.send_P(200, "text/plain; charset=utf-8", buf, n);
}

/* GET /api/detector.bmp -> the detector's working grid: changes counted in red, bright changes ignored
 * (dark_only) in cyan, ROI in yellow. Webapp "Vue détecteur". */
static void handleDetectorView() {
    static uint8_t *buf = nullptr;
    const size_t cap = 14 + 40 + 1024 + 400 * 400;   /* up to 1600x1600 / downscale 4 */
    if (!buf) buf = (uint8_t *)heap_caps_malloc(cap, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    size_t n = buf ? detectorDebugBmp(buf, cap) : 0;
    if (!n) { sendJson(503, "{\"error\":\"detector not running\"}"); return; }
    cors();
    server.sendHeader("Cache-Control", "no-store");
    server.send_P(200, "image/bmp", (const char *)buf, n);
}

/* ================= CAPTURE / STREAM ================= */
static void handleCapture() {
    if (!cameraReady() || cameraJpegMaxSize() == 0) {
        sendJson(503, "{\"error\":\"camera not ready\"}");
        return;
    }
    size_t cap = cameraJpegMaxSize();
    uint8_t *buf = (uint8_t *)heap_caps_malloc(cap, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!buf) {
        sendJson(500, "{\"error\":\"no memory\"}");
        return;
    }
    uint32_t seq = cameraJpegSeq();   /* wait for a frame encoded after this request, not the last one kept */
    cameraJpegDemand(+1);
    size_t n = cameraCopyJpeg(buf, cap, &seq, 2000);
    cameraJpegDemand(-1);
    if (!n) {
        heap_caps_free(buf);
        sendJson(504, "{\"error\":\"no frame\"}");
        return;
    }
    cors();
    server.sendHeader("Cache-Control", "no-cache");
    server.send_P(200, "image/jpeg", (const char *)buf, n);
    heap_caps_free(buf);
}

struct StreamArgs {
    WiFiClient client;
};

/**
 * FreeRTOS task: pushes MJPEG frames to one client so the WebServer stays
 * responsive. Each client owns a private copy buffer in PSRAM.
 */
static void mjpegTask(void *pv) {
    StreamArgs *args = static_cast<StreamArgs *>(pv);
    WiFiClient client = args->client;
    delete args;
    client.setNoDelay(true);

    size_t cap = cameraJpegMaxSize();
    uint8_t *buf = (uint8_t *)heap_caps_malloc(cap, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!buf) {
        client.stop();
        activeStreamClients--;
        vTaskDelete(NULL);
        return;
    }

    uint32_t seq = cameraJpegSeq();
    cameraJpegDemand(+1);
    Log.printf("[STREAM] Client started (%d active)\n", activeStreamClients.load());

    while (client.connected()) {
        size_t n = cameraCopyJpeg(buf, cap, &seq, 1000);
        if (!n) continue;
        char hdr[96];
        int hl = snprintf(hdr, sizeof(hdr),
                          "\r\n--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", (unsigned)n);
        if (client.write((const uint8_t *)hdr, hl) != (size_t)hl) break;
        if (client.write(buf, n) != n) break;
    }

    client.stop();
    heap_caps_free(buf);
    cameraJpegDemand(-1);
    activeStreamClients--;
    Log.printf("[STREAM] Client ended (%d remaining)\n", activeStreamClients.load());
    vTaskDelete(NULL);
}

static void handleStream() {
    if (!cameraReady() || cameraJpegMaxSize() == 0) {
        server.send(503, "text/plain", "Camera not ready");
        return;
    }
    if (activeStreamClients >= 4) {
        server.send(503, "text/plain", "Too many stream clients");
        return;
    }

    WiFiClient client = server.client();
    client.println("HTTP/1.1 200 OK");
    client.println("Content-Type: multipart/x-mixed-replace;boundary=frame");
    client.println("Access-Control-Allow-Origin: *");
    client.println("Cache-Control: no-cache, no-store, must-revalidate");
    client.println("Connection: close");
    client.println();

    activeStreamClients++;
    StreamArgs *args = new StreamArgs{ client };
    BaseType_t ret = xTaskCreatePinnedToCore(mjpegTask, "mjpeg", 8192, args, 1, NULL, 0);
    if (ret != pdPASS) {
        Log.println("[STREAM] Failed to create task");
        delete args;
        activeStreamClients--;
    }
}

/* ================= STATIC WEBAPP (LittleFS) ================= */
static const char *contentType(const String &path) {
    if (path.endsWith(".html")) return "text/html";
    if (path.endsWith(".js"))   return "application/javascript";
    if (path.endsWith(".css"))  return "text/css";
    if (path.endsWith(".json")) return "application/json";
    if (path.endsWith(".webmanifest")) return "application/manifest+json";
    if (path.endsWith(".png"))  return "image/png";
    if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
    if (path.endsWith(".svg"))  return "image/svg+xml";
    if (path.endsWith(".ico"))  return "image/x-icon";
    if (path.endsWith(".woff2")) return "font/woff2";
    if (path.endsWith(".woff")) return "font/woff";
    if (path.endsWith(".txt"))  return "text/plain";
    if (path.endsWith(".map"))  return "application/json";
    return "application/octet-stream";
}

static bool serveFile(String path) {
    if (path.endsWith("/")) path += "index.html";
    bool gz = false;
    File f;
    String gzPath = path + ".gz";
    if (LittleFS.exists(gzPath)) {
        f = LittleFS.open(gzPath, "r");
        gz = true;
    } else if (LittleFS.exists(path)) {
        f = LittleFS.open(path, "r");
    } else {
        return false;
    }
    if (!f || f.isDirectory()) {
        if (f) f.close();
        return false;
    }
    server.sendHeader("Cache-Control",
                      path.indexOf("/_next/static/") >= 0 ? "public, max-age=31536000, immutable" : "no-cache");
    if (gz) server.sendHeader("Content-Encoding", "gzip");
    server.setContentLength(f.size());
    server.send(200, contentType(path), "");

    /* Not streamFile(): it ignores short writes and would retry every chunk of a 70 KB bundle for
     * ~10 s each towards a phone that left the WiFi, starving loop() into the watchdog. */
    NetworkClient c = server.client();
    static uint8_t chunk[1436];
    unsigned long t0 = millis();
    while (f.available() && millis() - t0 < 5000) {
        size_t n = f.read(chunk, sizeof(chunk));
        if (!n || c.write(chunk, n) != n) break;
    }
    f.close();
    return true;
}

static void handleNotFound() {
    String uri = server.uri();
    if (uri.startsWith("/api/")) {
        sendJson(404, "{\"error\":\"not found\"}");
        return;
    }
    if (serveFile(uri)) return;
    if (!uri.endsWith("/") && serveFile(uri + "/")) return;
    // SPA fallback
    if (serveFile("/index.html")) return;
    server.send(404, "text/plain",
                "Mostikator: webapp not installed on LittleFS. Run signalk-mostikator/deploy-esp.sh, "
                "or use the API under /api/");
}

/* ================= SETUP ================= */
void httpBegin() {
    server.on("/api/", HTTP_GET, handleStatus);
    server.on("/api", HTTP_GET, handleStatus);
    server.on("/api/status", HTTP_GET, handleStatus);
    server.on("/api/auth", HTTP_GET, handleAuth);
    server.on("/api/targets", HTTP_GET, handleTargets);
    server.on("/api/stats", HTTP_GET, handleStats);
    server.on("/api/stats/reset", HTTP_POST, handleStatsReset);
    server.on("/api/arm", HTTP_POST, handleArm);
    server.on("/api/arm", HTTP_GET, handleArm);
    server.on("/api/disarm", HTTP_POST, handleDisarm);
    server.on("/api/disarm", HTTP_GET, handleDisarm);
    server.on("/api/shot", HTTP_POST, handleShot);
    server.on("/api/shot", HTTP_GET, handleShot);
    server.on("/api/sound", HTTP_GET, handleSound);
    server.on("/api/sound", HTTP_POST, handleSound);
    server.on("/api/config", HTTP_GET, handleConfig);
    server.on("/api/config", HTTP_POST, handleConfig);
    server.on("/api/capture", HTTP_GET, handleCapture);
    server.on("/api/stream", HTTP_GET, handleStream);
    server.on("/api/log", HTTP_GET, handleLog);
    server.on("/api/detector.bmp", HTTP_GET, handleDetectorView);

    const char *optionRoutes[] = { "/api/", "/api/status", "/api/targets", "/api/stats", "/api/stats/reset",
                                   "/api/arm", "/api/disarm", "/api/auth", "/api/shot", "/api/sound", "/api/config", "/api/capture", "/api/stream", "/api/log" };
    for (const char *r : optionRoutes) server.on(r, HTTP_OPTIONS, handleOptions);

    const char *headers[] = { "X-Mostikator-Key" };
    server.collectHeaders(headers, 1);
    server.onNotFound(handleNotFound);
    server.begin();
    Log.printf("[HTTP] Server started on port %d\n", HTTP_PORT);
}

void httpLoop() { server.handleClient(); }

int httpStreamClients() { return activeStreamClients.load(); }
