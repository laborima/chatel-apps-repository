#include "turret_link.h"
#include "config.h"
#include "remote.h"
#include "audio.h"

#if TURRET_LINK_ENABLED

static HardwareSerial linkSerial(TURRET_LINK_UART_NUM);

static char   rxLine[64];
static size_t rxLen = 0;
static bool          armed = false;
static unsigned long lastRxMs = 0;

static void execute(char *cmd) {
    char *argv[4] = { nullptr };
    int argc = 0;
    for (char *tok = strtok(cmd, " \t"); tok && argc < 4; tok = strtok(nullptr, " \t")) argv[argc++] = tok;
    if (argc == 0) return;

    /* "FIRE <ms>": the turret just opened the valve, manually or not. */
    if (!strcmp(argv[0], "FIRE")) {
        audioLaserFx();
        Log.printf("[LNK] Turret fired (%s ms) – pew pew\n", argc >= 2 ? argv[1] : "?");
        return;
    }
    if (!strcmp(argv[0], "ARM") && argc >= 2) {
        armed = (atoi(argv[1]) != 0);
        Log.printf("[LNK] Turret %s\n", armed ? "armed" : "safe");
        return;
    }
    /* "HB <armed|safe> <shots>" every 5 s: keeps the link alive and the armed state in sync after a reboot */
    if (!strcmp(argv[0], "HB")) {
        if (argc >= 2) armed = !strcmp(argv[1], "armed");
        return;
    }
    if (!strcmp(argv[0], "PONG")) {
        Log.printf("[LNK] Turret alive: %s\n", argv[1] ? argv[1] : "");
        return;
    }
}

void turretLinkBegin() {
    linkSerial.begin(TURRET_LINK_BAUD, SERIAL_8N1, TURRET_LINK_RX_PIN, TURRET_LINK_TX_PIN);
    Log.printf("[LNK] Turret link on UART%d (TX GPIO%d, RX GPIO%d)\n",
                  TURRET_LINK_UART_NUM, TURRET_LINK_TX_PIN, TURRET_LINK_RX_PIN);
}

void turretLinkLoop() {
    while (linkSerial.available()) {
        char ch = (char)linkSerial.read();
        if (ch == '\r') continue;
        if (ch == '\n') {
            rxLine[rxLen] = 0;
            rxLen = 0;
            lastRxMs = millis();
            execute(rxLine);
        } else if (rxLen < sizeof(rxLine) - 1) {
            rxLine[rxLen++] = ch;
        }
    }
}

void turretLinkSend(const char *line) {
    linkSerial.print(line);
    linkSerial.print('\n');
}

bool turretLinkArmed() { return armed; }

bool turretLinkConnected() {
    return lastRxMs != 0 && (millis() - lastRxMs) < TURRET_LINK_TIMEOUT_MS;
}

#else

void turretLinkBegin() {}
void turretLinkLoop()  {}
void turretLinkSend(const char *) {}
bool turretLinkArmed() { return false; }
bool turretLinkConnected() { return false; }

#endif
