#include "audio.h"
#include "config.h"
#include "remote.h"

#if AUDIO_ENABLED

#include <Wire.h>
#include <ESP_I2S.h>
#include "blaster_pcm.h"

#if BLASTER_PCM_RATE != AUDIO_SAMPLE_RATE
#error "blaster_pcm.h was generated for another sample rate: rerun tools/wav_to_blaster.py"
#endif

/* Several recorded shots: never the same one twice in a row, so a salvo does not sound like a loop */
static uint8_t nextShot() {
    static uint8_t last = 0;
#if BLASTER_SHOT_COUNT > 1
    last = (uint8_t)((last + 1 + esp_random() % (BLASTER_SHOT_COUNT - 1)) % BLASTER_SHOT_COUNT);
#endif
    return last;
}

/* ES8311 registers (only the ones this configuration touches) */
#define ES8311_REG00_RESET      0x00
#define ES8311_REG01_CLK_MGR    0x01
#define ES8311_REG02_CLK_DIV    0x02
#define ES8311_REG03_ADC_FS     0x03
#define ES8311_REG04_DAC_OSR    0x04
#define ES8311_REG05_CLK_DIV    0x05
#define ES8311_REG06_BCLK       0x06
#define ES8311_REG07_LRCK_H     0x07
#define ES8311_REG08_LRCK_L     0x08
#define ES8311_REG09_SDP_IN     0x09
#define ES8311_REG0A_SDP_OUT    0x0A
#define ES8311_REG0D_SYSTEM     0x0D
#define ES8311_REG0E_SYSTEM     0x0E
#define ES8311_REG12_SYSTEM     0x12
#define ES8311_REG13_SYSTEM     0x13
#define ES8311_REG1C_ADC        0x1C
#define ES8311_REG32_DAC_VOL    0x32
#define ES8311_REG37_DAC_RAMP   0x37

#define STRINGIFY_(x) #x
#define STRINGIFY(x)  STRINGIFY_(x)
#define STRINGIFY_PA  STRINGIFY(AUDIO_PA_PIN)

#define ES8311_RES_16BIT  (3 << 2)   /* SDP word length field for 16-bit samples */

static I2SClass         i2s;
static TaskHandle_t     playTask = nullptr;
static volatile bool    ready = false;
static volatile uint8_t volumePercent = AUDIO_VOLUME;

/* ================= ES8311 over the SCCB bus ================= */
static bool es8311Write(uint8_t reg, uint8_t val) {
    Wire.beginTransmission(AUDIO_CODEC_ADDR);
    Wire.write(reg);
    Wire.write(val);
    return Wire.endTransmission() == 0;
}

static uint8_t es8311Read(uint8_t reg, uint8_t fallback) {
    Wire.beginTransmission(AUDIO_CODEC_ADDR);
    Wire.write(reg);
    if (Wire.endTransmission(false) != 0) return fallback;
    if (Wire.requestFrom((uint8_t)AUDIO_CODEC_ADDR, (uint8_t)1) != 1) return fallback;
    return Wire.read();
}

/*
 * Slave mode, 16-bit I2S, MCLK taken from the MCLK pin at 256 x Fs.
 * The divider values are the coefficient row {4096000 Hz MCLK, 16000 Hz} of the
 * reference driver (esp-bsp components/es8311): pre_div 1, pre_multi 0,
 * adc_div 1, dac_div 1, fs_mode 0, lrck 0x00ff, bclk_div 4, osr 0x10.
 */
static bool es8311Configure() {
    if (!es8311Write(ES8311_REG00_RESET, 0x1F)) return false;   /* reset */
    delay(20);
    es8311Write(ES8311_REG00_RESET, 0x00);
    es8311Write(ES8311_REG00_RESET, 0x80);                      /* power on */

    es8311Write(ES8311_REG01_CLK_MGR, 0x3F);                    /* all clocks on, MCLK from the MCLK pin */
    es8311Write(ES8311_REG02_CLK_DIV, es8311Read(ES8311_REG02_CLK_DIV, 0x00) & 0x07);
    es8311Write(ES8311_REG03_ADC_FS, 0x10);                     /* fs_mode 0 | adc_osr 0x10 */
    es8311Write(ES8311_REG04_DAC_OSR, 0x10);
    es8311Write(ES8311_REG05_CLK_DIV, 0x00);                    /* adc_div = dac_div = 1 */
    es8311Write(ES8311_REG06_BCLK, (es8311Read(ES8311_REG06_BCLK, 0x03) & 0xE0 & ~0x20) | 0x03);
    es8311Write(ES8311_REG07_LRCK_H, es8311Read(ES8311_REG07_LRCK_H, 0x00) & 0xC0);
    es8311Write(ES8311_REG08_LRCK_L, 0xFF);

    es8311Write(ES8311_REG00_RESET, es8311Read(ES8311_REG00_RESET, 0x80) & 0xBF);   /* serial port = slave */
    es8311Write(ES8311_REG09_SDP_IN, ES8311_RES_16BIT);
    es8311Write(ES8311_REG0A_SDP_OUT, ES8311_RES_16BIT);

    es8311Write(ES8311_REG0D_SYSTEM, 0x01);   /* power up the analog section */
    es8311Write(ES8311_REG0E_SYSTEM, 0x02);
    es8311Write(ES8311_REG12_SYSTEM, 0x00);   /* power up the DAC */
    es8311Write(ES8311_REG13_SYSTEM, 0x10);   /* route the DAC to the output driver */
    es8311Write(ES8311_REG1C_ADC, 0x6A);
    es8311Write(ES8311_REG37_DAC_RAMP, 0x08); /* bypass the DAC equalizer */

    /* Codec register left at full scale: the runtime volume is a software gain, because this
     * bus belongs to the camera driver as soon as it starts and cannot be touched again. */
    return es8311Write(ES8311_REG32_DAC_VOL, 0xFF);
}

/* ================= Playback ================= */
/* The amplifier is only powered while a sound plays: the NS4150B hisses on an idle line. */
static void ampEnable(bool on) {
#if AUDIO_PA_PIN >= 0
    digitalWrite(AUDIO_PA_PIN, on ? HIGH : LOW);
#else
    (void)on;
#endif
}

#define AUDIO_CHUNK_SAMPLES 256
#define AUDIO_TONE_HZ     1000
#define AUDIO_TONE_MS      500

static volatile bool playTone = false;   /* diagnostic: a plain sine instead of the blaster */

/* Streams a buffer through I2S in chunks, applying the software volume on the fly.
 * Returns the number of bytes the driver actually accepted. */
static size_t streamSamples(const int16_t *samples, size_t count, int32_t gain) {
    static int16_t chunk[AUDIO_CHUNK_SAMPLES];
    size_t written = 0;
    for (size_t i = 0; i < count; i += AUDIO_CHUNK_SAMPLES) {
        size_t n = min((size_t)AUDIO_CHUNK_SAMPLES, count - i);
        for (size_t k = 0; k < n; k++) chunk[k] = (int16_t)((samples[i + k] * gain) / 100);
        written += i2s.write((const uint8_t *)chunk, n * sizeof(int16_t));
    }
    return written;
}

/* Full-scale 1 kHz sine, generated one chunk at a time: if this is inaudible the fault is
 * in the codec / amplifier / speaker, not in the blaster samples. */
static size_t streamTone(int32_t gain) {
    static int16_t chunk[AUDIO_CHUNK_SAMPLES];
    const size_t total = (size_t)AUDIO_SAMPLE_RATE * AUDIO_TONE_MS / 1000;
    size_t written = 0;
    for (size_t i = 0; i < total; i += AUDIO_CHUNK_SAMPLES) {
        size_t n = min((size_t)AUDIO_CHUNK_SAMPLES, total - i);
        for (size_t k = 0; k < n; k++) {
            float ph = 2.0f * PI * AUDIO_TONE_HZ * (float)(i + k) / (float)AUDIO_SAMPLE_RATE;
            chunk[k] = (int16_t)(sinf(ph) * 30000.0f * gain / 100);
        }
        written += i2s.write((const uint8_t *)chunk, n * sizeof(int16_t));
    }
    return written;
}

static void playTaskFn(void *) {
    for (;;) {
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
        bool tone = playTone;
        playTone = false;

        ampEnable(true);
        delay(AUDIO_PA_SETTLE_MS);                        /* let the amplifier settle, avoids a pop */

        uint8_t shot = nextShot();
        unsigned long t0 = millis();
        size_t written = tone ? streamTone(volumePercent)
                              : streamSamples(BLASTER_PCM + BLASTER_SHOT_START[shot], BLASTER_SHOT_LEN[shot], volumePercent);
        unsigned long elapsed = millis() - t0;

        size_t expected = tone ? (size_t)AUDIO_SAMPLE_RATE * AUDIO_TONE_MS / 1000 * sizeof(int16_t)
                               : BLASTER_SHOT_LEN[shot] * sizeof(int16_t);
        Log.printf("[AUDIO] %s %u: %u/%u bytes to I2S in %lu ms (volume %u%%, PA %s)\n",
                      tone ? "tone" : "blaster", tone ? 0U : (unsigned)shot + 1, (unsigned)written, (unsigned)expected,
                      elapsed, (unsigned)volumePercent,
                      AUDIO_PA_PIN >= 0 ? "GPIO" STRINGIFY_PA : "always on");
        if (written < expected) Log.println("[AUDIO] I2S refused part of the buffer – check i2s.begin()");

        /* write() returns once the data is queued: leave the DMA time to drain before cutting the amp */
        delay(100);   /* ESP_I2S queues 6 x 240 frames = 90 ms of DMA */
        ampEnable(false);
    }
}

/* ================= API ================= */
void audioBegin() {
#if AUDIO_PA_PIN >= 0
    pinMode(AUDIO_PA_PIN, OUTPUT);
#endif
    ampEnable(false);

    /* Same bus as the camera SCCB: configure the codec, then hand the port back. */
    Wire.begin(AUDIO_CODEC_SDA, AUDIO_CODEC_SCL, 100000);
    bool codecOk = es8311Configure();
    Wire.end();
    if (!codecOk) {
        Log.println("[AUDIO] ES8311 does not answer at 0x18 – no sound (camera unaffected)");
        return;
    }

    i2s.setPins(AUDIO_I2S_BCLK, AUDIO_I2S_WS, AUDIO_I2S_DOUT, -1, AUDIO_I2S_MCLK);
    if (!i2s.begin(I2S_MODE_STD, AUDIO_SAMPLE_RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO)) {
        Log.println("[AUDIO] I2S init failed – no sound");
        return;
    }

    xTaskCreate(playTaskFn, "blaster", 3072, nullptr, 2, &playTask);
    ready = (playTask != nullptr);
    Log.printf("[AUDIO] ES8311 ready on I2S0 (%d Hz, %u shots / %u samples in flash, volume %d%%)\n",
                  AUDIO_SAMPLE_RATE, (unsigned)BLASTER_SHOT_COUNT, (unsigned)BLASTER_PCM_SAMPLES, AUDIO_VOLUME);
}

void audioPlayTone() {
    if (!ready) return;
    playTone = true;
    xTaskNotifyGive(playTask);
}

void audioSetVolume(uint8_t percent) {
    volumePercent = percent > 100 ? 100 : percent;
}

uint8_t audioVolume() { return volumePercent; }

void audioLaserFx() {
    if (!ready) return;
    xTaskNotifyGive(playTask);   /* a shot during playback just re-arms it, never blocks the caller */
}

bool audioReady() { return ready; }

#else

void audioBegin() {}
void audioLaserFx() {}
bool audioReady() { return false; }
void audioSetVolume(uint8_t) {}
uint8_t audioVolume() { return 0; }
void audioPlayTone() {}

#endif
