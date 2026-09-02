#include "http_api.h"
#include "config.h"
#include "camera.h"
#include "detector.h"
#include "stats.h"
#include "persist.h"
#include "json_builders.h"
#include "app_events.h"

#include <WiFi.h>
#include <WebServer.h>
#include <LittleFS.h>
#include "esp_heap_caps.h"

static WebServer server(HTTP_PORT);
static char json[4096];
static volatile int activeStreamClients = 0;

/* ================= HELPERS ================= */
static void cors() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

static void sendJson(int code, const char *body) {
    cors();
    server.sendHeader("Cache-Control", "no-cache");
    server.send(code, "application/json", body);
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
    statsReset();
    jsonStats(json, sizeof(json));
    sendJson(200, json);
    appConfigChanged();
}

static void handleArm() {
    detectorArm(true);
    appConfigChanged();
    jsonStatus(json, sizeof(json));
    sendJson(200, json);
}

static void handleDisarm() {
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
 * GET  /api/config -> current detector + camera settings
 * POST /api/config -> apply (form-encoded or query params), persisted in NVS
 *   detector: downscale threshold min_area max_area confirm_frames miss_frames
 *             max_match_dist learn_shift dark_only warmup_frames
 *             roi_x0 roi_y0 roi_x1 roi_y1 hfov vfov lead_ms
 *   camera:   gain exposure vflip hflip quality
 *   reset=1   -> factory defaults
 */
static void handleConfig() {
    if (server.method() == HTTP_POST) {
        DetectorConfig c = detectorGetConfig();
        CameraSettings cs = cameraGetSettings();
        bool detChanged = false, camChanged = false;

        if (server.hasArg("reset")) {
            c = detectorDefaultConfig();
            cs.gain = CAM_GAIN; cs.exposure = CAM_EXPOSURE;
            cs.vflip = CAM_VFLIP != 0; cs.hflip = CAM_HFLIP != 0;
            cs.jpegQuality = JPEG_QUALITY;
            persistClear();
            detChanged = camChanged = true;
            Serial.println("[CONFIG] Reset to defaults");
        }

        auto argLong = [&](const char *name, long minVal, long maxVal, long &out) -> bool {
            if (!server.hasArg(name)) return false;
            long v = server.arg(name).toInt();
            if (v < minVal || v > maxVal) return false;
            out = v;
            return true;
        };
        auto argFloat = [&](const char *name, float minVal, float maxVal, float &out) -> bool {
            if (!server.hasArg(name)) return false;
            float v = server.arg(name).toFloat();
            if (v < minVal || v > maxVal) return false;
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

        if (detChanged) {
            detectorSetConfig(c);
            persistSaveDetector(detectorGetConfig());
        }
        if (camChanged) {
            cameraApplySettings(cs);
            persistSaveCamera(cameraGetSettings());
        }
        if (detChanged || camChanged) {
            Serial.println("[CONFIG] Updated");
            appConfigChanged();
        }
    }

    jsonConfig(json, sizeof(json));
    sendJson(200, json);
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
    cameraJpegDemand(+1);
    uint32_t seq = 0;
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
    client.setTimeout(2);
    client.setNoDelay(true);

    size_t cap = cameraJpegMaxSize();
    uint8_t *buf = (uint8_t *)heap_caps_malloc(cap, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!buf) {
        client.stop();
        activeStreamClients = activeStreamClients - 1;
        vTaskDelete(NULL);
        return;
    }

    cameraJpegDemand(+1);
    Serial.printf("[STREAM] Client started (%d active)\n", (int)activeStreamClients);

    uint32_t seq = 0;
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
    activeStreamClients = activeStreamClients - 1;
    Serial.printf("[STREAM] Client ended (%d remaining)\n", (int)activeStreamClients);
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

    activeStreamClients = activeStreamClients + 1;
    StreamArgs *args = new StreamArgs{ client };
    BaseType_t ret = xTaskCreatePinnedToCore(mjpegTask, "mjpeg", 8192, args, 1, NULL, 0);
    if (ret != pdPASS) {
        Serial.println("[STREAM] Failed to create task");
        delete args;
        activeStreamClients = activeStreamClients - 1;
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
    // WebServer::streamFile adds "Content-Encoding: gzip" itself for *.gz files
    (void)gz;
    server.sendHeader("Cache-Control",
                      path.indexOf("/_next/static/") >= 0 ? "public, max-age=31536000, immutable" : "no-cache");
    server.streamFile(f, contentType(path));
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
    server.on("/api/targets", HTTP_GET, handleTargets);
    server.on("/api/stats", HTTP_GET, handleStats);
    server.on("/api/stats/reset", HTTP_POST, handleStatsReset);
    server.on("/api/arm", HTTP_POST, handleArm);
    server.on("/api/arm", HTTP_GET, handleArm);
    server.on("/api/disarm", HTTP_POST, handleDisarm);
    server.on("/api/disarm", HTTP_GET, handleDisarm);
    server.on("/api/shot", HTTP_POST, handleShot);
    server.on("/api/shot", HTTP_GET, handleShot);
    server.on("/api/config", HTTP_GET, handleConfig);
    server.on("/api/config", HTTP_POST, handleConfig);
    server.on("/api/capture", HTTP_GET, handleCapture);
    server.on("/api/stream", HTTP_GET, handleStream);

    const char *optionRoutes[] = { "/api/", "/api/status", "/api/targets", "/api/stats", "/api/stats/reset",
                                   "/api/arm", "/api/disarm", "/api/shot", "/api/config", "/api/capture", "/api/stream" };
    for (const char *r : optionRoutes) server.on(r, HTTP_OPTIONS, handleOptions);

    server.onNotFound(handleNotFound);
    server.begin();
    Serial.printf("[HTTP] Server started on port %d\n", HTTP_PORT);
}

void httpLoop() { server.handleClient(); }

int httpStreamClients() { return activeStreamClients; }
