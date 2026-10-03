#include "detector.h"
#include "config.h"
#include "remote.h"

#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "esp_timer.h"
#include <math.h>
#include <string.h>

#define MAX_LABELS 4096
#define MAX_BLOBS  64
#define MAX_TRACKS 16
#define NEW_TRACK_GATE 2.5f   /* match gate x2.5 for a track seen once (no velocity estimate yet) */

struct Blob {
    uint32_t area;
    uint16_t minX, minY, maxX, maxY;
    uint32_t sumX, sumY;
    float    cx, cy;
    bool     used;
};

struct Track {
    bool     active;
    bool     confirmed;
    uint16_t id;
    float    cx, cy;   // working px
    float    vx, vy;   // working px / s
    float    w, h;     // working px
    uint8_t  hits, misses;
    uint32_t firstMs, lastMs;
};

static DetectorConfig    cfg;
static DetectorConfig    pendingCfg;
static volatile bool     cfgPending = false;
static DetectorEventCb   evtCb = nullptr;
static SemaphoreHandle_t mtx = nullptr;

static volatile DetectorState state = DET_DISARMED;
static volatile bool armedRequested = false;

static uint32_t  srcW = 0, srcH = 0;
static uint32_t  W = 0, H = 0;
static uint8_t  *gray = nullptr;
static uint16_t *bg = nullptr;      // luma << 4 (fixed point)
static uint16_t *noise = nullptr;   // running mean |luma - background| << 4: how much this pixel flickers
static uint32_t  maskHits = 0;      // changed pixels in the ROI on the last frame
static uint32_t  roiPixels = 1;
static uint32_t  globalSkips = 0;
static uint8_t  *mask = nullptr;
static uint8_t   rowHit[1024];      // rows of the grid holding at least one changed pixel (labelling skips the rest)
static uint16_t *labels = nullptr;
static uint16_t  parent[MAX_LABELS];
static uint8_t   rootToBlob[MAX_LABELS];
static Blob      blobs[MAX_BLOBS];
static Track     tracks[MAX_TRACKS];
static uint16_t  nextId = 1;

static uint32_t warm = 0;
static uint32_t lastTs = 0;
static volatile uint32_t frameCount = 0;
static volatile uint32_t blobCount = 0;
static volatile uint32_t procMs = 0;
static volatile float    fps = 0;
static uint32_t fpsFrames = 0, fpsT = 0;

static uint32_t usDown = 0, usLabel = 0, usHalfDown = 0, usHalfMask = 0, usWait = 0;   /* last frame, per stage (profiling log) */

static Target snapshot[MAX_TRACKS];
static size_t snapshotN = 0;

/* ================= CONFIG ================= */
DetectorConfig detectorDefaultConfig() {
    DetectorConfig c;
    c.downscale     = DET_DOWNSCALE;
    c.threshold     = DET_THRESHOLD;
    c.minArea       = DET_MIN_AREA;
    c.maxArea       = DET_MAX_AREA;
    c.confirmFrames = DET_CONFIRM_FRAMES;
    c.missFrames    = DET_MISS_FRAMES;
    c.maxMatchDist  = DET_MAX_MATCH_DIST;
    c.learnShift    = DET_LEARN_SHIFT;
    c.darkOnly      = DET_DARK_ONLY != 0;
    c.warmupFrames  = DET_WARMUP_FRAMES;
    c.roiX0 = DET_ROI_X0; c.roiY0 = DET_ROI_Y0;
    c.roiX1 = DET_ROI_X1; c.roiY1 = DET_ROI_Y1;
    c.hfov  = CAM_HFOV_DEG;
    c.vfov  = CAM_VFOV_DEG;
    c.leadMs = DET_LEAD_MS;
    c.noiseK = DET_NOISE_K;
    c.globalChangePct = DET_GLOBAL_CHANGE_PCT;
    c.isolation = DET_ISOLATION != 0;
    return c;
}

static void sanitize(DetectorConfig &c) {
    if (c.downscale < 2) c.downscale = 2;
    if (c.downscale > 8) c.downscale = 8;
    if (c.confirmFrames < 1) c.confirmFrames = 1;
    if (c.missFrames < 1) c.missFrames = 1;
    if (c.learnShift < 1) c.learnShift = 1;
    if (c.learnShift > 10) c.learnShift = 10;
    if (c.maxArea < c.minArea) c.maxArea = c.minArea;
    if (c.maxMatchDist < 1) c.maxMatchDist = 1;
    if (c.warmupFrames < 1) c.warmupFrames = 1;
    if (c.noiseK > 20) c.noiseK = 20;
    if (c.globalChangePct < 1) c.globalChangePct = 1;
    if (c.globalChangePct > 100) c.globalChangePct = 100;
    auto clamp01 = [](float v) { return v < 0 ? 0.f : (v > 1 ? 1.f : v); };
    c.roiX0 = clamp01(c.roiX0); c.roiY0 = clamp01(c.roiY0);
    c.roiX1 = clamp01(c.roiX1); c.roiY1 = clamp01(c.roiY1);
    if (c.roiX1 <= c.roiX0) { c.roiX0 = 0; c.roiX1 = 1; }
    if (c.roiY1 <= c.roiY0) { c.roiY0 = 0; c.roiY1 = 1; }
    if (c.hfov <= 1) c.hfov = CAM_HFOV_DEG;
    if (c.vfov <= 1) c.vfov = CAM_VFOV_DEG;
}

static void clearTracks() {
    for (int i = 0; i < MAX_TRACKS; i++) tracks[i].active = false;
}

void detectorBegin(const DetectorConfig &c, DetectorEventCb cb) {
    if (!mtx) mtx = xSemaphoreCreateMutex();
    cfg = c;
    sanitize(cfg);
    evtCb = cb;
    clearTracks();
}

DetectorConfig detectorGetConfig() {
    DetectorConfig c;
    xSemaphoreTake(mtx, portMAX_DELAY);
    c = cfgPending ? pendingCfg : cfg;
    xSemaphoreGive(mtx);
    return c;
}

void detectorSetConfig(const DetectorConfig &c) {
    xSemaphoreTake(mtx, portMAX_DELAY);
    pendingCfg = c;
    sanitize(pendingCfg);
    cfgPending = true;
    xSemaphoreGive(mtx);
}

void detectorArm(bool armed) {
    armedRequested = armed;
    if (!armed) {
        state = DET_DISARMED;
        xSemaphoreTake(mtx, portMAX_DELAY);
        clearTracks();
        snapshotN = 0;
        xSemaphoreGive(mtx);
    } else {
        state = (warm >= cfg.warmupFrames) ? DET_ARMED : DET_LEARNING;
    }
    Log.printf("[DET] %s\n", armed ? "Armed" : "Disarmed");
}

bool          detectorArmed() { return armedRequested; }
DetectorState detectorState() { return state; }
const char   *detectorStateName() {
    switch (state) {
        case DET_ARMED:    return "armed";
        case DET_LEARNING: return "learning";
        default:           return "disarmed";
    }
}

/* ================= BUFFERS ================= */
static void freeBuffers() {
    if (gray)   { heap_caps_free(gray);   gray = nullptr; }
    if (bg)     { heap_caps_free(bg);     bg = nullptr; }
    if (noise)  { heap_caps_free(noise);  noise = nullptr; }
    if (mask)   { heap_caps_free(mask);   mask = nullptr; }
    if (labels) { heap_caps_free(labels); labels = nullptr; }
}

static bool allocBuffers(uint32_t w, uint32_t h) {
    freeBuffers();
    W = w / cfg.downscale;
    H = h / cfg.downscale;
    size_t n = (size_t)W * H;
    gray   = (uint8_t *)heap_caps_malloc(n, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    bg     = (uint16_t *)heap_caps_malloc(n * 2, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    mask   = (uint8_t *)heap_caps_malloc(n, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    labels = (uint16_t *)heap_caps_malloc(n * 2, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    noise  = (uint16_t *)heap_caps_malloc(n * 2, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!gray || !bg || !mask || !labels || !noise) {
        Log.println("[DET] Buffer allocation failed");
        freeBuffers();
        W = H = 0;
        return false;
    }
    memset(gray, 0, n);
    memset(bg, 0, n * 2);
    memset(mask, 0, n);
    memset(labels, 0, n * 2);
    memset(noise, 0, n * 2);
    Log.printf("[DET] Working grid %ux%u (1/%u of %ux%u)\n",
                  (unsigned)W, (unsigned)H, cfg.downscale, (unsigned)w, (unsigned)h);
    return true;
}

/* ================= STAGE 1: LUMA DOWNSCALE ================= */
/**
 * Every pixel of each ds x ds block is read, row by row (sequential PSRAM reads: the strided per-block
 * reads of the first version cost 22 ms a frame and skipped pixels, so a 1-2 px mosquito could fall
 * between the taps). With darkOnly the block keeps its DARKEST pixel instead of the mean: a mosquito of
 * one or two camera pixels keeps its full contrast on the reduced grid instead of being diluted 1/9.
 * Mean pooling uses the luma (0.30 R + 0.59 G + 0.11 B, 64 KB table), darkest-pixel pooling the green channel
 * alone (see below). Rows [y0, y1) only: the two halves
 * of the grid run on the two cores.
 */
static uint8_t *lumaLut = nullptr;   /* RGB565 -> luma, 64 KB in internal RAM: no multiply per pixel */

static bool lutReady() {
    if (lumaLut) return true;
    lumaLut = (uint8_t *)heap_caps_malloc(65536, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    if (!lumaLut) lumaLut = (uint8_t *)heap_caps_malloc(65536, MALLOC_CAP_8BIT);
    if (!lumaLut) return false;
    for (uint32_t p = 0; p < 65536; p++) {
        uint32_t r = (p >> 11) & 0x1F, g = (p >> 5) & 0x3F, b = p & 0x1F;
        lumaLut[p] = (uint8_t)((r * 616 + g * 600 + b * 232) >> 8);
    }
    return true;
}

static bool frameGray = false;   /* current frame is GRAY8 */

static void downscaleRowsGray(const uint8_t *src, uint32_t w, uint32_t y0, uint32_t y1, uint16_t *acc) {
    const uint32_t ds = cfg.downscale;
    const bool minPool = cfg.darkOnly;
    const uint32_t inv = 65536 / (ds * ds);
    for (uint32_t y = y0; y < y1; y++) {
        for (uint32_t x = 0; x < W; x++) acc[x] = minPool ? 255 : 0;
        for (uint32_t dy = 0; dy < ds; dy++) {
            const uint8_t *row = src + (size_t)(y * ds + dy) * w;
            if (minPool && ds == 3) {
                for (uint32_t x = 0; x < W; x++, row += 3) {
                    uint32_t a = row[0], b = row[1], c = row[2];
                    uint32_t m = a < b ? a : b;
                    m = m < c ? m : c;
                    if (m < acc[x]) acc[x] = (uint16_t)m;
                }
            } else {
                for (uint32_t x = 0; x < W; x++, row += ds) {
                    uint32_t a = acc[x];
                    if (minPool) { for (uint32_t k = 0; k < ds; k++) if (row[k] < a) a = row[k]; }
                    else         { for (uint32_t k = 0; k < ds; k++) a += row[k]; }
                    acc[x] = (uint16_t)a;
                }
            }
        }
        uint8_t *dst = gray + y * W;
        if (minPool) for (uint32_t x = 0; x < W; x++) dst[x] = (uint8_t)acc[x];
        else         for (uint32_t x = 0; x < W; x++) dst[x] = (uint8_t)((acc[x] * inv) >> 16);
    }
}

static void downscaleRows(const uint8_t *rgb, uint32_t w, uint32_t y0, uint32_t y1, uint16_t *acc) {
    if (frameGray) { downscaleRowsGray(rgb, w, y0, y1, acc); return; }
    const uint16_t *px = (const uint16_t *)rgb;
    const uint32_t ds = cfg.downscale;
    const bool minPool = cfg.darkOnly;
    const uint8_t *lut = lumaLut;
    const uint32_t inv = 65536 / (ds * ds);
    if (minPool) {
        /* Darkest pixel on the green channel (6 bits, 59 % of luma): a mosquito is dark in every channel, and
         * plain bit operations beat the 64 KB table that does not fit the L1 cache. Rows are read in turn,
         * left to right, so the PSRAM is streamed rather than hopped through. */
        for (uint32_t y = y0; y < y1; y++) {
            for (uint32_t x = 0; x < W; x++) acc[x] = 0xFFFF;
            for (uint32_t dy = 0; dy < ds; dy++) {
                const uint16_t *row = px + (size_t)(y * ds + dy) * w;
                if (ds == 3) {
                    for (uint32_t x = 0; x < W; x++, row += 3) {
                        uint32_t a = row[0] & 0x07E0, b = row[1] & 0x07E0, c = row[2] & 0x07E0;
                        uint32_t m = a < b ? a : b;
                        m = m < c ? m : c;
                        if (m < acc[x]) acc[x] = (uint16_t)m;
                    }
                } else {
                    for (uint32_t x = 0; x < W; x++, row += ds) {
                        uint32_t m = acc[x];
                        for (uint32_t k = 0; k < ds; k++) { uint32_t g = row[k] & 0x07E0; if (g < m) m = g; }
                        acc[x] = (uint16_t)m;
                    }
                }
            }
            uint8_t *dst = gray + y * W;
            for (uint32_t x = 0; x < W; x++) dst[x] = (uint8_t)((acc[x] >> 3) | (acc[x] >> 9));   /* G6 -> 0..255 */
        }
        return;
    }
    for (uint32_t y = y0; y < y1; y++) {
        for (uint32_t x = 0; x < W; x++) acc[x] = minPool ? 255 : 0;
        for (uint32_t dy = 0; dy < ds; dy++) {
            const uint16_t *row = px + (size_t)(y * ds + dy) * w;
            uint32_t sx = 0;
            for (uint32_t x = 0; x < W; x++) {
                uint32_t a = acc[x];
                if (minPool) {
                    for (uint32_t k = 0; k < ds; k++) { uint32_t l = lut[row[sx + k]]; if (l < a) a = l; }
                } else {
                    for (uint32_t k = 0; k < ds; k++) a += lut[row[sx + k]];
                }
                acc[x] = (uint16_t)a;
                sx += ds;
            }
        }
        uint8_t *dst = gray + y * W;
        if (minPool) for (uint32_t x = 0; x < W; x++) dst[x] = (uint8_t)acc[x];
        else         for (uint32_t x = 0; x < W; x++) dst[x] = (uint8_t)((acc[x] * inv) >> 16);
    }
}

/* ================= STAGE 2: BACKGROUND + MASK ================= */
/*
 * Each pixel also learns how much it normally moves (noise = running mean of |luma - background|).
 * A pixel only counts as changed when it departs from the background by threshold + K x its own
 * noise: sharp edges that wobble with vibration or auto-exposure, flickering lamps and dark
 * noisy areas raise their own bar, while a flat wall keeps the full sensitivity for a mosquito.
 */
#define NOISE_LEARN_SHIFT 5   /* 1/32 per frame: settles within the warm-up */
#define NOISE_CAP        48   /* a passing object must not inflate a pixel's noise for long */
#define LIT_LEARN_SHIFT  10   /* 1/1024 per frame for pixels brighter than the background (darkOnly) */

static uint32_t maskRows(uint32_t y0, uint32_t y1) {
    const int thr = cfg.threshold;
    const int k = cfg.noiseK;
    uint32_t hits = 0;
    const uint8_t sh = cfg.learnShift;
    const bool dark = cfg.darkOnly;
    const uint32_t rx0 = (uint32_t)(cfg.roiX0 * W), rx1 = (uint32_t)(cfg.roiX1 * W);
    const uint32_t ry0 = (uint32_t)(cfg.roiY0 * H), ry1 = (uint32_t)(cfg.roiY1 * H);

    for (uint32_t y = y0; y < y1; y++) {
        const bool rowIn = (y >= ry0 && y < ry1);
        uint8_t  *g = gray + y * W;
        uint16_t *b = bg + y * W;
        uint16_t *nz = noise + y * W;
        uint8_t  *m = mask + y * W;
        uint32_t rowHits = hits;
        for (uint32_t x = 0; x < W; x++) {
            int yv = g[x];
            int bv = b[x] >> 4;
            int d = bv - yv;   // > 0 when the pixel is darker than the background
            int eff = thr + ((k * (int)nz[x]) >> 4);
            uint8_t hit = 0;
            if (rowIn && x >= rx0 && x < rx1) {
                hit = dark ? (d > eff) : (d > eff || -d > eff);
                hits += hit;
            }
            m[x] = hit;
            /* With darkOnly, a pixel lit up (the aiming laser dot, a reflection) is only learned very slowly:
             * learned at the normal rate, the spot it leaves behind reads "darker than the background" and
             * the turret chases its own laser. A lasting change of light is still absorbed in about a minute. */
            const bool lit = dark && -d > eff;
            if (!lit) {
                int ad = d < 0 ? -d : d;
                if (ad > NOISE_CAP) ad = NOISE_CAP;
                nz[x] = (uint16_t)((int32_t)nz[x] + ((((int32_t)ad << 4) - (int32_t)nz[x]) >> NOISE_LEARN_SHIFT));
            }
            int32_t nb = (int32_t)b[x] + ((((int32_t)yv << 4) - (int32_t)b[x]) >> (lit ? LIT_LEARN_SHIFT : sh));
            b[x] = (uint16_t)nb;
        }
        rowHit[y] = hits != rowHits;
    }
    return hits;
}

/* ================= TWO-CORE SPLIT ================= */
/* The camera task (core 1) does the bottom half of stages 1-2, a helper on core 0 the top half. */
static TaskHandle_t      helperTask = nullptr;
static TaskHandle_t      callerTask = nullptr;
static const uint8_t    *jobRgb = nullptr;
static uint32_t          jobW = 0, jobSplit = 0;
static volatile uint32_t jobHits = 0;
static uint16_t         *accTop = nullptr, *accBottom = nullptr;   /* one row accumulator per core */

static void helperFn(void *) {
    for (;;) {
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
        downscaleRows(jobRgb, jobW, 0, jobSplit, accTop);
        jobHits = maskRows(0, jobSplit);
        xTaskNotifyGive(callerTask);
    }
}

/* Stages 1 + 2 over the whole grid; returns false when the buffers are missing */
static bool downscaleAndMask(const uint8_t *rgb, uint32_t w, bool mask) {
    if (!lutReady()) return false;
    if (!accTop) {
        accTop = (uint16_t *)heap_caps_malloc(1024 * sizeof(uint16_t), MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
        accBottom = (uint16_t *)heap_caps_malloc(1024 * sizeof(uint16_t), MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
        if (!accTop || !accBottom) return false;
    }
    if (W > 1024) return false;
    const uint32_t rx0 = (uint32_t)(cfg.roiX0 * W), rx1 = (uint32_t)(cfg.roiX1 * W);
    const uint32_t ry0 = (uint32_t)(cfg.roiY0 * H), ry1 = (uint32_t)(cfg.roiY1 * H);
    roiPixels = (rx1 > rx0 && ry1 > ry0) ? (rx1 - rx0) * (ry1 - ry0) : 1;

    if (!helperTask) {
        callerTask = xTaskGetCurrentTaskHandle();
        xTaskCreatePinnedToCore(helperFn, "det2", 4096, nullptr, 2, &helperTask, 0);
    }
    if (!mask || !helperTask) {   /* warm-up: downscale only, one core is plenty */
        downscaleRows(rgb, w, 0, H, accBottom);
        if (mask) maskHits = maskRows(0, H);
        return true;
    }
    jobRgb = rgb; jobW = w; jobSplit = H / 2;
    xTaskNotifyGive(helperTask);
    int64_t a = esp_timer_get_time();
    downscaleRows(rgb, w, jobSplit, H, accBottom);
    int64_t b = esp_timer_get_time();
    uint32_t hits = maskRows(jobSplit, H);
    int64_t c = esp_timer_get_time();
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    usHalfDown = (uint32_t)(b - a); usHalfMask = (uint32_t)(c - b); usWait = (uint32_t)(esp_timer_get_time() - c);
    maskHits = hits + jobHits;
    return true;
}

/* ================= STAGE 3: CONNECTED COMPONENTS (4-connectivity) ================= */
static inline uint16_t findRoot(uint16_t a) {
    while (parent[a] != a) {
        parent[a] = parent[parent[a]];
        a = parent[a];
    }
    return a;
}

static inline void unite(uint16_t a, uint16_t b) {
    a = findRoot(a);
    b = findRoot(b);
    if (a == b) return;
    if (a < b) parent[b] = a; else parent[a] = b;
}

/**
 * A mosquito is alone in the sky: nothing else changes around it. The edge of a head, an arm or a
 * leaf moving breaks into many small fragments of the same size, each with other changed pixels
 * right next to it. Reject a blob when the ring around its box (2x its size, at least 4 px) holds
 * more changed pixels than the blob itself.
 */
static bool isolated(const Blob &bl, uint32_t bw, uint32_t bh) {
    uint32_t margin = (bw > bh ? bw : bh) * 2;
    if (margin < 4) margin = 4;
    uint32_t x0 = bl.minX > margin ? bl.minX - margin : 0;
    uint32_t y0 = bl.minY > margin ? bl.minY - margin : 0;
    uint32_t x1 = bl.maxX + margin < W ? bl.maxX + margin : W - 1;
    uint32_t y1 = bl.maxY + margin < H ? bl.maxY + margin : H - 1;
    uint32_t around = 0;
    for (uint32_t y = y0; y <= y1; y++) {
        const uint8_t *m = mask + (size_t)y * W;
        for (uint32_t x = x0; x <= x1; x++) around += m[x];
    }
    around -= bl.area < around ? bl.area : around;
    return around <= bl.area;
}

/**
 * Two-pass labelling. Returns the number of blobs kept after the area filter,
 * or -1 when the frame is saturated (too many components: lighting change).
 */
static int labelBlobs() {
    uint16_t next = 1;
    bool overflow = false;
    parent[0] = 0;

    /* Rows without any changed pixel (nearly all of them) are skipped: labels of a skipped row are never
     * read, the "up" neighbour of the next row is taken as empty instead */
    for (uint32_t y = 0; y < H; y++) {
        if (!rowHit[y]) continue;
        const bool upLive = y && rowHit[y - 1];
        for (uint32_t x = 0; x < W; x++) {
            size_t i = (size_t)y * W + x;
            if (!mask[i]) { labels[i] = 0; continue; }
            uint16_t left = x ? labels[i - 1] : 0;
            uint16_t up   = upLive ? labels[i - W] : 0;
            if (left && up) {
                labels[i] = left < up ? left : up;
                if (left != up) unite(left, up);
            } else if (left) {
                labels[i] = left;
            } else if (up) {
                labels[i] = up;
            } else {
                if (next >= MAX_LABELS) { labels[i] = 0; overflow = true; continue; }
                parent[next] = next;
                labels[i] = next++;
            }
        }
    }
    if (overflow) return -1;

    memset(rootToBlob, 0, next);
    int nBlobs = 0;
    bool tooMany = false;
    for (uint32_t y = 0; y < H; y++) {
        if (!rowHit[y]) continue;
        for (uint32_t x = 0; x < W; x++) {
            size_t i = (size_t)y * W + x;
            uint16_t l = labels[i];
            if (!l) continue;
            uint16_t r = findRoot(l);
            uint8_t slot = rootToBlob[r];
            if (slot == 0xFF) continue;
            if (slot == 0) {
                if (nBlobs >= MAX_BLOBS) { rootToBlob[r] = 0xFF; tooMany = true; continue; }
                slot = (uint8_t)(++nBlobs);
                rootToBlob[r] = slot;
                Blob &nb = blobs[slot - 1];
                nb.area = 0; nb.sumX = 0; nb.sumY = 0;
                nb.minX = nb.maxX = x; nb.minY = nb.maxY = y;
                nb.used = false;
            }
            Blob &bl = blobs[slot - 1];
            bl.area++;
            bl.sumX += x; bl.sumY += y;
            if (x < bl.minX) bl.minX = x;
            if (x > bl.maxX) bl.maxX = x;
            if (y < bl.minY) bl.minY = y;
            if (y > bl.maxY) bl.maxY = y;
        }
    }
    if (tooMany) return -1;

    // Area / shape / isolation filter, compact in place
    int kept = 0;
    const uint32_t maxDim = (uint32_t)(sqrtf((float)cfg.maxArea) * 3.0f) + 2;
    for (int b = 0; b < nBlobs; b++) {
        Blob &bl = blobs[b];
        uint32_t bw = bl.maxX - bl.minX + 1, bh = bl.maxY - bl.minY + 1;
        if (bl.area < cfg.minArea || bl.area > cfg.maxArea) continue;
        if (bw > maxDim || bh > maxDim) continue;
        if (cfg.isolation && !isolated(bl, bw, bh)) continue;
        bl.cx = (float)bl.sumX / bl.area;
        bl.cy = (float)bl.sumY / bl.area;
        bl.used = false;
        if (kept != b) blobs[kept] = bl;
        kept++;
    }
    return kept;
}

/* ================= STAGE 4: TRACKING ================= */
static void fillTarget(const Track &t, Target &o, uint32_t ts) {
    const float sx = (float)cfg.downscale / (float)srcW;
    const float sy = (float)cfg.downscale / (float)srcH;
    o.id = t.id;
    o.x = t.cx * sx;
    o.y = t.cy * sy;
    o.vx = t.vx * sx;
    o.vy = t.vy * sy;
    const float lead = cfg.leadMs / 1000.0f;
    o.predX = o.x + o.vx * lead;
    o.predY = o.y + o.vy * lead;
    o.pan  = (o.predX - 0.5f) * cfg.hfov;
    o.tilt = (0.5f - o.predY) * cfg.vfov;
    o.w = t.w * sx;
    o.h = t.h * sy;
    float c = (float)t.hits / (float)(cfg.confirmFrames * 3);
    if (c > 1) c = 1;
    c *= 1.0f - (float)t.misses / (float)(cfg.missFrames + 1);
    o.confidence = c < 0 ? 0 : c;
    o.ageMs = ts - t.firstMs;
    o.tsMs = t.lastMs;
    o.hits = t.hits;
    o.misses = t.misses;
}

static void emit(DetectorEventType type, const Track &t, uint32_t ts) {
    if (!evtCb) return;
    DetectorEvent e;
    e.type = type;
    e.tsMs = ts;
    fillTarget(t, e.target, ts);
    evtCb(e);
}

static void updateTracks(int nBlobs, uint32_t ts) {
    float dt = lastTs ? (float)(ts - lastTs) / 1000.0f : 0.05f;
    if (dt <= 0.0005f) dt = 0.0005f;
    if (dt > 0.5f) dt = 0.5f;

    float px[MAX_TRACKS], py[MAX_TRACKS];
    int   matched[MAX_TRACKS];
    for (int t = 0; t < MAX_TRACKS; t++) {
        matched[t] = -1;
        if (!tracks[t].active) continue;
        px[t] = tracks[t].cx + tracks[t].vx * dt;
        py[t] = tracks[t].cy + tracks[t].vy * dt;
    }
    for (int b = 0; b < nBlobs; b++) blobs[b].used = false;

    /* Greedy global nearest-neighbour assignment, on distances normalised by each track's gate: a track
     * seen once has no velocity yet, so a fast insect can be far from where it was - its gate is wider */
    const float gate = (float)cfg.maxMatchDist;
    for (;;) {
        float bestN = 1.0f;
        int bestT = -1, bestB = -1;
        for (int t = 0; t < MAX_TRACKS; t++) {
            if (!tracks[t].active || matched[t] >= 0) continue;
            const float g = tracks[t].hits <= 1 ? gate * NEW_TRACK_GATE : gate;
            const float inv = 1.0f / (g * g);
            for (int b = 0; b < nBlobs; b++) {
                if (blobs[b].used) continue;
                float dx = blobs[b].cx - px[t], dy = blobs[b].cy - py[t];
                float n = (dx * dx + dy * dy) * inv;
                if (n < bestN) { bestN = n; bestT = t; bestB = b; }
            }
        }
        if (bestT < 0) break;
        matched[bestT] = bestB;
        blobs[bestB].used = true;
    }

    for (int t = 0; t < MAX_TRACKS; t++) {
        Track &tr = tracks[t];
        if (!tr.active) continue;
        if (matched[t] >= 0) {
            const Blob &b = blobs[matched[t]];
            float nvx = (b.cx - tr.cx) / dt, nvy = (b.cy - tr.cy) / dt;
            if (tr.hits > 1) {
                tr.vx = 0.6f * tr.vx + 0.4f * nvx;
                tr.vy = 0.6f * tr.vy + 0.4f * nvy;
            } else {
                tr.vx = nvx; tr.vy = nvy;
            }
            tr.cx = b.cx; tr.cy = b.cy;
            tr.w = (float)(b.maxX - b.minX + 1);
            tr.h = (float)(b.maxY - b.minY + 1);
            if (tr.hits < 255) tr.hits++;
            tr.misses = 0;
            tr.lastMs = ts;
            if (!tr.confirmed && tr.hits >= cfg.confirmFrames) {
                tr.confirmed = true;
                emit(DET_EVT_ACQUIRED, tr, ts);
            } else if (tr.confirmed) {
                emit(DET_EVT_UPDATED, tr, ts);
            }
        } else {
            tr.misses++;
            tr.cx = px[t]; tr.cy = py[t];   // coast on the last velocity
            const bool outside = tr.cx < 0 || tr.cy < 0 || tr.cx >= (float)W || tr.cy >= (float)H;
            if (tr.misses > cfg.missFrames || outside) {   /* coasted out of the picture: gone */
                if (tr.confirmed) emit(DET_EVT_LOST, tr, ts);
                tr.active = false;
            }
        }
    }

    // New tracks for unmatched blobs
    for (int b = 0; b < nBlobs; b++) {
        if (blobs[b].used) continue;
        for (int t = 0; t < MAX_TRACKS; t++) {
            if (tracks[t].active) continue;
            Track &tr = tracks[t];
            tr.active = true;
            tr.confirmed = false;
            tr.id = nextId++;
            if (nextId == 0) nextId = 1;
            tr.cx = blobs[b].cx; tr.cy = blobs[b].cy;
            tr.vx = 0; tr.vy = 0;
            tr.w = (float)(blobs[b].maxX - blobs[b].minX + 1);
            tr.h = (float)(blobs[b].maxY - blobs[b].minY + 1);
            tr.hits = 1; tr.misses = 0;
            tr.firstMs = tr.lastMs = ts;
            break;
        }
    }

    lastTs = ts;

    // Publish snapshot
    if (xSemaphoreTake(mtx, pdMS_TO_TICKS(5)) == pdTRUE) {
        snapshotN = 0;
        for (int t = 0; t < MAX_TRACKS; t++) {
            if (!tracks[t].active || !tracks[t].confirmed) continue;
            fillTarget(tracks[t], snapshot[snapshotN++], ts);
        }
        xSemaphoreGive(mtx);
    }
}

/* ================= MAIN ENTRY ================= */
void detectorProcess(const uint8_t *rgb, uint32_t w, uint32_t h, uint32_t ts, bool grayIn) {
    uint32_t t0 = millis();

    bool realloc = false;
    if (cfgPending) {
        xSemaphoreTake(mtx, portMAX_DELAY);
        realloc = pendingCfg.downscale != cfg.downscale;
        /* darkOnly switches the grid between darkest-pixel and mean pooling: the background must be relearned */
        if (pendingCfg.darkOnly != cfg.darkOnly) warm = 0;
        cfg = pendingCfg;
        cfgPending = false;
        xSemaphoreGive(mtx);
        if (realloc) Log.println("[DET] Downscale changed – rebuilding buffers");
    }

    if (w != srcW || h != srcH || realloc || !gray) {
        if (!allocBuffers(w, h)) return;
        srcW = w; srcH = h;
        warm = 0;
        clearTracks();
    }

    // Disarmed: keep the background model fresh at a reduced rate only
    if (!armedRequested && (frameCount & 3) != 0) {
        frameCount = frameCount + 1;
        return;
    }

    if (grayIn != frameGray) { frameGray = grayIn; warm = 0; }   /* luma scale changes with the format */
    int64_t t1 = esp_timer_get_time();
    const bool warming = warm < cfg.warmupFrames;
    if (!downscaleAndMask(rgb, w, !warming)) return;
    usDown = (uint32_t)(esp_timer_get_time() - t1);

    if (warm < cfg.warmupFrames) {
        size_t n = (size_t)W * H;
        if (warm == 0) {
            for (size_t i = 0; i < n; i++) bg[i] = (uint16_t)gray[i] << 4;
        } else {
            for (size_t i = 0; i < n; i++) {
                int32_t nb = (int32_t)bg[i] + ((((int32_t)gray[i] << 4) - (int32_t)bg[i]) >> 2);
                bg[i] = (uint16_t)nb;
            }
        }
        warm++;
        if (armedRequested) state = (warm >= cfg.warmupFrames) ? DET_ARMED : DET_LEARNING;
        frameCount = frameCount + 1;
        procMs = millis() - t0;
        return;
    }


    if (state != DET_ARMED) {
        if (armedRequested) state = DET_ARMED;
        frameCount = frameCount + 1;
        procMs = millis() - t0;
        return;
    }

    /* A large part of the picture changing at once is the camera shaking (turret moving, wind), an
     * exposure step or a light switched on - never a mosquito. Skip the frame: no new tracks, no
     * confirmations, the background catches up within a second. */
    if (maskHits * 100 > roiPixels * cfg.globalChangePct) {
        globalSkips++;
        static uint32_t lastSkipLog = 0;
        if (ts - lastSkipLog > 5000) {
            lastSkipLog = ts;
            Log.printf("[DET] Global change (%lu%% of the ROI) – frame ignored (%lu so far)\n",
                       (unsigned long)(maskHits * 100 / roiPixels), (unsigned long)globalSkips);
        }
        frameCount = frameCount + 1;
        procMs = millis() - t0;
        return;
    }

    t1 = esp_timer_get_time();
    int nBlobs = labelBlobs();
    usLabel = (uint32_t)(esp_timer_get_time() - t1);
    static uint32_t lastProfile = 0;
    if (ts - lastProfile > 10000) {
        lastProfile = ts;
        Log.printf("[DET] Profile %ux%u: downscale+mask %lu us (half: downscale %lu, mask %lu, wait core 0 %lu), blobs %lu us\n",
                   (unsigned)W, (unsigned)H, (unsigned long)usDown, (unsigned long)usHalfDown, (unsigned long)usHalfMask,
                   (unsigned long)usWait, (unsigned long)usLabel);
    }
    if (nBlobs < 0) {
        // Global change (lights, camera move): relearn quickly, drop tracks
        size_t n = (size_t)W * H;
        for (size_t i = 0; i < n; i++) bg[i] = (uint16_t)gray[i] << 4;
        /* Announce the drop and empty the snapshot, or REST / WS / the turret keep ghost targets
         * for as long as the frame stays saturated */
        for (int i = 0; i < MAX_TRACKS; i++) if (tracks[i].active && tracks[i].confirmed) emit(DET_EVT_LOST, tracks[i], ts);
        clearTracks();
        if (xSemaphoreTake(mtx, pdMS_TO_TICKS(5)) == pdTRUE) { snapshotN = 0; xSemaphoreGive(mtx); }
        blobCount = 0;
    } else {
        blobCount = nBlobs;
        updateTracks(nBlobs, ts);
    }

    frameCount = frameCount + 1;
    fpsFrames++;
    if (ts - fpsT >= 1000) {
        fps = fpsFrames * 1000.0f / (float)(ts - fpsT);
        fpsFrames = 0;
        fpsT = ts;
    }
    procMs = millis() - t0;
}

/* ================= QUERIES ================= */
size_t detectorGetTargets(Target *out, size_t max) {
    size_t n = 0;
    if (xSemaphoreTake(mtx, pdMS_TO_TICKS(20)) != pdTRUE) return 0;
    for (; n < snapshotN && n < max; n++) out[n] = snapshot[n];
    xSemaphoreGive(mtx);
    return n;
}

bool detectorPrimaryTarget(Target &out) {
    bool found = false;
    if (xSemaphoreTake(mtx, pdMS_TO_TICKS(20)) != pdTRUE) return false;
    float best = -1;
    for (size_t i = 0; i < snapshotN; i++) {
        if (snapshot[i].confidence > best) { best = snapshot[i].confidence; out = snapshot[i]; found = true; }
    }
    xSemaphoreGive(mtx);
    return found;
}

float    detectorFps()          { return fps; }
uint32_t detectorWorkWidth()    { return W; }
uint32_t detectorWorkHeight()   { return H; }
uint32_t detectorBlobCount()    { return blobCount; }
uint32_t detectorFrameCount()   { return frameCount; }
uint32_t detectorProcessMs()    { return procMs; }
uint32_t detectorGlobalSkips()  { return globalSkips; }
uint32_t detectorActiveTracks() {
    uint32_t n = 0;
    for (int t = 0; t < MAX_TRACKS; t++) if (tracks[t].active) n++;
    return n;
}

/* ================= DEBUG VIEW ================= */
static void put16(uint8_t *p, uint16_t v) { p[0] = v; p[1] = v >> 8; }
static void put32(uint8_t *p, uint32_t v) { p[0] = v; p[1] = v >> 8; p[2] = v >> 16; p[3] = v >> 24; }

size_t detectorDebugBmp(uint8_t *out, size_t cap) {
    const uint32_t w = W, h = H;
    if (!gray || !bg || !mask || !w || !h) return 0;
    const uint32_t stride = (w + 3) & ~3u;
    const uint32_t header = 14 + 40 + 256 * 4;
    const size_t total = header + (size_t)stride * h;
    if (total > cap) return 0;

    memset(out, 0, header);
    out[0] = 'B'; out[1] = 'M';
    put32(out + 2, total);
    put32(out + 10, header);
    put32(out + 14, 40);
    put32(out + 18, w);
    put32(out + 22, h);            /* positive height: rows stored bottom-up */
    put16(out + 26, 1);
    put16(out + 28, 8);
    put32(out + 34, stride * h);
    put32(out + 46, 256);
    uint8_t *pal = out + 54;       /* B, G, R, 0 */
    for (int i = 0; i < 250; i++) { uint8_t g = (uint8_t)(i * 255 / 249 * 6 / 10); pal[i * 4] = pal[i * 4 + 1] = pal[i * 4 + 2] = g; }
    const uint8_t extra[][3] = { { 40, 40, 255 }, { 255, 230, 0 }, { 0, 220, 255 } };   /* 250 red, 251 cyan, 252 yellow */
    for (int i = 0; i < 3; i++) { pal[(250 + i) * 4] = extra[i][0]; pal[(250 + i) * 4 + 1] = extra[i][1]; pal[(250 + i) * 4 + 2] = extra[i][2]; }

    const uint32_t rx0 = (uint32_t)(cfg.roiX0 * w), rx1 = (uint32_t)(cfg.roiX1 * w);
    const uint32_t ry0 = (uint32_t)(cfg.roiY0 * h), ry1 = (uint32_t)(cfg.roiY1 * h);
    const int thr = cfg.threshold;
    for (uint32_t y = 0; y < h; y++) {
        uint8_t *row = out + header + (size_t)(h - 1 - y) * stride;
        for (uint32_t x = 0; x < w; x++) {
            size_t i = (size_t)y * w + x;
            int d = (int)(bg[i] >> 4) - (int)gray[i];
            uint8_t v = (uint8_t)(gray[i] * 249 / 255);
            if (mask[i])                        v = 250;
            else if (cfg.darkOnly && -d > thr) v = 251;   /* brighter than the background, ignored by darkOnly */
            if ((y == ry0 || y + 1 == ry1) && x >= rx0 && x < rx1) v = 252;
            if ((x == rx0 || x + 1 == rx1) && y >= ry0 && y < ry1) v = 252;
            row[x] = v;
        }
    }
    return total;
}
