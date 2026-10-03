#include "water_gun.h"
#include "config.h"
#include "link.h"
#include "net.h"

static bool          armed = false;
static bool          pumpOn = false;
static bool          valveOpen = false;
static bool          held = false;
static bool          holdExhausted = false;   /* max burst reached while held: wait for release */
static bool          ledsLatched = false;
static bool          ledsLit = false;
static bool          laserOn = false;
static unsigned long laserOnAt = 0;
static unsigned long valveOpenedAt = 0;
static unsigned long valveBurstMs = 0;        /* durations, not deadlines: safe across the millis() wrap */
static unsigned long valveClosedAt = 0;
static unsigned long pumpLastUse = 0;
static uint32_t      shots = 0;
static unsigned long dryShotAt = 0;           /* last disarmed "shot": LEDs + sound, no water */

/* Laser sound: descending sweep, non-blocking */
static bool          fxActive = false;
static unsigned long fxStart = 0;
static unsigned long fxLastStep = 0;
#define FX_DURATION_MS 280
#define FX_F_START     1800
#define FX_F_END        220

static void relayWrite(int pin, bool on) {
    if (pin < 0) return;
    bool level = RELAY_ACTIVE_LOW ? !on : on;
    digitalWrite(pin, level ? HIGH : LOW);
}

static void relayInit(int pin) {
    if (pin < 0) return;
    /* pinMode() first: core 3.x ignores digitalWrite() on a pin not yet set as GPIO, and the output
     * then starts LOW = relay energised on this active-LOW board */
    pinMode(pin, OUTPUT);
    relayWrite(pin, false);
}

static void ledWrite(bool on) {
    relayWrite(PIN_RELAY_LEDS, on);
    ledsLit = on;
}

static void setPump(bool on) {
    if (on == pumpOn) return;
    pumpOn = on;
    relayWrite(PIN_RELAY_PUMP, on);
    pumpLastUse = millis();
    Log.printf("[GUN] Pump %s\n", on ? "ON" : "OFF");
}

static void openValve(unsigned long ms) {
    unsigned long now = millis();
    valveOpen = true;
    valveOpenedAt = now;
    valveBurstMs = min<unsigned long>(ms, FIRE_MAX_MS);
    relayWrite(PIN_RELAY_VALVE, true);
    ledWrite(true);
    shots++;
    pumpLastUse = now;
    gunLaserFx();
    linkSendFire((uint16_t)valveBurstMs);   /* the P4 owns the speaker */
    Log.printf("[GUN] FIRE #%lu (%lu ms)\n", (unsigned long)shots, valveBurstMs);
}

static void closeValve() {
    if (!valveOpen) return;
    valveOpen = false;
    valveClosedAt = millis();
    relayWrite(PIN_RELAY_VALVE, false);
}

/* Disarmed trigger: the show without the water - green LEDs, blaster on the P4, piezo */
static void dryShot() {
    unsigned long now = millis();
    if (dryShotAt && now - dryShotAt < FIRE_TAP_MS + FIRE_MIN_GAP_MS) return;
    dryShotAt = now;
    ledWrite(true);
    gunLaserFx();
    linkSendFire(FIRE_TAP_MS);
    Log.println("[GUN] Dry shot (disarmed): LEDs + sound, no water");
}

static bool canOpen() {
    if (!armed) return false;
    if (!pumpOn) setPump(true);
    if (millis() - valveClosedAt < FIRE_MIN_GAP_MS) return false;
    return true;
}

/* ================= API ================= */
void gunBegin() {
    relayInit(PIN_RELAY_PUMP);
    relayInit(PIN_RELAY_VALVE);
    relayInit(PIN_RELAY_LASER);
    relayInit(PIN_RELAY_LEDS);
#if PIN_BUZZER >= 0
    pinMode(PIN_BUZZER, OUTPUT);
#endif
    ledsLit = false;
    Log.println("[GUN] Relays idle, disarmed");
}

void gunLoop() {
    unsigned long now = millis();

    if (valveOpen) {
        unsigned long openFor = now - valveOpenedAt;
        bool timeout = openFor >= FIRE_MAX_MS;
        if (timeout || (!held && openFor >= valveBurstMs)) {
            closeValve();
            if (timeout && held) holdExhausted = true;
        }
    } else if (held && !holdExhausted && armed && now - valveClosedAt >= FIRE_MIN_GAP_MS) {
        if (!pumpOn) setPump(true);
        openValve(FIRE_MAX_MS);
    }

    /* LEDs: on while firing (+ afterglow), after a dry shot, or when latched with Square */
    bool wantLeds = ledsLatched || valveOpen || (now - valveClosedAt < LED_AFTERGLOW_MS && shots > 0)
                 || (dryShotAt && now - dryShotAt < FIRE_TAP_MS + LED_AFTERGLOW_MS);
    if (wantLeds != ledsLit) ledWrite(wantLeds);

#if LASER_MAX_ON_MS > 0
    if (laserOn && now - laserOnAt >= LASER_MAX_ON_MS) {
        Log.println("[GUN] Laser auto-off");
        gunLaser(false);
    }
#endif

#if PUMP_IDLE_OFF_MS > 0
    if (pumpOn && !valveOpen && !held && now - pumpLastUse >= PUMP_IDLE_OFF_MS) {
        Log.println("[GUN] Pump idle timeout");
        setPump(false);
    }
#endif

#if PIN_BUZZER >= 0
    if (fxActive) {
        unsigned long t = now - fxStart;
        if (t >= FX_DURATION_MS) {
            noTone(PIN_BUZZER);
            fxActive = false;
        } else if (now - fxLastStep >= 8) {
            fxLastStep = now;
            unsigned int f = FX_F_START - (unsigned int)((FX_F_START - FX_F_END) * t / FX_DURATION_MS);
            tone(PIN_BUZZER, f);
        }
    }
#endif
}

void gunSetArmed(bool a) {
    if (a == armed) return;
    armed = a;
    Log.printf("[GUN] %s\n", armed ? "ARMED – pump on" : "DISARMED");
    linkSendArmed(armed);
    if (armed) setPump(true);
    else { held = false; closeValve(); setPump(false); }
}

bool gunArmed()  { return armed; }
void gunPump(bool on) { setPump(on); }
bool gunPumpOn() { return pumpOn; }

void gunFire(uint16_t ms) {
    if (valveOpen) return;
    if (!armed) { dryShot(); return; }
    if (!canOpen()) return;
    openValve(ms);
}

void gunHold(bool h) {
    if (h == held) return;
    held = h;
    if (!held) {
        holdExhausted = false;
        /* very short tap: still give a minimal burst */
        if (valveOpen) valveBurstMs = FIRE_TAP_MS;
    } else if (!valveOpen) {
        if (!armed) dryShot();
        else if (canOpen()) openValve(FIRE_MAX_MS);
    }
}

bool     gunFiring() { return valveOpen; }
uint32_t gunShots()  { return shots; }

void gunLeds(bool on) {
    ledsLatched = on;
    Log.printf("[GUN] LEDs %s\n", on ? "ON" : "OFF");
}
bool gunLedsOn() { return ledsLatched; }

void gunLaser(bool on) {
    if (on == laserOn) return;
    laserOn = on;
    laserOnAt = millis();
    relayWrite(PIN_RELAY_LASER, on);
    Log.printf("[GUN] Laser %s\n", on ? "ON" : "OFF");
}
bool gunLaserOn() { return laserOn; }

void gunLaserFx() {
#if PIN_BUZZER >= 0
    fxActive = true;
    fxStart = millis();
    fxLastStep = 0;
#endif
}

void gunAllOff() {
    held = false;
    holdExhausted = false;
    closeValve();
    setPump(false);
    armed = false;
    linkSendArmed(false);   /* gunSetArmed() is bypassed here: tell the P4 anyway */
    ledsLatched = false;
    ledWrite(false);
    gunLaser(false);
#if PIN_BUZZER >= 0
    noTone(PIN_BUZZER);
    fxActive = false;
#endif
    Log.println("[GUN] All off");
}
