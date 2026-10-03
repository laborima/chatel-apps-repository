#include "stats.h"
#include "remote.h"
#include <Preferences.h>

static Preferences prefs;
static Stats       stats;
static bool        dirty = false;
static uint32_t    dirtySince = 0;

#define STATS_FLUSH_MS 10000

void statsBegin() {
    memset(&stats, 0, sizeof(stats));
    prefs.begin("mostikator", false);
    stats.seen   = prefs.getUInt("seen", 0);
    stats.shots  = prefs.getUInt("shots", 0);
    stats.hits   = prefs.getUInt("hits", 0);
    stats.misses = prefs.getUInt("misses", 0);
    Log.printf("[STATS] seen=%lu shots=%lu hits=%lu misses=%lu\n",
                  (unsigned long)stats.seen, (unsigned long)stats.shots,
                  (unsigned long)stats.hits, (unsigned long)stats.misses);
}

Stats statsGet() { return stats; }

static void markDirty() {
    if (!dirty) dirtySince = millis();
    dirty = true;
}

void statsTargetSeen() {
    stats.seen++;
    markDirty();
}

void statsShot(bool hit, uint16_t targetId) {
    stats.shots++;
    if (hit) stats.hits++; else stats.misses++;
    stats.lastShotMs = millis();
    stats.lastTargetId = targetId;
    strncpy(stats.lastResult, hit ? "hit" : "miss", sizeof(stats.lastResult) - 1);
    markDirty();
}

void statsFired(uint16_t targetId) {
    stats.shots++;
    stats.lastShotMs = millis();
    stats.lastTargetId = targetId;
    stats.lastResult[0] = 0;
    markDirty();
}

void statsOutcome(bool hit) {
    if (hit) stats.hits++; else stats.misses++;
    strncpy(stats.lastResult, hit ? "hit" : "miss", sizeof(stats.lastResult) - 1);
    markDirty();
}

void statsReset() {
    memset(&stats, 0, sizeof(stats));
    markDirty();
    dirtySince = 0;   // flush immediately
}

void statsLoop() {
    if (!dirty) return;
    if (millis() - dirtySince < STATS_FLUSH_MS && dirtySince != 0) return;
    prefs.putUInt("seen", stats.seen);
    prefs.putUInt("shots", stats.shots);
    prefs.putUInt("hits", stats.hits);
    prefs.putUInt("misses", stats.misses);
    dirty = false;
}
