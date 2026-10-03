#pragma once
#include <Arduino.h>

/**
 * Remote maintenance over WiFi, so the turret never needs the USB cable again:
 *   - OTA firmware updates (ArduinoOTA / espota.py, password protected)
 *   - telnet console on TELNET_PORT: same commands and same log as the serial console,
 *     unlocked by typing OTA_PASSWORD as the first line
 * WiFi is optional: the turret works the same without it.
 */
void netBegin();
void netLoop();
bool netConnected();
void netPrintStatus(Print &out);
void netPrintCrash(Print &out, bool erase);   /* last panic from the core dump partition */

/** Next character typed on the telnet console (telnet negotiation stripped), -1 if none. */
int  netConsoleRead();

/** Log sink: serial console + authenticated telnet client. Use Log.printf() instead of Serial.printf(). */
class LogTee : public Print {
public:
    size_t write(uint8_t c) override;
    size_t write(const uint8_t *buf, size_t n) override;
};
extern LogTee Log;
