#pragma once
#include <Arduino.h>

/**
 * MIPI-CSI camera (OV5647) on ESP32-P4 through the ESP_Video library
 * (arduino-esp32 >= 3.3.11), plus the P4 hardware JPEG encoder.
 *
 * A dedicated FreeRTOS task captures RGB565 frames continuously:
 *   - every frame is handed to the detector callback (CameraFrameCb)
 *   - when at least one consumer asked for JPEG (cameraJpegDemand > 0)
 *     the frame is also JPEG-encoded in hardware into a shared buffer
 */
struct CameraSettings {
    int32_t gain;        // -1 = driver default
    int32_t exposure;    // -1 = driver default
    bool    vflip;
    bool    hflip;
    uint8_t jpegQuality; // 1-100
};

typedef void (*CameraFrameCb)(const uint8_t *rgb565, uint32_t width, uint32_t height, uint32_t tsMs);

bool     cameraBegin(CameraFrameCb cb);
bool     cameraReady();
uint32_t cameraWidth();
uint32_t cameraHeight();
float    cameraFps();
const char *cameraLastError();

CameraSettings cameraGetSettings();
bool           cameraApplySettings(const CameraSettings &s);

/* JPEG consumers (MJPEG clients, snapshot) register their interest */
void   cameraJpegDemand(int delta);
size_t cameraJpegMaxSize();
/**
 * Copies the latest JPEG frame into dst when its sequence number differs
 * from *seq. Waits up to waitMs for a new frame. Returns bytes copied (0 = none).
 */
size_t cameraCopyJpeg(uint8_t *dst, size_t cap, uint32_t *seq, uint32_t waitMs);
