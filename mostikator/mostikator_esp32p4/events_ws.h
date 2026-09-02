#pragma once
#include <Arduino.h>

/**
 * WebSocket JSON event stream (port WS_PORT).
 * Messages: {"type":"status"|"config"|"stats"|"targets"|"event", ...}
 * Incoming text commands: "arm", "disarm", "ping".
 */
void wsBegin();
void wsLoop();
void wsBroadcast(const char *json);
int  wsClients();
