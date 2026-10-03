#pragma once
#include <Arduino.h>

/**
 * Blaster sound on the on-board speaker connector.
 *
 * The Waveshare ESP32-P4-WIFI6 carries an ES8311 codec (I2C 0x18) driving a
 * NS4150B amplifier and the PH2.0 speaker header. The samples come from flash
 * (blaster_pcm.h) and are pushed on I2S0 by a dedicated task, so a shot never
 * stalls the web server or the detector.
 *
 * audioBegin() MUST be called before cameraBegin(): the codec is configured on
 * the same I2C bus as the camera SCCB, and the camera driver takes the port
 * over for good once it starts.
 */
void audioBegin();
void audioLaserFx();            /* pew pew - returns immediately */
bool audioReady();

/* Volume is applied in software while streaming: the codec register lives on the I2C bus
 * the camera driver owns once it has started, so it can only be set at boot. 0-100 %. */
void    audioPlayTone();        /* diagnostic: full-scale 1 kHz sine */
void    audioSetVolume(uint8_t percent);
uint8_t audioVolume();
