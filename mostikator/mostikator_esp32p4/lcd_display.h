#pragma once
#include <Arduino.h>

/** Optional 16x2 HD44780 LCD: seen / shots / hits / misses / state. */
void lcdBegin();
void lcdLoop();
void lcdMessage(const char *line1, const char *line2);
