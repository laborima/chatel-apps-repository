#pragma once
#include <Arduino.h>

/**
 * Serial link to the ESP32-P4 detection node (UART2, 3 wires + common ground).
 *
 * Outgoing: every manual shot is announced so the P4 plays the blaster on the
 * speaker wired to its own board, the only real speaker in the setup.
 * Incoming: aim / fire orders from the camera, refused as long as the PS5
 * controller is connected - the controller always wins over the camera.
 */
void linkBegin();
void linkLoop();
void linkSendFire(uint16_t burstMs);
void linkSendArmed(bool armed);
bool linkAutoAllowed();     /* false while the PS5 controller drives the turret */
