#pragma once
#include <Arduino.h>
#include "detector.h"

/**
 * snprintf-based JSON builders shared by the REST API, the WebSocket
 * event stream and the SignalK (MQTT) publisher. All return the number
 * of bytes written (excluding the terminating NUL).
 */
size_t jsonStatus(char *buf, size_t cap);
size_t jsonConfig(char *buf, size_t cap);
size_t jsonStats(char *buf, size_t cap);
size_t jsonTarget(const Target &t, char *buf, size_t cap);
size_t jsonTargets(char *buf, size_t cap);
size_t jsonDetectorEvent(const DetectorEvent &e, char *buf, size_t cap);
size_t jsonShotEvent(uint16_t targetId, bool hit, char *buf, size_t cap);

/* SignalK delta "values" arrays (without the surrounding brackets) */
size_t skStatusValues(char *buf, size_t cap);
size_t skTargetValues(const Target *t, char *buf, size_t cap);   // t == nullptr -> clears the target
size_t skEventValues(const DetectorEvent &e, char *buf, size_t cap);
size_t skShotValues(uint16_t targetId, bool hit, char *buf, size_t cap);
