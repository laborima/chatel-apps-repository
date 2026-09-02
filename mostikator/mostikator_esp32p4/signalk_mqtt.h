#pragma once
#include <Arduino.h>

/**
 * SignalK publishing through the MQTT bridge (topic signalk/delta),
 * same mechanism as signalk_esp_pond_sensor.
 */
void signalkBegin();
void signalkLoop();
bool signalkConnected();
/** valuesJson = content of the "values" array (comma separated objects). */
bool signalkPublishValues(const char *valuesJson);
