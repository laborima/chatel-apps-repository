#include "lcd_display.h"
#include "config.h"
#include "stats.h"
#include "detector.h"
#include "wifi_manager.h"

#if LCD_ENABLED && TURRET_LINK_ENABLED && \
    (LCD_RS == TURRET_LINK_TX_PIN || LCD_RS == TURRET_LINK_RX_PIN || LCD_EN == TURRET_LINK_TX_PIN || LCD_EN == TURRET_LINK_RX_PIN)
#error "LCD RS/EN collide with the turret UART link: move them to free pins in config.h"
#endif

#if LCD_ENABLED
#include <LiquidCrystal.h>
static LiquidCrystal lcd(LCD_RS, LCD_EN, LCD_D4, LCD_D5, LCD_D6, LCD_D7);
static unsigned long lastRefresh = 0;
static unsigned long holdUntil = 0;

void lcdBegin() {
    lcd.begin(16, 2);
    lcd.clear();
    lcd.print("MOSTIKATOR");
    lcd.setCursor(0, 1);
    lcd.print("Empire strikes..");
    holdUntil = millis() + 2000;
}

void lcdMessage(const char *line1, const char *line2) {
    lcd.clear();
    lcd.print(line1);
    lcd.setCursor(0, 1);
    lcd.print(line2);
    holdUntil = millis() + 1500;
}

void lcdLoop() {
    unsigned long now = millis();
    if (now < holdUntil) return;
    if (now - lastRefresh < 500) return;
    lastRefresh = now;

    Stats st = statsGet();
    char l1[17], l2[17];
    snprintf(l1, sizeof(l1), "VU%4lu TIR%4lu", (unsigned long)st.seen, (unsigned long)st.shots);
    const char *state = detectorArmed() ? (detectorState() == DET_ARMED ? "ARM" : "LRN") : "OFF";
    snprintf(l2, sizeof(l2), "OK%3lu KO%3lu %s", (unsigned long)st.hits, (unsigned long)st.misses,
             wifiIsConnected() ? state : "NET");
    lcd.setCursor(0, 0); lcd.print(l1);
    lcd.setCursor(0, 1); lcd.print(l2);
}
#else
void lcdBegin() {}
void lcdLoop() {}
void lcdMessage(const char *, const char *) {}
#endif
