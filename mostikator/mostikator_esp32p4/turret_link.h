#pragma once
#include <Arduino.h>

/**
 * Serial link to the turret ESP32 (UART2, 3 wires + common ground).
 *
 * The turret is driven over Bluetooth by the PS5 controller and announces its shots
 * here: the blaster then comes out of the on-board ES8311 codec and the speaker
 * plugged into this board. It also sends "HB <armed|safe> <shots>" every 5 s.
 */
void turretLinkBegin();
void turretLinkLoop();
void turretLinkSend(const char *line);   /* one ASCII command, "\n" appended */
bool turretLinkArmed();      /* last state announced by the turret */
bool turretLinkConnected();  /* the turret has spoken on the link recently */
