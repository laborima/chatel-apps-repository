#include "events_ws.h"
#include "config.h"
#include "json_builders.h"
#include "detector.h"
#include "app_events.h"
#include <WebSocketsServer.h>

static WebSocketsServer wsServer(WS_PORT);
static int clientCount = 0;
static char msg[4096];

static void sendSnapshot(uint8_t num) {
    jsonStatus(msg, sizeof(msg));  wsServer.sendTXT(num, msg);
    jsonConfig(msg, sizeof(msg));  wsServer.sendTXT(num, msg);
    jsonStats(msg, sizeof(msg));   wsServer.sendTXT(num, msg);
    jsonTargets(msg, sizeof(msg)); wsServer.sendTXT(num, msg);
}

static void onWsEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length) {
    switch (type) {
        case WStype_CONNECTED:
            clientCount++;
            Serial.printf("[WS] Client #%d connected (%d total)\n", num, clientCount);
            sendSnapshot(num);
            break;
        case WStype_DISCONNECTED:
            if (clientCount > 0) clientCount--;
            Serial.printf("[WS] Client #%d disconnected (%d remaining)\n", num, clientCount);
            break;
        case WStype_TEXT: {
            String cmd((const char *)payload, length);
            if (cmd == "arm") {
                detectorArm(true);
                appConfigChanged();
            } else if (cmd == "disarm") {
                detectorArm(false);
                appConfigChanged();
            } else if (cmd == "ping") {
                wsServer.sendTXT(num, "{\"type\":\"pong\"}");
            } else if (cmd == "snapshot") {
                sendSnapshot(num);
            }
            break;
        }
        default:
            break;
    }
}

void wsBegin() {
    wsServer.begin();
    wsServer.onEvent(onWsEvent);
    Serial.printf("[WS] Event stream on port %d\n", WS_PORT);
}

void wsLoop() { wsServer.loop(); }

void wsBroadcast(const char *json) {
    if (clientCount == 0) return;
    wsServer.broadcastTXT(json, strlen(json));
}

int wsClients() { return clientCount; }
