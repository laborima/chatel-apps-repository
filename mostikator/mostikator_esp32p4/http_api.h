#pragma once
#include <Arduino.h>

/**
 * HTTP server (port HTTP_PORT):
 *   /api/*  -> REST API (status, targets, config, stats, arm, shot, capture, stream)
 *   /*      -> static webapp from LittleFS (signalk-mostikator built with TARGET=esp)
 *
 * The same API is reachable through the SignalK plugin proxy:
 *   https://<signalk>/mostikator/device/<route>  ->  http://<esp>/api/<route>
 */
void httpBegin();
void httpLoop();
int  httpStreamClients();
