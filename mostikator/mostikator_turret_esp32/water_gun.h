#pragma once
#include <Arduino.h>

/** Pump + solenoid valve relays, green LEDs on the jet, laser sound. */
void     gunBegin();
void     gunLoop();

void     gunSetArmed(bool armed);      /* arming starts the pump, disarming stops everything */
bool     gunArmed();
void     gunPump(bool on);             /* manual priming */
bool     gunPumpOn();

void     gunFire(uint16_t ms);         /* one burst (clamped to FIRE_MAX_MS) */
void     gunHold(bool held);           /* continuous fire while a button is held */
bool     gunFiring();
uint32_t gunShots();

void     gunLeds(bool on);             /* toggle the green LEDs permanently on/off */
bool     gunLedsOn();
void     gunLaserFx();                 /* pew pew */
void     gunAllOff();                  /* safety: valve closed, pump off, LEDs off */
