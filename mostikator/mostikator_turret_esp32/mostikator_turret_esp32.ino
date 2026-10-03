/**
 * Mostikator – turret node
 * "Le moustique a tort. L'Empire contre-attaque."
 *
 * Firmware for the ELEGOO ESP32 (ESP32-WROOM-32, USB-C / CP2102) driving the water turret:
 *   - PS5 DualSense over Bluetooth Classic (lib esp-ps5): left stick = rotation + up/down,
 *     Cross = fire, Square = green LEDs, Circle = laser, Options = arm, Create = servo calibration
 *   - Futaba S3003 tilt servo on GPIO13 (pan axis optional, PIN_SERVO_PAN), two-point calibration saved in NVS
 *   - 4-relay board: 12 V pump (GPIO26) + fast solenoid valve (GPIO27, bursts limited to FIRE_MAX_MS),
 *     aiming laser (GPIO25), green LEDs on the jet (GPIO14). Laser sound on a piezo
 *   - Serial link to the ESP32-P4 (UART2 GPIO17/16): manual shots trigger the blaster on its speaker,
 *     and any aim/fire order coming from the camera is refused while the controller is connected
 *   - Serial console (115200) for calibration: type "help"
 *   - WiFi maintenance: OTA updates (espota, port 3232) and the same console over telnet (port 23)
 *
 * Servo calibration (see README "Réglage des servos"):
 *   Create -> calibration mode, D-pad moves the servos in raw pulse steps, Cross/Circle mark the
 *   tilt low/high stops, Square/Triangle the pan stops, Options saves. Or on the console:
 *   "tilt 1000", "tilt +", "mark tilt low -20", ..., "save".
 *
 * Arduino IDE settings:
 *   Board "ESP32 Dev Module", Partition Scheme "No FS 4MB (2MB APP x2)" (Bluedroid + WiFi are big and OTA
 *   needs two app slots), Upload Speed 921600, port /dev/ttyUSB0 (CP2102) or the network port once flashed.
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
#include "link.h"
#include "net.h"

static unsigned long lastStatus = 0;

void setup() {
    Serial.begin(115200);
    delay(300);
    Serial.println();
    Serial.printf("[BOOT] Mostikator turret – l'Empire contre-attaque (built " __DATE__ " " __TIME__ ", reset reason %d)\n",
                  (int)esp_reset_reason());

    /* The stdout (VFS UART) lock is created on its first use. When that first use is a library log line
     * (mDNS, lwIP) at a moment the heap is exhausted, the lock cannot be allocated and abort() reboots the
     * turret (crash "lock_init_generic" in task mdns). Take it once now, while memory is plentiful. */
    printf("\n");
    fflush(stdout);

    gunBegin();       /* relays idle first: never boot with the valve open */
    if (esp_reset_reason() == ESP_RST_PANIC || esp_reset_reason() == ESP_RST_TASK_WDT) netPrintCrash(Serial, false);
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

    linkBegin();
    netBegin();       /* WiFi connects in the background */
    ps5InputBegin();  /* Bluetooth runs in its own task: never blocks */
    consoleBegin();
    Log.println("[BOOT] Setup complete");
}

void loop() {
    esp_task_wdt_reset();
    ps5InputLoop();
    linkLoop();
    netLoop();
    turretLoop();
    gunLoop();
    consoleLoop();

    /* Status line only when it changed (at most every 10 s) or once a minute: the 4 KB telnet history
     * must keep the boot log, not 400 identical lines */
    unsigned long now = millis();
    if (now - lastStatus >= 10000) {
        static char prev[160];
        static unsigned long lastPrint = 0;
        char line[160];
        snprintf(line, sizeof(line), "[STA] PS5 %s | pan %.1f tilt %.1f | %s pump %s laser %s shots %lu | %s | WiFi %s\n",
                 ps5InputConnected() ? "ok" : "--", turretAngle(AXIS_PAN), turretAngle(AXIS_TILT),
                 gunArmed() ? "ARMED" : "safe", gunPumpOn() ? "on" : "off", gunLaserOn() ? "on" : "off",
                 (unsigned long)gunShots(), linkAutoAllowed() ? "auto allowed" : "manual (controller)",
                 netConnected() ? "up" : "down");
        lastStatus = now;
        if (strcmp(line, prev) || now - lastPrint >= 60000) {
            lastPrint = now;
            strlcpy(prev, line, sizeof(prev));
            Log.print(line);
        }
    }
    delay(2);
}
