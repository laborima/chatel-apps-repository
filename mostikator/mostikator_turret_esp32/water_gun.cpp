#include "water_gun.h"
#include "config.h"

static bool          armed = false;
static bool          pumpOn = false;
static bool          valveOpen = false;
static bool          held = false;
static bool          holdExhausted = false;   /* max burst reached while held: wait for release */
static bool          ledsLatched = false;
static bool          ledsLit = false;
static unsigned long valveOpenedAt = 0;
static unsigned long valveCloseAt = 0;
static unsigned long valveClosedAt = 0;
static unsigned long pumpLastUse = 0;
static uint32_t      shots = 0;

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

static void ledWrite(bool on) {
#if PIN_LED_GREEN >= 0
    bool level = LED_ACTIVE_LOW ? !on : on;
    digitalWrite(PIN_LED_GREEN, level ? HIGH : LOW);
#endif
    ledsLit = on;
}

static void setPump(bool on) {
    if (on == pumpOn) return;
    pumpOn = on;
    relayWrite(PIN_RELAY_PUMP, on);
    pumpLastUse = millis();
    Serial.printf("[GUN] Pump %s\n", on ? "ON" : "OFF");
}

static void openValve(unsigned long ms) {
    unsigned long now = millis();
    valveOpen = true;
    valveOpenedAt = now;
    valveCloseAt = now + min<unsigned long>(ms, FIRE_MAX_MS);
    relayWrite(PIN_RELAY_VALVE, true);
    ledWrite(true);
    shots++;
    pumpLastUse = now;
    gunLaserFx();
    Serial.printf("[GUN] FIRE #%lu (%lu ms)\n", (unsigned long)shots, valveCloseAt - now);
}

static void closeValve() {
    if (!valveOpen) return;
    valveOpen = false;
    valveClosedAt = millis();
    relayWrite(PIN_RELAY_VALVE, false);
}

static bool canOpen() {
    if (!armed) { Serial.println("[GUN] Not armed (Options on the controller, or 'arm' on the console)"); return false; }
    if (!pumpOn) setPump(true);
    if (millis() - valveClosedAt < FIRE_MIN_GAP_MS) return false;
    return true;
}

/* ================= API ================= */
void gunBegin() {
    pinMode(PIN_RELAY_PUMP, OUTPUT);
    pinMode(PIN_RELAY_VALVE, OUTPUT);
#if PIN_RELAY_SPARE >= 0
    pinMode(PIN_RELAY_SPARE, OUTPUT);
    relayWrite(PIN_RELAY_SPARE, false);
#endif
#if PIN_LED_GREEN >= 0
    pinMode(PIN_LED_GREEN, OUTPUT);
#endif
#if PIN_BUZZER >= 0
    pinMode(PIN_BUZZER, OUTPUT);
#endif
    relayWrite(PIN_RELAY_PUMP, false);
    relayWrite(PIN_RELAY_VALVE, false);
    ledWrite(false);
    Serial.println("[GUN] Relays idle, disarmed");
}

void gunLoop() {
    unsigned long now = millis();

    if (valveOpen) {
        bool timeout = now - valveOpenedAt >= FIRE_MAX_MS;
        if (timeout || (!held && now >= valveCloseAt)) {
            closeValve();
            if (timeout && held) holdExhausted = true;
        }
    } else if (held && !holdExhausted && armed && now - valveClosedAt >= FIRE_MIN_GAP_MS) {
        if (!pumpOn) setPump(true);
        openValve(FIRE_MAX_MS);
    }

    /* LEDs: on while firing (+ afterglow) or when latched with Square */
    bool wantLeds = ledsLatched || valveOpen || (now - valveClosedAt < LED_AFTERGLOW_MS && shots > 0);
    if (wantLeds != ledsLit) ledWrite(wantLeds);

#if PUMP_IDLE_OFF_MS > 0
    if (pumpOn && !valveOpen && !held && now - pumpLastUse >= PUMP_IDLE_OFF_MS) {
        Serial.println("[GUN] Pump idle timeout");
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
    Serial.printf("[GUN] %s\n", armed ? "ARMED – pump on" : "DISARMED");
    if (armed) setPump(true);
    else { held = false; closeValve(); setPump(false); }
}

bool gunArmed()  { return armed; }
void gunPump(bool on) { setPump(on); }
bool gunPumpOn() { return pumpOn; }

void gunFire(uint16_t ms) {
    if (valveOpen) return;
    if (!canOpen()) return;
    openValve(ms);
}

void gunHold(bool h) {
    if (h == held) return;
    held = h;
    if (!held) {
        holdExhausted = false;
        if (valveOpen && millis() >= valveOpenedAt + FIRE_TAP_MS) closeValve();
        else if (valveOpen) valveCloseAt = valveOpenedAt + FIRE_TAP_MS;   /* very short tap: still give a minimal burst */
    } else if (!valveOpen) {
        if (canOpen()) openValve(FIRE_MAX_MS);
    }
}

bool     gunFiring() { return valveOpen; }
uint32_t gunShots()  { return shots; }

void gunLeds(bool on) {
    ledsLatched = on;
    Serial.printf("[GUN] LEDs %s\n", on ? "ON" : "OFF");
}
bool gunLedsOn() { return ledsLatched; }

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
    ledsLatched = false;
    ledWrite(false);
#if PIN_BUZZER >= 0
    noTone(PIN_BUZZER);
    fxActive = false;
#endif
    Serial.println("[GUN] All off");
}
