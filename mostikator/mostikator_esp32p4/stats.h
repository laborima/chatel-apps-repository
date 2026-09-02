#pragma once
#include <Arduino.h>

/**
 * Hunt statistics: mosquitoes seen, shots, hits, misses.
 * Persisted in NVS (debounced) so they survive a reboot.
 */
struct Stats {
    uint32_t seen;
    uint32_t shots;
    uint32_t hits;
    uint32_t misses;
    uint32_t lastShotMs;
    uint16_t lastTargetId;
    char     lastResult[8];   // "hit" | "miss" | ""
};

void  statsBegin();
Stats statsGet();
void  statsTargetSeen();
void  statsShot(bool hit, uint16_t targetId);
void  statsReset();
void  statsLoop();   // flushes to NVS when dirty
