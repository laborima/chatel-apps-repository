#include "wifi_manager.h"
#include <WiFi.h>
#include <time.h>
#include "config.h"
#include "remote.h"

#define NTP_SERVER   "pool.ntp.org"
#define TZ_PARIS     "CET-1CEST,M3.5.0,M10.5.0/3"

#define WIFI_CONNECT_TIMEOUT_MS  30000   // ESP-Hosted radio (C6) needs >15 s on first association
#define WIFI_RETRY_BASE_MS       1000
#define WIFI_RETRY_MAX_MS        60000
#define WIFI_MAX_FAILURES        10
#define WIFI_ABSENT_MIN_MS       5000    /* the C6 reports NO_SSID_AVAIL only after its first scan */

enum WifiState {
    WIFI_STATE_IDLE,
    WIFI_STATE_CONNECTING,
    WIFI_STATE_WAIT_RETRY
};

#ifdef WIFI_SSID2
static const char *const ssids[2]  = { WIFI_SSID, WIFI_SSID2 };
static const char *const passes[2] = { WIFI_PASS, WIFI_PASS2 };
#else
static const char *const ssids[2]  = { WIFI_SSID, "" };
static const char *const passes[2] = { WIFI_PASS, "" };
#endif

static WifiState     wifiState = WIFI_STATE_WAIT_RETRY;
static int           ssidIdx = 0;           /* network being tried, then the one that worked: tried first next time */
static int           tried = 0;             /* networks tried in the current round */
static unsigned long wifiConnectStart = 0;
static unsigned long lastWifiCheck = 0;
static unsigned long wifiRetryDelay = 0;
static int           wifiConsecutiveFailures = 0;
static bool          ntpSynced = false;
static bool          ntpStarted = false;
static unsigned long lastNtpCheck = 0;

static int ssidCount() { return ssids[1][0] ? 2 : 1; }

static void tryCurrent(unsigned long now) {
    Log.printf("[WIFI] Trying %s...\n", ssids[ssidIdx]);
    WiFi.disconnect();
    WiFi.begin(ssids[ssidIdx], passes[ssidIdx]);
    wifiConnectStart = now;
    wifiState = WIFI_STATE_CONNECTING;
}

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
            Log.printf("[WIFI] Connected to %s – IP: %s (RSSI %d)\n",
                          WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI());
            wifiState = WIFI_STATE_IDLE;
            wifiRetryDelay = WIFI_RETRY_BASE_MS;
            wifiConsecutiveFailures = 0;
            ntpSynced = false;
            ntpStarted = false;
        }

        // Start SNTP once per connection (restarting it every loop prevents the sync)
        if (!ntpStarted) {
            configTzTime(TZ_PARIS, NTP_SERVER);
            ntpStarted = true;
            lastNtpCheck = millis();
        } else if (!ntpSynced && millis() - lastNtpCheck >= 1000) {
            lastNtpCheck = millis();
            struct tm timeinfo;
            if (getLocalTime(&timeinfo, 0)) {
                ntpSynced = true;
                Log.printf("[NTP] Time synced: %02d:%02d\n", timeinfo.tm_hour, timeinfo.tm_min);
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
                Log.printf("[WIFI] Disconnected – attempt %d\n", wifiConsecutiveFailures);

                if (wifiConsecutiveFailures >= WIFI_MAX_FAILURES) {
                    Log.println("[WIFI] Too many failures – rebooting");
                    ESP.restart();
                }

                if (wifiConsecutiveFailures % 3 == 0) {
                    Log.println("[WIFI] Full reset cycle");
                    WiFi.disconnect(true);
                    WiFi.mode(WIFI_STA);
                }

                tried = 1;
                tryCurrent(now);   /* the last network that worked first */
            }
            break;

        case WIFI_STATE_CONNECTING: {
            /* An SSID reported absent is not worth the whole timeout: switch to the other one at once */
            wl_status_t st = WiFi.status();
            bool absent = st == WL_NO_SSID_AVAIL && now - wifiConnectStart >= WIFI_ABSENT_MIN_MS;
            if (!absent && now - wifiConnectStart < WIFI_CONNECT_TIMEOUT_MS) break;

            Log.printf("[WIFI] Failed to connect to %s%s\n", ssids[ssidIdx], absent ? " (not found)" : "");
            if (tried < ssidCount()) {
                tried++;
                ssidIdx = (ssidIdx + 1) % ssidCount();
                tryCurrent(now);
                break;
            }
            ssidIdx = (ssidIdx + 1) % ssidCount();   /* next round starts with the other one */
            WiFi.disconnect(true);
            wifiRetryDelay = min(wifiRetryDelay * 2, (unsigned long)WIFI_RETRY_MAX_MS);
            if (wifiRetryDelay == 0) wifiRetryDelay = WIFI_RETRY_BASE_MS;
            lastWifiCheck = now;
            wifiState = WIFI_STATE_WAIT_RETRY;
            Log.printf("[WIFI] Still disconnected, next retry in %lu ms\n", wifiRetryDelay);
            break;
        }
    }
}
