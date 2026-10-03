#include "remote.h"
#include "config.h"
#include "wifi_manager.h"
#include "detector.h"
#include "json_builders.h"
#include "app_events.h"
#include "audio.h"
#include "turret_link.h"
#include "http_api.h"

#include <WiFi.h>
#include <ArduinoOTA.h>
#include <ESPmDNS.h>
#include <LittleFS.h>
#include <esp_task_wdt.h>
#include "esp_heap_caps.h"
#include "esp_core_dump.h"
#include "esp_partition.h"
#include "mbedtls/base64.h"

LogTee Log;

/* ================= LOG HISTORY (PSRAM ring buffer) ================= */
#define LOG_HISTORY_BYTES (64 * 1024)

static char         *hist = nullptr;
static uint32_t      histTotal = 0;          /* bytes ever written; position = histTotal % size */
static portMUX_TYPE  histMux = portMUX_INITIALIZER_UNLOCKED;

static void histAppend(const uint8_t *b, size_t n) {
    if (!hist || !n) return;
    if (n > LOG_HISTORY_BYTES) { b += n - LOG_HISTORY_BYTES; n = LOG_HISTORY_BYTES; }
    portENTER_CRITICAL(&histMux);
    size_t pos = histTotal % LOG_HISTORY_BYTES;
    size_t first = min(n, (size_t)LOG_HISTORY_BYTES - pos);
    memcpy(hist + pos, b, first);
    memcpy(hist, b + first, n - first);
    histTotal += n;
    portEXIT_CRITICAL(&histMux);
}

/* Copies history bytes [from, from + n) that are still in the buffer. Returns the start actually used. */
static uint32_t histRead(uint32_t from, char *out, size_t &n) {
    if (!hist) { n = 0; return from; }
    portENTER_CRITICAL(&histMux);
    uint32_t oldest = histTotal > LOG_HISTORY_BYTES ? histTotal - LOG_HISTORY_BYTES : 0;
    if (from < oldest) from = oldest;
    if (n > histTotal - from) n = histTotal - from;
    size_t pos = from % LOG_HISTORY_BYTES;
    size_t first = min(n, (size_t)LOG_HISTORY_BYTES - pos);
    memcpy(out, hist + pos, first);
    memcpy(out + first, hist, n - first);
    portEXIT_CRITICAL(&histMux);
    return from;
}

size_t LogTee::write(uint8_t c) { return write(&c, 1); }

size_t LogTee::write(const uint8_t *buf, size_t n) {
    Serial.write(buf, n);
    histAppend(buf, n);
    return n;
}

size_t remoteLogCopy(char *out, size_t cap) {
    if (!hist || cap < 2) { if (cap) out[0] = 0; return 0; }
    size_t n = cap - 1;
    uint32_t total;
    portENTER_CRITICAL(&histMux);
    total = histTotal;
    portEXIT_CRITICAL(&histMux);
    uint32_t from = total > n ? total - n : 0;
    histRead(from, out, n);
    out[n] = 0;
    return n;
}

/* ================= TELNET ================= */
static WiFiServer    telnet(TELNET_PORT);
static WiFiClient    client;
static bool          clientAuthed = false;
static uint32_t      clientSent = 0;         /* history position already sent to the client */
static char          authLine[40];
static size_t        authLen = 0;
static uint8_t       iacState = 0;
static unsigned long lockUntil = 0;
static bool          servicesUp = false;
static bool          otaRunning = false;

static void dropClient() {
    client.stop();
    clientAuthed = false;
}

/* Pushes the new log bytes to the telnet client, at most ~1 KB per loop, CR LF line endings */
static void pumpClient() {
    if (!clientAuthed) return;
    char   raw[512];
    char   out[sizeof(raw) * 2];
    size_t n = sizeof(raw);
    uint32_t from = histRead(clientSent, raw, n);
    if (from != clientSent) client.print("\r\n[... log overflow, lines dropped ...]\r\n");
    if (!n) { clientSent = from; return; }
    size_t o = 0;
    for (size_t i = 0; i < n; i++) {
        if (raw[i] == '\n') out[o++] = '\r';
        out[o++] = raw[i];
    }
    if (client.write((const uint8_t *)out, o) != o) {
        Serial.println("[NET] Telnet client not reading – dropped");
        dropClient();
        return;
    }
    clientSent = from + n;
}

static bool checkPassword() {
    const char *p = OTA_PASSWORD;
    size_t n = strlen(p);
    uint8_t diff = (uint8_t)(authLen != n);
    for (size_t i = 0; i < authLen && i < n; i++) diff |= (uint8_t)(authLine[i] ^ p[i]);
    return diff == 0;
}

static void handleTelnet() {
    if (telnet.hasClient()) {
        WiFiClient incoming = telnet.accept();
        if (millis() < lockUntil) {
            incoming.stop();
        } else {
            /* The newest connection wins: a half-dead session must never lock the console out */
            if (client.connected()) client.print("\r\n[NET] Another console connected – bye\r\n");
            dropClient();
            client = incoming;
            client.setNoDelay(true);
            authLen = 0;
            iacState = 0;
            client.print("Mostikator P4 – password: ");
            Log.printf("[NET] Telnet connection from %s\n", client.remoteIP().toString().c_str());
        }
    }
    if (client && !client.connected()) {
        if (clientAuthed) Log.println("[NET] Telnet console closed");
        dropClient();
    }
    pumpClient();
}

/* Next character typed on the telnet console, -1 if none. Handles the password prompt. */
static int telnetRead() {
    while (client && client.available()) {
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
            /* Replay the whole history first: the boot log is often what one wants to see */
            uint32_t total;
            portENTER_CRITICAL(&histMux);
            total = histTotal;
            portEXIT_CRITICAL(&histMux);
            clientSent = total > LOG_HISTORY_BYTES ? total - LOG_HISTORY_BYTES : 0;
            client.print("\r\n----- log history -----\r\n");
            Log.printf("[NET] Telnet console unlocked (%s) – type 'help'\n", client.remoteIP().toString().c_str());
        } else {
            Log.printf("[NET] Wrong telnet password from %s\n", client.remoteIP().toString().c_str());
            client.print("\r\nWrong password\r\n");
            dropClient();
            lockUntil = millis() + 3000;
        }
        authLen = 0;
        return -1;
    }
    return -1;
}

/* ================= CRASH REPORT (core dump partition) ================= */
/* The core writes a dump to the "coredump" partition on every panic (sdkconfig: ELF to flash).
 * Printed at boot and by the "crash" command, so a remote crash can be decoded without USB:
 *   <toolchain>-addr2line -pfiaC -e <build>/<sketch>.ino.elf <PC> <backtrace...> */
void remotePrintCrash(Print &out, bool erase) {
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

/* "crash raw": the whole dump in base64, for when the on-board summary cannot decode it.
 * Goes straight to the telnet client (not through the log history, it is tens of KB).
 * Decode on the PC: base64 -d > dump.elf; esp-coredump info_corefile -t elf -c dump.elf <build>.ino.elf */
static void dumpRawCrash() {
    size_t addr = 0, size = 0;
    if (esp_core_dump_image_get(&addr, &size) != ESP_OK || !size) { Log.println("[SYS] No crash dump in flash"); return; }
    const esp_partition_t *part = esp_partition_find_first(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_COREDUMP, nullptr);
    if (!part) return;
    Print &out = clientAuthed ? (Print &)client : (Print &)Serial;
    out.printf("----- COREDUMP BEGIN %u bytes -----\r\n", (unsigned)size);
    uint8_t in[57];
    unsigned char b64[80];
    for (size_t off = 0; off < size; off += sizeof(in)) {
        size_t n = min(sizeof(in), size - off);
        if (esp_partition_read(part, addr - part->address + off, in, n) != ESP_OK) break;
        size_t olen = 0;
        mbedtls_base64_encode(b64, sizeof(b64), &olen, in, n);
        out.write(b64, olen);
        out.print("\r\n");
        if ((off & 0xFFF) == 0) esp_task_wdt_reset();
    }
    out.print("----- COREDUMP END -----\r\n");
}

/* ================= CONSOLE (serial + telnet) ================= */
struct LineBuf {
    char   buf[96];
    size_t len;
};
static LineBuf serialLine = {}, netLine = {};
static char    cjson[4096];

static void printNet() {
    if (wifiIsConnected()) {
        Log.printf("[NET] WiFi %s, IP %s, RSSI %d dBm, %s.local | telnet %d | OTA %d | NTP %s\n",
                   WiFi.SSID().c_str(), wifiIp().c_str(), wifiRssi(), DEVICE_NAME, TELNET_PORT, OTA_PORT,
                   wifiNtpSynced() ? "ok" : "--");
    } else {
        Log.println("[NET] WiFi not connected");
    }
    Log.printf("[SYS] Uptime %lu s, reset reason %d, heap %u B (min %u B), PSRAM free %u B, streams %d, turret link %s\n",
               millis() / 1000UL, (int)esp_reset_reason(), (unsigned)ESP.getFreeHeap(), (unsigned)ESP.getMinFreeHeap(),
               (unsigned)heap_caps_get_free_size(MALLOC_CAP_SPIRAM), httpStreamClients(),
               turretLinkConnected() ? (turretLinkArmed() ? "up (armed)" : "up (safe)") : "silent");
}

static void execute(char *cmd) {
    while (*cmd == ' ' || *cmd == '\t') cmd++;
    if (!*cmd) return;
    char *arg = strchr(cmd, ' ');
    if (arg) { *arg++ = 0; while (*arg == ' ') arg++; }

    if (!strcmp(cmd, "help") || !strcmp(cmd, "?")) {
        Log.println("Commands:\n"
                    "  status          detector / camera / audio status (JSON)\n"
                    "  stats | config  hunt statistics / detector + camera settings (JSON)\n"
                    "  net             WiFi, uptime, heap, PSRAM, reset reason, turret link\n"
                    "  arm | disarm    detector\n"
                    "  pew             blaster on the speaker\n"
                    "  ping            PING the turret over the UART link\n"
                    "  turret <line>   send a raw line to the turret (AIM <pan> <tilt>, FIRE <ms>...)\n"
                    "  crash [clear|raw] last panic (core dump in flash), raw = base64 ELF for esp-coredump\n"
                    "  reboot          restart the board");
        return;
    }
    if (!strcmp(cmd, "status")) { jsonStatus(cjson, sizeof(cjson)); Log.println(cjson); return; }
    if (!strcmp(cmd, "stats"))  { jsonStats(cjson, sizeof(cjson));  Log.println(cjson); return; }
    if (!strcmp(cmd, "config")) { jsonConfig(cjson, sizeof(cjson)); Log.println(cjson); return; }
    if (!strcmp(cmd, "net"))    { printNet(); return; }
    if (!strcmp(cmd, "crash") && arg && !strcmp(arg, "raw")) { dumpRawCrash(); return; }
    if (!strcmp(cmd, "crash"))  { remotePrintCrash(Log, arg && !strcmp(arg, "clear")); return; }
    if (!strcmp(cmd, "arm") || !strcmp(cmd, "disarm")) {
        detectorArm(!strcmp(cmd, "arm"));
        appConfigChanged();
        Log.printf("[DET] %s\n", detectorArmed() ? "Armed" : "Disarmed");
        return;
    }
    if (!strcmp(cmd, "pew"))    { audioLaserFx(); return; }
    if (!strcmp(cmd, "ping"))   { turretLinkSend("PING"); return; }
    if (!strcmp(cmd, "turret") && arg && *arg) { turretLinkSend(arg); Log.printf("[LNK] -> %s\n", arg); return; }
    if (!strcmp(cmd, "reboot")) { Log.println("[SYS] Rebooting"); delay(200); ESP.restart(); }
    Log.printf("Unknown command '%s' – type help\n", cmd);
}

static void feed(LineBuf &l, int ch) {
    if (ch == '\r') return;
    if (ch != '\n' && (ch < 0x20 || ch > 0x7e)) return;   /* line noise, e.g. when the USB port opens */
    if (ch == '\n') {
        l.buf[l.len] = 0;
        l.len = 0;
        execute(l.buf);
    } else if (l.len < sizeof(l.buf) - 1) {
        l.buf[l.len++] = (char)ch;
    }
}

/* ================= OTA ================= */
static void startServices() {
    ArduinoOTA.setHostname(DEVICE_NAME);
    ArduinoOTA.setPort(OTA_PORT);
    ArduinoOTA.setPassword(OTA_PASSWORD);
    ArduinoOTA.onStart([]() {
        otaRunning = true;
        bool fs = ArduinoOTA.getCommand() == U_SPIFFS;
        if (fs) LittleFS.end();   /* the partition is rewritten under the mount otherwise */
        Log.printf("[OTA] %s update started\n", fs ? "Webapp (LittleFS)" : "Firmware");
    });
    ArduinoOTA.onProgress([](unsigned int done, unsigned int total) {
        static unsigned int lastPct = 101;
        esp_task_wdt_reset();   /* the whole upload runs inside ArduinoOTA.handle() */
        unsigned int pct = total ? (unsigned int)((uint64_t)done * 100U / total) : 0;
        if (pct / 10 != lastPct / 10) { lastPct = pct; Log.printf("[OTA] %u %%\n", pct); }
    });
    ArduinoOTA.onEnd([]() { Log.println("[OTA] Done – rebooting"); });
    ArduinoOTA.onError([](ota_error_t e) {
        otaRunning = false;
        Log.printf("[OTA] Error %u\n", (unsigned)e);
        if (ArduinoOTA.getCommand() == U_SPIFFS) LittleFS.begin(false);
    });
    ArduinoOTA.begin();   /* also starts mDNS with DEVICE_NAME */

    MDNS.addService("http", "tcp", HTTP_PORT);
    MDNS.addService("telnet", "tcp", TELNET_PORT);
    telnet.begin();
    telnet.setNoDelay(true);
    Log.printf("[NET] OTA on %s.local:%d, telnet console on port %d\n", DEVICE_NAME, OTA_PORT, TELNET_PORT);
}

/* ================= API ================= */
void remoteBegin() {
    hist = (char *)heap_caps_malloc(LOG_HISTORY_BYTES, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!hist) Serial.println("[NET] No PSRAM for the log history – telnet shows live lines only");
}

void remoteLoop() {
    while (Serial.available()) feed(serialLine, Serial.read());

    if (!wifiIsConnected()) {
        if (clientAuthed || client) dropClient();
        return;
    }
    if (!servicesUp) { startServices(); servicesUp = true; }
    ArduinoOTA.handle();
    handleTelnet();
    int ch;
    while ((ch = telnetRead()) >= 0) feed(netLine, ch);
}

bool remoteOtaRunning() { return otaRunning; }
