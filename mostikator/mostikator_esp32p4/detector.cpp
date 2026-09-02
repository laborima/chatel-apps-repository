#include "detector.h"
#include "config.h"

#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include <math.h>
#include <string.h>

#define MAX_LABELS 4096
#define MAX_BLOBS  64
#define MAX_TRACKS 16

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
static uint8_t  *mask = nullptr;
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
    Serial.printf("[DET] %s\n", armed ? "Armed" : "Disarmed");
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
    if (!gray || !bg || !mask || !labels) {
        Serial.println("[DET] Buffer allocation failed");
        freeBuffers();
        W = H = 0;
        return false;
    }
    memset(gray, 0, n);
    memset(bg, 0, n * 2);
    memset(mask, 0, n);
    memset(labels, 0, n * 2);
    Serial.printf("[DET] Working grid %ux%u (1/%u of %ux%u)\n",
                  (unsigned)W, (unsigned)H, cfg.downscale, (unsigned)w, (unsigned)h);
    return true;
}

/* ================= STAGE 1: LUMA DOWNSCALE ================= */
/**
 * Averages a few taps inside each downscale block (step = ds/2, so 4 taps
 * for ds=4, 16 taps for ds=8). Luma from RGB565: 0.30 R + 0.59 G + 0.11 B.
 */
static void downscale(const uint8_t *rgb, uint32_t w) {
    const uint16_t *px = (const uint16_t *)rgb;
    const uint8_t ds = cfg.downscale;
    const uint8_t step = ds >= 4 ? ds / 2 : 1;
    for (uint32_t y = 0; y < H; y++) {
        uint8_t *dst = gray + y * W;
        for (uint32_t x = 0; x < W; x++) {
            uint32_t sum = 0;
            uint32_t n = 0;
            for (uint8_t dy = 0; dy < ds; dy += step) {
                const uint16_t *row = px + (size_t)(y * ds + dy) * w + x * ds;
                for (uint8_t dx = 0; dx < ds; dx += step) {
                    uint16_t p = row[dx];
                    uint32_t r = (p >> 11) & 0x1F;
                    uint32_t g = (p >> 5) & 0x3F;
                    uint32_t b = p & 0x1F;
                    sum += (r * 616 + g * 600 + b * 232) >> 8;
                    n++;
                }
            }
            dst[x] = (uint8_t)(sum / n);
        }
    }
}

/* ================= STAGE 2: BACKGROUND + MASK ================= */
static void updateBackgroundAndMask() {
    const int thr = cfg.threshold;
    const uint8_t sh = cfg.learnShift;
    const bool dark = cfg.darkOnly;
    const uint32_t rx0 = (uint32_t)(cfg.roiX0 * W), rx1 = (uint32_t)(cfg.roiX1 * W);
    const uint32_t ry0 = (uint32_t)(cfg.roiY0 * H), ry1 = (uint32_t)(cfg.roiY1 * H);

    for (uint32_t y = 0; y < H; y++) {
        const bool rowIn = (y >= ry0 && y < ry1);
        uint8_t  *g = gray + y * W;
        uint16_t *b = bg + y * W;
        uint8_t  *m = mask + y * W;
        for (uint32_t x = 0; x < W; x++) {
            int yv = g[x];
            int bv = b[x] >> 4;
            int d = bv - yv;   // > 0 when the pixel is darker than the background
            uint8_t hit = 0;
            if (rowIn && x >= rx0 && x < rx1) {
                hit = dark ? (d > thr) : (d > thr || -d > thr);
            }
            m[x] = hit;
            int32_t nb = (int32_t)b[x] + ((((int32_t)yv << 4) - (int32_t)b[x]) >> sh);
            b[x] = (uint16_t)nb;
        }
    }
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
 * Two-pass labelling. Returns the number of blobs kept after the area filter,
 * or -1 when the frame is saturated (too many components: lighting change).
 */
static int labelBlobs() {
    uint16_t next = 1;
    bool overflow = false;
    parent[0] = 0;

    for (uint32_t y = 0; y < H; y++) {
        for (uint32_t x = 0; x < W; x++) {
            size_t i = (size_t)y * W + x;
            if (!mask[i]) { labels[i] = 0; continue; }
            uint16_t left = x ? labels[i - 1] : 0;
            uint16_t up   = y ? labels[i - W] : 0;
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

    // Area / shape filter, compact in place
    int kept = 0;
    const uint32_t maxDim = (uint32_t)(sqrtf((float)cfg.maxArea) * 3.0f) + 2;
    for (int b = 0; b < nBlobs; b++) {
        Blob &bl = blobs[b];
        uint32_t bw = bl.maxX - bl.minX + 1, bh = bl.maxY - bl.minY + 1;
        if (bl.area < cfg.minArea || bl.area > cfg.maxArea) continue;
        if (bw > maxDim || bh > maxDim) continue;
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

    // Greedy global nearest-neighbour assignment
    const float maxD2 = (float)cfg.maxMatchDist * (float)cfg.maxMatchDist;
    for (;;) {
        float bestD2 = maxD2;
        int bestT = -1, bestB = -1;
        for (int t = 0; t < MAX_TRACKS; t++) {
            if (!tracks[t].active || matched[t] >= 0) continue;
            for (int b = 0; b < nBlobs; b++) {
                if (blobs[b].used) continue;
                float dx = blobs[b].cx - px[t], dy = blobs[b].cy - py[t];
                float d2 = dx * dx + dy * dy;
                if (d2 < bestD2) { bestD2 = d2; bestT = t; bestB = b; }
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
            if (tr.misses > cfg.missFrames) {
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
void detectorProcess(const uint8_t *rgb, uint32_t w, uint32_t h, uint32_t ts) {
    uint32_t t0 = millis();

    bool realloc = false;
    if (cfgPending) {
        xSemaphoreTake(mtx, portMAX_DELAY);
        realloc = pendingCfg.downscale != cfg.downscale;
        cfg = pendingCfg;
        cfgPending = false;
        xSemaphoreGive(mtx);
        if (realloc) Serial.println("[DET] Downscale changed – rebuilding buffers");
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

    downscale(rgb, w);

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

    updateBackgroundAndMask();

    if (state != DET_ARMED) {
        if (armedRequested) state = DET_ARMED;
        frameCount = frameCount + 1;
        procMs = millis() - t0;
        return;
    }

    int nBlobs = labelBlobs();
    if (nBlobs < 0) {
        // Global change (lights, camera move): relearn quickly, drop tracks
        size_t n = (size_t)W * H;
        for (size_t i = 0; i < n; i++) bg[i] = (uint16_t)gray[i] << 4;
        clearTracks();
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
uint32_t detectorActiveTracks() {
    uint32_t n = 0;
    for (int t = 0; t < MAX_TRACKS; t++) if (tracks[t].active) n++;
    return n;
}
