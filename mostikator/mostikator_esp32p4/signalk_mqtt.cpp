#include "signalk_mqtt.h"
#include "config.h"
#include "wifi_manager.h"
#include <WiFi.h>
#include <PubSubClient.h>

static WiFiClient   netClient;
static PubSubClient mqtt(netClient);
static unsigned long lastRetry = 0;
static bool wasConnected = false;
static char payload[3072];

void signalkBegin() {
    mqtt.setServer(MQTT_HOST, MQTT_PORT);
    mqtt.setBufferSize(sizeof(payload) + 64);
}

bool signalkConnected() { return mqtt.connected(); }

void signalkLoop() {
    if (!wifiIsConnected()) return;

    if (mqtt.connected()) {
        if (!wasConnected) {
            Serial.println("[MQTT] Connected");
            wasConnected = true;
        }
        mqtt.loop();
        return;
    }
    if (wasConnected) {
        Serial.println("[MQTT] Disconnected – will retry");
        wasConnected = false;
    }
    if (millis() - lastRetry < 5000) return;
    lastRetry = millis();
    if (!mqtt.connect(DEVICE_NAME)) {
        Serial.printf("[MQTT] Connect failed, rc=%d\n", mqtt.state());
    }
}

bool signalkPublishValues(const char *valuesJson) {
    if (!mqtt.connected()) return false;
    int n = snprintf(payload, sizeof(payload),
        "{\"context\":\"vessels.self\",\"updates\":[{\"source\":{\"label\":\"mostikator\",\"type\":\"sensor\"},"
        "\"values\":[%s]}]}", valuesJson);
    if (n < 0 || n >= (int)sizeof(payload)) {
        Serial.println("[MQTT] Payload too large – dropped");
        return false;
    }
    bool ok = mqtt.publish(MQTT_TOPIC, payload);
    if (!ok) Serial.printf("[MQTT] publish failed (state=%d)\n", mqtt.state());
    return ok;
}
