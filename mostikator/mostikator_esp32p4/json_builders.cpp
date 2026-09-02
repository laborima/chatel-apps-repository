#include "json_builders.h"
#include "config.h"
#include "camera.h"
#include "stats.h"
#include "wifi_manager.h"
#include "events_ws.h"

static const char *eventName(DetectorEventType t) {
    switch (t) {
        case DET_EVT_ACQUIRED: return "acquired";
        case DET_EVT_UPDATED:  return "updated";
        default:               return "lost";
    }
}

size_t jsonStatus(char *buf, size_t cap) {
    Stats st = statsGet();
    return snprintf(buf, cap,
        "{\"type\":\"status\",\"device\":\"%s\",\"ip\":\"%s\",\"wifi_rssi\":%d,\"ntp_synced\":%s,"
        "\"uptime\":%lu,\"free_heap\":%u,\"free_psram\":%u,"
        "\"camera\":{\"ready\":%s,\"width\":%u,\"height\":%u,\"fps\":%.1f,\"error\":\"%s\"},"
        "\"detector\":{\"state\":\"%s\",\"armed\":%s,\"fps\":%.1f,\"work_width\":%u,\"work_height\":%u,"
        "\"blobs\":%u,\"tracks\":%u,\"frames\":%lu,\"process_ms\":%lu},"
        "\"stats\":{\"seen\":%lu,\"shots\":%lu,\"hits\":%lu,\"misses\":%lu},"
        "\"ws_clients\":%d,\"ws_port\":%d}",
        DEVICE_NAME, wifiIp().c_str(), wifiRssi(), wifiNtpSynced() ? "true" : "false",
        (unsigned long)(millis() / 1000), (unsigned)ESP.getFreeHeap(), (unsigned)ESP.getFreePsram(),
        cameraReady() ? "true" : "false", (unsigned)cameraWidth(), (unsigned)cameraHeight(), cameraFps(), cameraLastError(),
        detectorStateName(), detectorArmed() ? "true" : "false", detectorFps(),
        (unsigned)detectorWorkWidth(), (unsigned)detectorWorkHeight(),
        (unsigned)detectorBlobCount(), (unsigned)detectorActiveTracks(),
        (unsigned long)detectorFrameCount(), (unsigned long)detectorProcessMs(),
        (unsigned long)st.seen, (unsigned long)st.shots, (unsigned long)st.hits, (unsigned long)st.misses,
        wsClients(), WS_PORT);
}

size_t jsonConfig(char *buf, size_t cap) {
    DetectorConfig c = detectorGetConfig();
    CameraSettings cs = cameraGetSettings();
    return snprintf(buf, cap,
        "{\"type\":\"config\",\"detector\":{\"downscale\":%u,\"threshold\":%u,\"min_area\":%u,\"max_area\":%u,"
        "\"confirm_frames\":%u,\"miss_frames\":%u,\"max_match_dist\":%u,\"learn_shift\":%u,\"dark_only\":%s,"
        "\"warmup_frames\":%u,\"roi\":[%.3f,%.3f,%.3f,%.3f],\"hfov\":%.1f,\"vfov\":%.1f,\"lead_ms\":%u},"
        "\"camera\":{\"gain\":%ld,\"exposure\":%ld,\"vflip\":%s,\"hflip\":%s,\"quality\":%u}}",
        c.downscale, c.threshold, c.minArea, c.maxArea, c.confirmFrames, c.missFrames, c.maxMatchDist,
        c.learnShift, c.darkOnly ? "true" : "false", c.warmupFrames,
        c.roiX0, c.roiY0, c.roiX1, c.roiY1, c.hfov, c.vfov, c.leadMs,
        (long)cs.gain, (long)cs.exposure, cs.vflip ? "true" : "false", cs.hflip ? "true" : "false", cs.jpegQuality);
}

size_t jsonStats(char *buf, size_t cap) {
    Stats st = statsGet();
    return snprintf(buf, cap,
        "{\"type\":\"stats\",\"seen\":%lu,\"shots\":%lu,\"hits\":%lu,\"misses\":%lu,"
        "\"last_shot_ago\":%ld,\"last_target\":%u,\"last_result\":\"%s\"}",
        (unsigned long)st.seen, (unsigned long)st.shots, (unsigned long)st.hits, (unsigned long)st.misses,
        st.lastShotMs ? (long)((millis() - st.lastShotMs) / 1000) : -1L, st.lastTargetId, st.lastResult);
}

size_t jsonTarget(const Target &t, char *buf, size_t cap) {
    return snprintf(buf, cap,
        "{\"id\":%u,\"x\":%.4f,\"y\":%.4f,\"vx\":%.3f,\"vy\":%.3f,\"px\":%.4f,\"py\":%.4f,"
        "\"pan\":%.2f,\"tilt\":%.2f,\"w\":%.4f,\"h\":%.4f,\"confidence\":%.2f,\"age_ms\":%lu,\"hits\":%u,\"misses\":%u}",
        t.id, t.x, t.y, t.vx, t.vy, t.predX, t.predY, t.pan, t.tilt, t.w, t.h, t.confidence,
        (unsigned long)t.ageMs, t.hits, t.misses);
}

size_t jsonTargets(char *buf, size_t cap) {
    Target targets[16];
    size_t n = detectorGetTargets(targets, 16);
    size_t pos = snprintf(buf, cap, "{\"type\":\"targets\",\"ts\":%lu,\"targets\":[", (unsigned long)millis());
    for (size_t i = 0; i < n && pos < cap; i++) {
        if (i) pos += snprintf(buf + pos, cap - pos, ",");
        pos += jsonTarget(targets[i], buf + pos, cap - pos);
    }
    if (pos < cap) pos += snprintf(buf + pos, cap - pos, "]}");
    return pos;
}

size_t jsonDetectorEvent(const DetectorEvent &e, char *buf, size_t cap) {
    size_t pos = snprintf(buf, cap, "{\"type\":\"event\",\"event\":\"%s\",\"ts\":%lu,\"target\":",
                          eventName(e.type), (unsigned long)e.tsMs);
    pos += jsonTarget(e.target, buf + pos, cap - pos);
    if (pos < cap) pos += snprintf(buf + pos, cap - pos, "}");
    return pos;
}

size_t jsonShotEvent(uint16_t targetId, bool hit, char *buf, size_t cap) {
    return snprintf(buf, cap, "{\"type\":\"event\",\"event\":\"shot\",\"ts\":%lu,\"target_id\":%u,\"result\":\"%s\"}",
                    (unsigned long)millis(), targetId, hit ? "hit" : "miss");
}

/* ================= SIGNALK ================= */
#define SK "environment.mostikator."

size_t skStatusValues(char *buf, size_t cap) {
    Stats st = statsGet();
    return snprintf(buf, cap,
        "{\"path\":\"" SK "detector.state\",\"value\":\"%s\"},"
        "{\"path\":\"" SK "detector.fps\",\"value\":%.1f},"
        "{\"path\":\"" SK "detector.activeTargets\",\"value\":%u},"
        "{\"path\":\"" SK "camera.fps\",\"value\":%.1f},"
        "{\"path\":\"" SK "camera.ready\",\"value\":%s},"
        "{\"path\":\"" SK "stats.seen\",\"value\":%lu},"
        "{\"path\":\"" SK "stats.shots\",\"value\":%lu},"
        "{\"path\":\"" SK "stats.hits\",\"value\":%lu},"
        "{\"path\":\"" SK "stats.misses\",\"value\":%lu},"
        "{\"path\":\"" SK "device.rssi\",\"value\":%d},"
        "{\"path\":\"" SK "device.uptime\",\"value\":%lu},"
        "{\"path\":\"" SK "device.ip\",\"value\":\"%s\"}",
        detectorStateName(), detectorFps(), (unsigned)detectorActiveTracks(),
        cameraFps(), cameraReady() ? "true" : "false",
        (unsigned long)st.seen, (unsigned long)st.shots, (unsigned long)st.hits, (unsigned long)st.misses,
        wifiRssi(), (unsigned long)(millis() / 1000), wifiIp().c_str());
}

size_t skTargetValues(const Target *t, char *buf, size_t cap) {
    if (!t) {
        return snprintf(buf, cap, "{\"path\":\"" SK "target\",\"value\":null}");
    }
    size_t pos = snprintf(buf, cap, "{\"path\":\"" SK "target\",\"value\":");
    pos += jsonTarget(*t, buf + pos, cap - pos);
    if (pos < cap) pos += snprintf(buf + pos, cap - pos, "}");
    return pos;
}

size_t skEventValues(const DetectorEvent &e, char *buf, size_t cap) {
    size_t pos = snprintf(buf, cap, "{\"path\":\"" SK "event\",\"value\":{\"event\":\"%s\",\"target\":",
                          eventName(e.type));
    pos += jsonTarget(e.target, buf + pos, cap - pos);
    if (pos < cap) pos += snprintf(buf + pos, cap - pos, "}}");
    return pos;
}

size_t skShotValues(uint16_t targetId, bool hit, char *buf, size_t cap) {
    Stats st = statsGet();
    return snprintf(buf, cap,
        "{\"path\":\"" SK "event\",\"value\":{\"event\":\"shot\",\"target_id\":%u,\"result\":\"%s\"}},"
        "{\"path\":\"" SK "stats.shots\",\"value\":%lu},"
        "{\"path\":\"" SK "stats.hits\",\"value\":%lu},"
        "{\"path\":\"" SK "stats.misses\",\"value\":%lu}",
        targetId, hit ? "hit" : "miss",
        (unsigned long)st.shots, (unsigned long)st.hits, (unsigned long)st.misses);
}
