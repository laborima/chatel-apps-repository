#include "wifi_manager.h"
#include <WiFi.h>
#include <time.h>
#include "config.h"

#define NTP_SERVER   "pool.ntp.org"
#define TZ_PARIS     "CET-1CEST,M3.5.0,M10.5.0/3"

#define WIFI_CONNECT_TIMEOUT_MS  15000
#define WIFI_RETRY_BASE_MS       1000
#define WIFI_RETRY_MAX_MS        60000
#define WIFI_MAX_FAILURES        10

enum WifiState {
    WIFI_STATE_IDLE,
    WIFI_STATE_CONNECTING_SSID1,
    WIFI_STATE_CONNECTING_SSID2,
    WIFI_STATE_WAIT_RETRY
};

static WifiState     wifiState = WIFI_STATE_WAIT_RETRY;
static unsigned long wifiConnectStart = 0;
static unsigned long lastWifiCheck = 0;
static unsigned long wifiRetryDelay = 0;
static int           wifiConsecutiveFailures = 0;
static bool          ntpSynced = false;

void wifiBegin() {
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(false);
    WiFi.setSleep(false);          // low latency for the video stream
    WiFi.setHostname(DEVICE_NAME);
    wifiState = WIFI_STATE_WAIT_RETRY;
    wifiRetryDelay = 0;
    lastWifiCheck = millis();
}

bool wifiIsConnected() { return WiFi.status() == WL_CONNECTED; }
bool wifiNtpSynced()   { return ntpSynced; }
int  wifiRssi()        { return wifiIsConnected() ? WiFi.RSSI() : 0; }
String wifiIp()        { return wifiIsConnected() ? WiFi.localIP().toString() : String("0.0.0.0"); }

int wifiLocalHour() {
    struct tm timeinfo;
    if (!ntpSynced || !getLocalTime(&timeinfo, 0)) return -1;
    return timeinfo.tm_hour;
}

void wifiLoop() {
    if (WiFi.status() == WL_CONNECTED) {
        if (wifiState != WIFI_STATE_IDLE) {
            Serial.printf("[WIFI] Connected – IP: %s (RSSI %d)\n",
                          WiFi.localIP().toString().c_str(), WiFi.RSSI());
            wifiState = WIFI_STATE_IDLE;
            wifiRetryDelay = WIFI_RETRY_BASE_MS;
            wifiConsecutiveFailures = 0;
            ntpSynced = false;
        }

        if (!ntpSynced) {
            configTzTime(TZ_PARIS, NTP_SERVER);
            struct tm timeinfo;
            if (getLocalTime(&timeinfo, 0)) {
                ntpSynced = true;
                Serial.println("[NTP] Time synced");
            }
        }
        return;
    }

    unsigned long now = millis();

    switch (wifiState) {
        case WIFI_STATE_IDLE:
        case WIFI_STATE_WAIT_RETRY:
            if (now - lastWifiCheck >= wifiRetryDelay) {
                wifiConsecutiveFailures++;
                Serial.printf("[WIFI] Disconnected – attempt %d\n", wifiConsecutiveFailures);

                if (wifiConsecutiveFailures >= WIFI_MAX_FAILURES) {
                    Serial.println("[WIFI] Too many failures – rebooting");
                    ESP.restart();
                }

                if (wifiConsecutiveFailures % 3 == 0) {
                    Serial.println("[WIFI] Full reset cycle");
                    WiFi.disconnect(true);
                    WiFi.mode(WIFI_STA);
                }

                Serial.printf("[WIFI] Trying %s...\n", WIFI_SSID);
                WiFi.begin(WIFI_SSID, WIFI_PASS);
                wifiConnectStart = now;
                wifiState = WIFI_STATE_CONNECTING_SSID1;
            }
            break;

        case WIFI_STATE_CONNECTING_SSID1:
            if (now - wifiConnectStart >= WIFI_CONNECT_TIMEOUT_MS) {
                Serial.printf("[WIFI] Failed to connect to %s\n", WIFI_SSID);
#ifdef WIFI_SSID2
                Serial.printf("[WIFI] Trying %s...\n", WIFI_SSID2);
                WiFi.disconnect(true);
                WiFi.begin(WIFI_SSID2, WIFI_PASS2);
                wifiConnectStart = now;
                wifiState = WIFI_STATE_CONNECTING_SSID2;
#else
                WiFi.disconnect(true);
                wifiRetryDelay = min(wifiRetryDelay * 2, (unsigned long)WIFI_RETRY_MAX_MS);
                if (wifiRetryDelay == 0) wifiRetryDelay = WIFI_RETRY_BASE_MS;
                lastWifiCheck = now;
                wifiState = WIFI_STATE_WAIT_RETRY;
#endif
            }
            break;

        case WIFI_STATE_CONNECTING_SSID2:
            if (now - wifiConnectStart >= WIFI_CONNECT_TIMEOUT_MS) {
#ifdef WIFI_SSID2
                Serial.printf("[WIFI] Failed to connect to %s\n", WIFI_SSID2);
#endif
                WiFi.disconnect(true);
                wifiRetryDelay = min(wifiRetryDelay * 2, (unsigned long)WIFI_RETRY_MAX_MS);
                if (wifiRetryDelay == 0) wifiRetryDelay = WIFI_RETRY_BASE_MS;
                lastWifiCheck = now;
                wifiState = WIFI_STATE_WAIT_RETRY;
                Serial.printf("[WIFI] Still disconnected, next retry in %lu ms\n", wifiRetryDelay);
            }
            break;
    }
}
