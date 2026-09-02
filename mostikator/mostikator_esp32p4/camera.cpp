#include "camera.h"
#include "config.h"

#include <ESP_Video.h>
#include "driver/jpeg_encode.h"
#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"

#if !defined(CONFIG_ESP_VIDEO_ENABLE_MIPI_CSI_VIDEO_DEVICE)
#error "ESP_Video MIPI-CSI support missing: use arduino-esp32 >= 3.3.11, board 'ESP32P4 Dev Module', PSRAM enabled"
#endif

static ESPVideoClass           video;
static ESPVideoCaptureDevClass captureDev;
static CameraFrameCb           frameCb = nullptr;

static volatile bool     ready = false;
static volatile uint32_t frameW = 0;
static volatile uint32_t frameH = 0;
static volatile float    fps = 0;
static const char       *lastError = "";

static CameraSettings settings = { CAM_GAIN, CAM_EXPOSURE, CAM_VFLIP != 0, CAM_HFLIP != 0, JPEG_QUALITY };

/* ---- hardware JPEG encoder ---- */
static jpeg_encoder_handle_t jpegEnc = nullptr;
static uint8_t          *jpegBuf = nullptr;
static size_t            jpegCap = 0;
static volatile size_t   jpegLen = 0;
static volatile uint32_t jpegSeq = 0;
static volatile int      jpegDemand = 0;
static SemaphoreHandle_t jpegMutex = nullptr;
static TaskHandle_t      camTask = nullptr;

static bool initJpeg(uint32_t w, uint32_t h) {
    jpeg_encode_engine_cfg_t eng = {};
    eng.intr_priority = 0;
    eng.timeout_ms = 200;
    if (jpeg_new_encoder_engine(&eng, &jpegEnc) != ESP_OK) {
        lastError = "jpeg engine";
        return false;
    }
    jpeg_encode_memory_alloc_cfg_t mem = {};
    mem.buffer_direction = JPEG_ENC_ALLOC_OUTPUT_BUFFER;
    // Worst case at quality 100 is close to 1 byte / pixel; 1080p -> ~2 MB in PSRAM.
    size_t want = (size_t)w * h;
    jpegBuf = (uint8_t *)jpeg_alloc_encoder_mem(want, &mem, &jpegCap);
    if (!jpegBuf) {
        lastError = "jpeg buffer";
        return false;
    }
    Serial.printf("[CAM] JPEG encoder ready (%u bytes output buffer)\n", (unsigned)jpegCap);
    return true;
}

static bool encodeJpeg(const uint8_t *src, size_t srcLen, uint32_t w, uint32_t h) {
    if (!jpegEnc || !jpegBuf) return false;
    jpeg_encode_cfg_t cfg = {};
    cfg.height = h;
    cfg.width = w;
    cfg.src_type = JPEG_ENCODE_IN_FORMAT_RGB565;
    cfg.sub_sample = JPEG_DOWN_SAMPLING_YUV420;
    cfg.image_quality = settings.jpegQuality;

    if (xSemaphoreTake(jpegMutex, pdMS_TO_TICKS(50)) != pdTRUE) return false;
    uint32_t out = 0;
    esp_err_t err = jpeg_encoder_process(jpegEnc, &cfg, src, srcLen, jpegBuf, jpegCap, &out);
    if (err == ESP_OK) {
        jpegLen = out;
        jpegSeq = jpegSeq + 1;
    }
    xSemaphoreGive(jpegMutex);
    if (err != ESP_OK) {
        static uint32_t lastLog = 0;
        if (millis() - lastLog > 5000) {
            lastLog = millis();
            Serial.printf("[CAM] JPEG encode failed: 0x%x\n", err);
        }
    }
    return err == ESP_OK;
}

static void cameraTask(void *) {
    uint32_t frames = 0;
    uint32_t fpsT = millis();
    for (;;) {
        ESPVideoBufferClass buf = captureDev.captureBuffer();
        if (!buf.valid()) {
            vTaskDelay(pdMS_TO_TICKS(5));
            continue;
        }
        uint32_t w = buf.getWidth();
        uint32_t h = buf.getHeight();
        if (w == 0 || h == 0 || buf.formatType() != ESP_VIDEO_FORMAT_RGB565) {
            vTaskDelay(1);
            continue;
        }
        frameW = w;
        frameH = h;
        uint32_t now = millis();

        if (frameCb) frameCb(buf.data(), w, h, now);
        if (jpegDemand > 0) encodeJpeg(buf.data(), buf.size(), w, h);

        frames++;
        if (now - fpsT >= 1000) {
            fps = frames * 1000.0f / (float)(now - fpsT);
            frames = 0;
            fpsT = now;
        }
        // buffer is returned to the driver when `buf` goes out of scope
    }
}

static void applySensorSettings() {
    captureDev.setSensorVFlip(settings.vflip);
    captureDev.setSensorHFlip(settings.hflip);
    if (settings.gain >= 0)     captureDev.setSensorGain(settings.gain);
    if (settings.exposure >= 0) captureDev.setSensorExposure(settings.exposure);
}

bool cameraBegin(CameraFrameCb cb) {
    frameCb = cb;
    if (!jpegMutex) jpegMutex = xSemaphoreCreateMutex();

    ESPVideoCamConfigClass camConfig;
    if (!camConfig.begin((i2c_port_num_t)CAM_SCCB_I2C_PORT, CAM_SCCB_SCL, CAM_SCCB_SDA,
                         400000, CAM_RESET_PIN, CAM_PWDN_PIN)) {
        lastError = "sccb config";
        Serial.println("[CAM] SCCB configuration failed");
        return false;
    }

    ESPVideoCSIConfigClass csiConfig;
    if (!csiConfig.begin(camConfig)) {
        lastError = "csi config";
        Serial.println("[CAM] CSI configuration failed");
        return false;
    }

    if (!video.begin(csiConfig)) {
        lastError = "video init (sensor not detected?)";
        Serial.println("[CAM] esp_video init failed – check the OV5647 ribbon and SCCB pins");
        return false;
    }

    if (!captureDev.begin(ESP_VIDEO_MIPI_CSI_DEVICE_NAME, 2)) {
        lastError = "capture device";
        Serial.println("[CAM] Failed to open the MIPI-CSI capture device");
        return false;
    }

    if (!captureDev.setFormat(ESP_VIDEO_FORMAT_RGB565)) {
        lastError = "format";
        Serial.println("[CAM] RGB565 format not accepted");
        return false;
    }

    applySensorSettings();

    if (!captureDev.startCapture()) {
        lastError = "start capture";
        Serial.println("[CAM] startCapture failed");
        return false;
    }

    frameW = captureDev.getWidth();
    frameH = captureDev.getHeight();
    Serial.printf("[CAM] Capture started %ux%u RGB565\n", (unsigned)frameW, (unsigned)frameH);

    if (frameW && frameH) {
        if (!initJpeg(frameW, frameH)) {
            Serial.println("[CAM] JPEG encoder unavailable – stream/capture disabled");
        }
    }

    ready = true;
    xTaskCreatePinnedToCore(cameraTask, "cam", 16384, nullptr, 3, &camTask, 1);
    return true;
}

bool     cameraReady()  { return ready; }
uint32_t cameraWidth()  { return frameW; }
uint32_t cameraHeight() { return frameH; }
float    cameraFps()    { return fps; }
const char *cameraLastError() { return lastError; }

CameraSettings cameraGetSettings() { return settings; }

bool cameraApplySettings(const CameraSettings &s) {
    settings = s;
    if (settings.jpegQuality < 1)   settings.jpegQuality = 1;
    if (settings.jpegQuality > 100) settings.jpegQuality = 100;
    if (!ready) return false;
    applySensorSettings();
    return true;
}

void cameraJpegDemand(int delta) {
    int v = jpegDemand + delta;
    jpegDemand = v < 0 ? 0 : v;
}

size_t cameraJpegMaxSize() { return jpegCap; }

size_t cameraCopyJpeg(uint8_t *dst, size_t cap, uint32_t *seq, uint32_t waitMs) {
    if (!jpegBuf) return 0;
    uint32_t t0 = millis();
    while (jpegSeq == *seq) {
        if (millis() - t0 >= waitMs) return 0;
        vTaskDelay(pdMS_TO_TICKS(5));
    }
    if (xSemaphoreTake(jpegMutex, pdMS_TO_TICKS(100)) != pdTRUE) return 0;
    size_t n = jpegLen;
    if (n > cap) n = 0;
    if (n) memcpy(dst, jpegBuf, n);
    *seq = jpegSeq;
    xSemaphoreGive(jpegMutex);
    return n;
}
