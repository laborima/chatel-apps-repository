#include "events_ws.h"
#include "config.h"
#include "remote.h"
#include "json_builders.h"
#include "detector.h"
#include "app_events.h"
#include <WebSocketsServer.h>

static WebSocketsServer wsServer(WS_PORT);
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
            Log.printf("[WS] Client #%d connected (%d total)\n", num, wsServer.connectedClients());
            sendSnapshot(num);
            break;
        case WStype_DISCONNECTED:
            /* Also fired for handshakes that never completed: never count clients by hand */
            Log.printf("[WS] Client #%d disconnected (%d remaining)\n", num, wsServer.connectedClients());
            break;
        case WStype_TEXT: {
            String cmd((const char *)payload, length);
            /* "arm <password>" / "disarm <password>": same CONTROL_PASSWORD as the HTTP commands */
            bool isArm = cmd.startsWith("arm"), isDisarm = cmd.startsWith("disarm");
            if (isArm || isDisarm) {
                String key = cmd.substring(cmd.indexOf(' ') < 0 ? cmd.length() : cmd.indexOf(' ') + 1);
                if (CONTROL_PASSWORD[0] && key != CONTROL_PASSWORD) {
                    wsServer.sendTXT(num, "{\"type\":\"error\",\"error\":\"authentication required\"}");
                } else {
                    detectorArm(isArm);
                    appConfigChanged();
                }
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
    /* A phone that walks out of WiFi range would stay "connected" for minutes and every broadcast
     * would stall loop() on it: ping every 3 s, drop after one missed pong */
    wsServer.enableHeartbeat(3000, 2000, 1);
    Log.printf("[WS] Event stream on port %d\n", WS_PORT);
}

void wsLoop() { wsServer.loop(); }

void wsBroadcast(const char *json) {
    if (wsServer.connectedClients() == 0) return;
    wsServer.broadcastTXT(json, strlen(json));
}

int wsClients() { return wsServer.connectedClients(); }
