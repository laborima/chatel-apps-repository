#pragma once
#include <Arduino.h>

/**
 * Non-blocking WiFi manager (dual SSID, exponential retry, NTP sync).
 * Ported from signalk_esp_pond_video. On the ESP32-P4 the radio is the
 * ESP32-C6 co-processor reached through ESP-Hosted (SDIO) – the Arduino
 * WiFi API is identical.
 */
void   wifiBegin();
void   wifiLoop();
bool   wifiIsConnected();
bool   wifiNtpSynced();
int    wifiRssi();
String wifiIp();
int    wifiLocalHour();   // -1 if NTP not synced
