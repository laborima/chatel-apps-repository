# Git Push Guide

This file contains the commit messages and GitHub descriptions for pushing both repos.
Delete this file before committing.

---

## 1. signalk-esp-pond-sensor (separate git repo)

### Commit message

```
[Feature] Add POI Laboratory webapp, fix sensors, restructure project

- Add signalk-poi-lab webapp (Next.js 16) — pond monitoring dashboard
  - Real-time gauges, health score, fish/plant recommendations
  - REST polling (60s), PWA support, white-background SignalK icon
- Fix water level sensor returning 0 (keep last valid reading on timeout)
- Fix TFT screen horizontal flip (rotation 1 -> 3)
- Increase ultrasonic sensor reliability (timeout 60ms, trigger 5us)
- Restructure into signalk_esp_pond_sensor/ and signalk-poi-lab/
- Add bilingual READMEs (EN/FR) with badges, CHANGELOG, .gitignore
```

### Git commands

```bash
cd signalk-esp-pond-sensor
git add -A
git commit -m "[Feature] Add POI Laboratory webapp, fix sensors, restructure project"
git push origin main
```

### GitHub project description

```
ESP32 pond monitoring sensor with TFT display and SignalK integration via MQTT. Includes POI Laboratory webapp for real-time dashboard.
```

### GitHub topics

```
signalk, esp32, arduino, mqtt, pond, aquaponics, monitoring, iot, nextjs
```

---

## 2. chatel-apps-repository (main repo)

### Commit messages (split into 2 commits for clarity)

#### Commit 1 — Planner improvements

```
[Feature] SignalK integration, weather improvements, activity planner enhancements

- Add SignalK real-time weather via signalk-meteolarochelle-provider
- Add Open-Meteo API fallback (Meteo France, no API key)
- Add sunrise/sunset widget, radar dashlet
- Add precipitation amount (mm) in forecasts
- Add profile availability (working hours, holidays, school holidays)
- Add gear matching per activity and profile
- Merge activitiesService into plannerService
- Fix wind compass direction (flow instead of source)
- Fix suggested gear missing in activity cards
- Update PWA icons for all platforms
```

#### Commit 2 — Repo setup, weatherprovider, documentation

```
[Setup] Add weatherprovider, deploy script, bilingual docs, .gitignore

- Add chatel-signalk-weatherprovider (SignalK weather plugin)
- Add deploy-signalk.sh for SSH deployment of all plugins/webapps
- Extract SSH credentials to .env (no hardcoded secrets)
- Add root .gitignore (node_modules, .next, .env, leslaborie/)
- Add bilingual READMEs (EN/FR) with badges for all projects
- Add CHANGELOGs
- Remove hardcoded IPs from documentation
- Clean up unused resources/mockups
```

### Git commands

```bash
cd chatel-apps-repository

# Commit 1 — Planner
git add chatel-meteo-planner/
git commit -m "[Feature] SignalK integration, weather improvements, activity planner enhancements"

# Commit 2 — Repo setup + weatherprovider + docs
git add -A
git commit -m "[Setup] Add weatherprovider, deploy script, bilingual docs, .gitignore"

git push origin master
```

### GitHub project description

```
SignalK applications for Chatelaillon-Plage — weather planner, meteo provider plugin, and ESP32 pond sensor integration.
```

### GitHub topics

```
signalk, weather, planner, nextjs, react, tailwindcss, chatelaillon, watersports, pwa
```

---

## GitHub About sections (Settings > General)

### chatel-apps-repository

- **Description**: `SignalK applications for Châtelaillon-Plage — weather planner, météo provider plugin, and ESP32 pond sensor integration.`
- **Website**: `https://laborima.github.io/chatel-apps-repository`
- **Topics**: `signalk` `weather` `planner` `nextjs` `react` `tailwindcss` `chatelaillon` `watersports` `pwa`

### signalk-esp-pond-sensor

- **Description**: `ESP32 pond monitoring sensor with TFT display and SignalK integration via MQTT. Includes POI Laboratory webapp for real-time dashboard.`
- **Website**: (leave empty)
- **Topics**: `signalk` `esp32` `arduino` `mqtt` `pond` `aquaponics` `monitoring` `iot` `nextjs`
