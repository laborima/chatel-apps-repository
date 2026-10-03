#include "link.h"
#include "config.h"
#include "net.h"
#include "turret.h"
#include "water_gun.h"
#include "ps5_input.h"

#if LINK_ENABLED

static HardwareSerial linkSerial(LINK_UART_NUM);

static char          rxLine[64];
static size_t        rxLen = 0;
static unsigned long lastRefusalLog = 0;
static unsigned long lastHeartbeat = 0;

/* The camera may insist several times per second: log the refusal at most once a second. */
static void logRefusal(const char *what) {
    unsigned long now = millis();
    if (now - lastRefusalLog < 1000) return;
    lastRefusalLog = now;
    Log.printf("[LNK] %s ignored – PS5 controller connected, manual mode wins\n", what);
}

static void execute(char *cmd) {
    char *argv[4] = { nullptr };
    int argc = 0;
    for (char *tok = strtok(cmd, " \t"); tok && argc < 4; tok = strtok(nullptr, " \t")) argv[argc++] = tok;
    if (argc == 0) return;

    if (!strcmp(argv[0], "AIM") && argc >= 3) {
        if (!linkAutoAllowed()) { logRefusal("AIM"); return; }
        turretCalMode(false);
        turretSetAngles(atof(argv[1]), atof(argv[2]));
        return;
    }
    if (!strcmp(argv[0], "FIRE")) {
        if (!linkAutoAllowed()) { logRefusal("FIRE"); return; }
        gunFire(argc >= 2 ? (uint16_t)atoi(argv[1]) : FIRE_TAP_MS);
        return;
    }
    if (!strcmp(argv[0], "PING")) {
        linkSerial.printf("PONG %s %lu\n", gunArmed() ? "armed" : "safe", (unsigned long)gunShots());
        return;
    }
}

void linkBegin() {
    linkSerial.begin(LINK_BAUD, SERIAL_8N1, LINK_RX_PIN, LINK_TX_PIN);
    Log.printf("[LNK] Detection node link on UART%d (TX GPIO%d, RX GPIO%d)\n",
                  LINK_UART_NUM, LINK_TX_PIN, LINK_RX_PIN);
}

void linkLoop() {
    unsigned long now = millis();
    if (now - lastHeartbeat >= LINK_HEARTBEAT_MS) {
        lastHeartbeat = now;
        /* Any line refreshes the P4's link timeout; "HB" is ignored there otherwise */
        linkSerial.printf("HB %s %lu\n", gunArmed() ? "armed" : "safe", (unsigned long)gunShots());
    }
    while (linkSerial.available()) {
        char ch = (char)linkSerial.read();
        if (ch == '\r') continue;
        if (ch == '\n') {
            rxLine[rxLen] = 0;
            rxLen = 0;
            execute(rxLine);
        } else if (rxLen < sizeof(rxLine) - 1) {
            rxLine[rxLen++] = ch;
        }
    }
}

void linkSendFire(uint16_t burstMs) {
    linkSerial.printf("FIRE %u\n", (unsigned)burstMs);
}

void linkSendArmed(bool armed) {
    linkSerial.printf("ARM %d\n", armed ? 1 : 0);
}

bool linkAutoAllowed() { return !ps5InputConnected(); }

#else

void linkBegin() {}
void linkLoop()  {}
void linkSendFire(uint16_t) {}
void linkSendArmed(bool) {}
bool linkAutoAllowed() { return true; }

#endif
