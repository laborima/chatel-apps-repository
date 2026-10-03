#pragma once
#include <Arduino.h>

/**
 * Remote maintenance, so the board never needs the USB cable again:
 *   - OTA updates over WiFi (ArduinoOTA / espota.py, password protected): the firmware,
 *     and the LittleFS webapp image (espota -s)
 *   - console on the serial port and over telnet (TELNET_PORT, OTA_PASSWORD as first line),
 *     with the log history replayed at connection time (boot included)
 *   - the same history over HTTP: GET /api/log (read only, reachable through the SignalK proxy)
 *
 * Every task may log (camera, detector, audio, MJPEG): Log writes the serial port at once and
 * appends to a PSRAM ring buffer; only loop() touches the network.
 */
void remoteBegin();        /* before anything logs: allocates the history */
void remoteLoop();         /* OTA + telnet, from loop() once WiFi is managed */
bool remoteOtaRunning();
void remotePrintCrash(Print &out, bool erase);   /* last panic from the core dump partition */

/** Copy the tail of the log history (at most cap-1 bytes, NUL terminated). Returns the length. */
size_t remoteLogCopy(char *out, size_t cap);

class LogTee : public Print {
public:
    size_t write(uint8_t c) override;
    size_t write(const uint8_t *buf, size_t n) override;
};
extern LogTee Log;
