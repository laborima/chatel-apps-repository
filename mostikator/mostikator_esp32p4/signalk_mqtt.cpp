#include "signalk_mqtt.h"
#include "config.h"
#include "remote.h"
#include "wifi_manager.h"
#include <WiFi.h>
#include <PubSubClient.h>

static WiFiClient   netClient;
static PubSubClient mqtt(netClient);
static unsigned long lastRetry = 0;
static unsigned long retryDelay = 5000;   /* doubles up to 60 s while the broker is away */
static bool wasConnected = false;
static char payload[3072];

void signalkBegin() {
    mqtt.setServer(MQTT_HOST, MQTT_PORT);
    mqtt.setBufferSize(sizeof(payload) + 64);
    /* Defaults are 3 s TCP connect + 15 s CONNACK wait, all inside loop(): keep them short */
    netClient.setConnectionTimeout(500);
    mqtt.setSocketTimeout(2);
}

bool signalkConnected() { return mqtt.connected(); }

void signalkLoop() {
    if (!wifiIsConnected()) return;

    if (mqtt.connected()) {
        if (!wasConnected) {
            Log.println("[MQTT] Connected");
            wasConnected = true;
            retryDelay = 5000;
        }
        mqtt.loop();
        return;
    }
    if (wasConnected) {
        Log.println("[MQTT] Disconnected – will retry");
        wasConnected = false;
    }
    if (millis() - lastRetry < retryDelay) return;
    lastRetry = millis();
    if (!mqtt.connect(DEVICE_NAME)) {
        retryDelay = min(retryDelay * 2, 60000UL);
        Log.printf("[MQTT] Connect failed, rc=%d – next try in %lu s\n", mqtt.state(), retryDelay / 1000);
    }
}

bool signalkPublishValues(const char *valuesJson) {
    if (!mqtt.connected()) return false;
    int n = snprintf(payload, sizeof(payload),
        "{\"context\":\"vessels.self\",\"updates\":[{\"source\":{\"label\":\"mostikator\",\"type\":\"sensor\"},"
        "\"values\":[%s]}]}", valuesJson);
    if (n < 0 || n >= (int)sizeof(payload)) {
        Log.println("[MQTT] Payload too large – dropped");
        return false;
    }
    bool ok = mqtt.publish(MQTT_TOPIC, payload);
    if (!ok) Log.printf("[MQTT] publish failed (state=%d)\n", mqtt.state());
    return ok;
}
