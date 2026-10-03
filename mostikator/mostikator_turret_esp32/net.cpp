#include "net.h"
#include "config.h"
#include "turret.h"
#include "water_gun.h"
#include <WiFi.h>
#include <ArduinoOTA.h>
#include <ESPmDNS.h>
#include <esp_task_wdt.h>
#include "esp_core_dump.h"

LogTee Log;

static const char *const ssids[2]  = { WIFI_SSID, WIFI_SSID2 };
static const char *const passes[2] = { WIFI_PASS, WIFI_PASS2 };

static WiFiServer    telnet(TELNET_PORT);
static WiFiClient    client;
static bool          clientAuthed = false;
static char          authLine[40];
static size_t        authLen = 0;
static uint8_t       iacState = 0;          /* telnet negotiation parser, see netConsoleRead() */
static unsigned long lockUntil = 0;         /* after a wrong password */

static int           ssidIdx = -1;
static unsigned long lastAttempt = 0;
static bool          wasUp = false;
static bool          servicesUp = false;

static bool wifiEnabled() { return ssids[0][0] != 0; }

/* ================= LOG ================= */
static void dropClient() {
    client.stop();
    clientAuthed = false;
}

/* Telnet wants CRLF. A client that stops reading is dropped rather than stalling the main loop. */
static void clientWrite(const uint8_t *buf, size_t n) {
    uint8_t out[128];
    size_t  o = 0;
    for (size_t i = 0; i < n; i++) {
        if (buf[i] == '\n') out[o++] = '\r';
        out[o++] = buf[i];
        if (o >= sizeof(out) - 1 || i == n - 1) {
            if (client.write(out, o) != o) {
                Serial.println("[NET] Telnet client not reading – dropped");
                dropClient();
                return;
            }
            o = 0;
        }
    }
}

size_t LogTee::write(uint8_t c) { return write(&c, 1); }

/* Small history replayed when the telnet console unlocks: the boot log is often what one needs.
 * Only loop() logs on this board (the PS5 task never does), so no locking. */
#define LOG_HISTORY_BYTES 4096
static char     hist[LOG_HISTORY_BYTES];
static uint32_t histTotal = 0;

static void replayHistory() {
    uint32_t n = histTotal < LOG_HISTORY_BYTES ? histTotal : LOG_HISTORY_BYTES;
    uint32_t start = histTotal - n;
    client.print("\r\n----- log history -----\r\n");
    for (uint32_t done = 0; done < n && clientAuthed;) {
        uint32_t pos = (start + done) % LOG_HISTORY_BYTES;
        uint32_t len = min(n - done, (uint32_t)LOG_HISTORY_BYTES - pos);
        clientWrite((const uint8_t *)hist + pos, len);
        done += len;
    }
}

size_t LogTee::write(const uint8_t *buf, size_t n) {
    Serial.write(buf, n);
    for (size_t i = 0; i < n; i++) hist[(histTotal + i) % LOG_HISTORY_BYTES] = (char)buf[i];
    histTotal += n;
    if (clientAuthed && client.connected()) clientWrite(buf, n);
    return n;
}

/* ================= WIFI ================= */
static void connectNext() {
    do { ssidIdx = (ssidIdx + 1) % 2; } while (!ssids[ssidIdx][0]);
    lastAttempt = millis();
    Serial.printf("[NET] Connecting to %s\n", ssids[ssidIdx]);
    WiFi.disconnect();
    WiFi.begin(ssids[ssidIdx], passes[ssidIdx]);
}

static void startServices() {
    ArduinoOTA.setHostname(DEVICE_NAME);
    ArduinoOTA.setPort(OTA_PORT);
    ArduinoOTA.setPassword(OTA_PASSWORD);
    ArduinoOTA.onStart([]() {
        /* Nothing may keep squirting or moving while the flash is rewritten */
        gunAllOff();
        turretSetVelocity(AXIS_PAN, 0);
        turretSetVelocity(AXIS_TILT, 0);
        Log.println("[OTA] Update started – water gun safed");
    });
    ArduinoOTA.onProgress([](unsigned int done, unsigned int total) {
        static unsigned int lastPct = 101;
        esp_task_wdt_reset();   /* the whole upload runs inside ArduinoOTA.handle() */
        unsigned int pct = total ? done * 100U / total : 0;
        if (pct / 10 != lastPct / 10) { lastPct = pct; Serial.printf("[OTA] %u %%\n", pct); }
    });
    ArduinoOTA.onEnd([]() { Log.println("[OTA] Done – rebooting"); });
    ArduinoOTA.onError([](ota_error_t e) { Log.printf("[OTA] Error %u\n", (unsigned)e); });
    ArduinoOTA.begin();   /* also starts mDNS with DEVICE_NAME */

    telnet.begin();
    telnet.setNoDelay(true);
    MDNS.addService("telnet", "tcp", TELNET_PORT);
}

static void handleTelnet() {
    if (telnet.hasClient()) {
        WiFiClient incoming = telnet.accept();
        if (millis() < lockUntil) {
            incoming.stop();
        } else {
            /* The newest connection wins: a half-dead session must never lock the console out */
            if (client.connected()) { client.println("\r\n[NET] Another console connected – bye"); }
            dropClient();
            client = incoming;
            client.setNoDelay(true);
            authLen = 0;
            iacState = 0;
            client.print("Mostikator turret – password: ");
            Serial.printf("[NET] Telnet connection from %s\n", client.remoteIP().toString().c_str());
        }
    }
    if (clientAuthed && !client.connected()) {
        dropClient();
        Serial.println("[NET] Telnet console closed");
    }
}

static bool checkPassword() {
    const char *p = OTA_PASSWORD;
    size_t n = strlen(p);
    uint8_t diff = (uint8_t)(authLen != n);
    for (size_t i = 0; i < authLen && i < n; i++) diff |= (uint8_t)(authLine[i] ^ p[i]);
    return diff == 0;
}

/* ================= CRASH REPORT (core dump partition) ================= */
/* The core writes a dump to the "coredump" partition on every panic (sdkconfig: ELF to flash).
 * Printed at boot and by the "crash" command, so a remote crash can be decoded without USB:
 *   <toolchain>-addr2line -pfiaC -e <build>/<sketch>.ino.elf <PC> <backtrace...> */
void netPrintCrash(Print &out, bool erase) {
    if (erase) {
        out.println(esp_core_dump_image_erase() == ESP_OK ? "[SYS] Crash dump erased" : "[SYS] Nothing to erase");
        return;
    }
    if (esp_core_dump_image_check() != ESP_OK) { out.println("[SYS] No crash dump in flash"); return; }
    esp_core_dump_summary_t *s = (esp_core_dump_summary_t *)malloc(sizeof(esp_core_dump_summary_t));
    if (!s) return;
    if (esp_core_dump_get_summary(s) == ESP_OK) {
        char reason[96] = "";
        esp_core_dump_get_panic_reason(reason, sizeof(reason));
        out.printf("[SYS] Last crash: task '%s', PC 0x%08lx, reason '%s'\n", s->exc_task, (unsigned long)s->exc_pc, reason);
#if CONFIG_IDF_TARGET_ARCH_XTENSA
        out.print("[SYS]   backtrace:");
        for (uint32_t i = 0; i < s->exc_bt_info.depth; i++) out.printf(" 0x%08lx", (unsigned long)s->exc_bt_info.bt[i]);
        out.printf("%s\n", s->exc_bt_info.corrupted ? " (corrupted)" : "");
        out.printf("[SYS]   cause %lu, vaddr 0x%08lx\n", (unsigned long)s->ex_info.exc_cause, (unsigned long)s->ex_info.exc_vaddr);
#else
        out.printf("[SYS]   mcause 0x%08lx, mtval 0x%08lx, ra 0x%08lx\n", (unsigned long)s->ex_info.mcause,
                   (unsigned long)s->ex_info.mtval, (unsigned long)s->ex_info.ra);
#endif
        out.printf("[SYS]   firmware sha %.16s\n", (const char *)s->app_elf_sha256);
    } else {
        out.println("[SYS] Crash dump present but unreadable");
    }
    free(s);
}

/* ================= API ================= */
void netBegin() {
    if (!wifiEnabled()) { Serial.println("[NET] WiFi disabled (WIFI_SSID empty) – no OTA, no telnet"); return; }
    WiFi.persistent(false);
    WiFi.setHostname(DEVICE_NAME);
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(false);   /* netLoop() alternates between the two SSIDs itself */
    connectNext();
}

void netLoop() {
    if (!wifiEnabled()) return;
    unsigned long now = millis();
    wl_status_t st = WiFi.status();

    if (st == WL_CONNECTED) {
        if (!wasUp) {
            wasUp = true;
            if (!servicesUp) { startServices(); servicesUp = true; }
            Log.printf("[NET] WiFi %s, IP %s, RSSI %d dBm – telnet %s.local:%d, OTA port %d\n",
                       WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI(),
                       DEVICE_NAME, TELNET_PORT, OTA_PORT);
        }
        ArduinoOTA.handle();
        handleTelnet();
        return;
    }

    if (wasUp) {
        wasUp = false;
        dropClient();
        Serial.println("[NET] WiFi lost");
        ssidIdx = (ssidIdx + 1) % 2;   /* so that connectNext() retries the network that just worked first */
        lastAttempt = now - WIFI_RETRY_MS;
    }
    bool failed = st == WL_NO_SSID_AVAIL || st == WL_CONNECT_FAILED;
    if ((failed && now - lastAttempt >= 2000) || now - lastAttempt >= WIFI_RETRY_MS) connectNext();
}

bool netConnected() { return wasUp; }

int netConsoleRead() {
    while (client.available()) {
        int c = client.read();
        if (c < 0) return -1;
        /* Strip telnet negotiation: IAC (255) cmd [option], IAC SB ... IAC SE */
        switch (iacState) {
            case 1: iacState = (c >= 251 && c <= 254) ? 2 : (c == 250 ? 3 : 0); continue;
            case 2: iacState = 0; continue;
            case 3: if (c == 255) iacState = 4; continue;
            case 4: iacState = (c == 240) ? 0 : 3; continue;
        }
        if (c == 255) { iacState = 1; continue; }
        if (c == 0) continue;
        if (clientAuthed) return c;

        if (c == '\r') continue;
        if (c != '\n') {
            if (authLen < sizeof(authLine) - 1) authLine[authLen++] = (char)c;
            continue;
        }
        if (checkPassword()) {
            clientAuthed = true;
            replayHistory();
            Log.printf("[NET] Telnet console unlocked (%s) – type 'help'\n", client.remoteIP().toString().c_str());
        } else {
            Serial.printf("[NET] Wrong telnet password from %s\n", client.remoteIP().toString().c_str());
            client.println("\r\nWrong password");
            dropClient();
            lockUntil = millis() + 3000;
        }
        authLen = 0;
        return -1;
    }
    return -1;
}

void netPrintStatus(Print &out) {
    if (!wifiEnabled()) { out.println("[NET] WiFi disabled"); return; }
    if (wasUp) {
        out.printf("[NET] WiFi %s, IP %s, RSSI %d dBm, %s.local | telnet %s | OTA port %d\n",
                   WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI(), DEVICE_NAME,
                   clientAuthed ? "in use" : "free", OTA_PORT);
    } else {
        out.printf("[NET] WiFi not connected (trying %s, status %d)\n", ssids[ssidIdx < 0 ? 0 : ssidIdx], (int)WiFi.status());
    }
    out.printf("[SYS] Uptime %lu s, free heap %u B (min %u B), reset reason %d\n",
               millis() / 1000UL, (unsigned)ESP.getFreeHeap(), (unsigned)ESP.getMinFreeHeap(), (int)esp_reset_reason());
}
