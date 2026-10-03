#pragma once
#include <Arduino.h>

/** DualSense mapping -> turret / water gun. */
void ps5InputBegin();
void ps5InputLoop();
bool ps5InputConnected();
void ps5InputForget();
void ps5InputScan(uint8_t secs);   /* list visible BT devices on the console (diagnostic) */
void ps5InputPrintStatus(Print &out);   /* controller + Bluetooth link state ("net" command) */
bool ps5InputCameraMode();   /* controller connected but switched to camera mode (touchpad) */
