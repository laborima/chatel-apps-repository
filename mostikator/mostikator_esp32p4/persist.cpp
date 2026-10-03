#include "persist.h"
#include <Preferences.h>

static Preferences prefs;
#define DET_BLOB_VERSION 3   /* 2: noiseK + globalChangePct, 3: isolation */

void persistBegin() {
    prefs.begin("mostik-cfg", false);
}

bool persistLoadDetector(DetectorConfig &cfg) {
    if (prefs.getUChar("det_ver", 0) != DET_BLOB_VERSION) return false;
    if (prefs.getBytesLength("det") != sizeof(DetectorConfig)) return false;
    prefs.getBytes("det", &cfg, sizeof(DetectorConfig));
    return true;
}

void persistSaveDetector(const DetectorConfig &cfg) {
    prefs.putUChar("det_ver", DET_BLOB_VERSION);
    prefs.putBytes("det", &cfg, sizeof(DetectorConfig));
}

bool persistLoadCamera(CameraSettings &s) {
    if (prefs.getBytesLength("cam") != sizeof(CameraSettings)) return false;
    prefs.getBytes("cam", &s, sizeof(CameraSettings));
    return true;
}

void persistSaveCamera(const CameraSettings &s) {
    prefs.putBytes("cam", &s, sizeof(CameraSettings));
}

bool persistLoadAudioVolume(uint8_t &percent) {
    if (!prefs.isKey("aud_vol")) return false;
    percent = prefs.getUChar("aud_vol", percent);
    return true;
}

void persistSaveAudioVolume(uint8_t percent) {
    prefs.putUChar("aud_vol", percent);
}

void persistClear() {
    prefs.remove("aud_vol");
    prefs.remove("det");
    prefs.remove("det_ver");
    prefs.remove("cam");
}
