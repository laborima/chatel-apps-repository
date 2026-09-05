/**
 * Mostikator – turret node
 * "Le moustique a tort. L'Empire contre-attaque."
 *
 * Firmware for the ELEGOO ESP32 (ESP32-WROOM-32, USB-C / CP2102) driving the water turret:
 *   - PS5 DualSense over Bluetooth Classic (lib esp-ps5): left stick = rotation + up/down,
 *     Cross = fire, Square = green LEDs, Options = arm, Create = servo calibration
 *   - Two Futaba S3003 servos (pan GPIO14 / tilt GPIO13) with a two-point calibration per axis saved in NVS
 *   - 4-relay board: 12 V pump + fast solenoid valve (bursts limited to FIRE_MAX_MS)
 *   - Green LEDs on the jet + laser sound on a piezo
 *   - Serial console (115200) for calibration: type "help"
 *
 * Servo calibration (see README "Réglage des servos"):
 *   Create -> calibration mode, D-pad moves the servos in raw pulse steps, Cross/Circle mark the
 *   tilt low/high stops, Square/Triangle the pan stops, Options saves. Or on the console:
 *   "tilt 1000", "tilt +", "mark tilt low -20", ..., "save".
 *
 * Arduino IDE settings:
 *   Board "ESP32 Dev Module", Partition Scheme "Huge APP (3MB No OTA/1MB SPIFFS)" (Bluedroid is big),
 *   Upload Speed 921600, port /dev/ttyUSB0 (CP2102).
 *
 * Dependencies (Library Manager): esp-ps5 (Hamza Yesilmen). Servos use the core LEDC API directly.
 *
 * @author Matthieu Laborie
 */

#include <Arduino.h>
#include <esp_task_wdt.h>

#include "config.h"
#include "turret.h"
#include "water_gun.h"
#include "ps5_input.h"
#include "console.h"

static unsigned long lastStatus = 0;

void setup() {
    Serial.begin(115200);
    delay(300);
    Serial.println();
    Serial.println("[BOOT] Mostikator turret – l'Empire contre-attaque");

    gunBegin();       /* relays idle first: never boot with the valve open */
    turretBegin();

    esp_task_wdt_config_t wdtConfig = {
        .timeout_ms = WDT_TIMEOUT_S * 1000,
        .idle_core_mask = 0,
        .trigger_panic = true
    };
    if (esp_task_wdt_reconfigure(&wdtConfig) != ESP_OK) {
        esp_task_wdt_init(&wdtConfig);
    }
    esp_task_wdt_add(NULL);

    ps5InputBegin();  /* may block up to PS5_PAIR_TIMEOUT_S while scanning */
    consoleBegin();
    Serial.println("[BOOT] Setup complete");
}

void loop() {
    esp_task_wdt_reset();
    ps5InputLoop();
    turretLoop();
    gunLoop();
    consoleLoop();

    unsigned long now = millis();
    if (now - lastStatus >= 10000) {
        lastStatus = now;
        Serial.printf("[STA] PS5 %s | pan %.1f tilt %.1f | %s pump %s shots %lu\n",
                      ps5InputConnected() ? "ok" : "--", turretAngle(AXIS_PAN), turretAngle(AXIS_TILT),
                      gunArmed() ? "ARMED" : "safe", gunPumpOn() ? "on" : "off", (unsigned long)gunShots());
    }
    delay(2);
}
