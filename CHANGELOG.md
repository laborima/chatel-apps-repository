# Changelog

## [0.3.0] - 2025-02-09

### chatel-meteo-planner

- **[Feature]** SignalK integration — real-time weather data via `signalk-meteolarochelle-provider` plugin
- **[Feature]** Open-Meteo API fallback (Meteo France data) — no API key required
- **[Feature]** Sunrise/sunset widget
- **[Feature]** Radar dashlet component
- **[Feature]** Precipitation amount (mm) alongside probability in forecasts
- **[Feature]** Wind compass points with the wind (flow direction)
- **[Feature]** Profile availability — working hours, holidays, school holidays Zone B
- **[Feature]** Gear matching — recommended equipment per activity and profile
- **[Feature]** Activities merged into plannerService for better cohesion
- **[Bug]** Fix suggested gear missing or empty in activity cards
- **[Bug]** Fix precipitation display when probability is missing but amount > 0
- **[Cleanup]** New PWA icons (all platforms)
- **[Cleanup]** Transparent logo for PWA, white-background logo for SignalK

### chatel-signalk-weatherprovider

- **[Feature]** Add deploy script for all SignalK plugins and webapps via SSH
- **[Feature]** Extract SSH credentials to `.env` file (no hardcoded secrets)
- **[Setup]** Add `.gitignore` and `.env.example`
- **[Setup]** Add README (EN/FR) with badges

### Repository

- **[Setup]** Add root `.gitignore` (node_modules, .next, .env, leslaborie/)
- **[Setup]** Add bilingual READMEs (EN/FR) with badges for all projects
- **[Setup]** Add CHANGELOGs
- **[Cleanup]** Remove hardcoded IPs and credentials from documentation
- **[Cleanup]** Remove unused resources/mockups

## [0.2.0] - 2025-01-15

### chatel-meteo-planner

- **[Feature]** 5-day forecast planner with activity recommendations
- **[Feature]** Tide widget with height calculation (twelfths rule)
- **[Feature]** Wind gauge and direction compass
- **[Feature]** Sailor profiles with gear preferences
- **[Feature]** Notification center for ideal conditions
- **[Feature]** PWA support with persistent profile selection
- **[Feature]** Day forecast dashlet with consistent styling
- **[Bug]** Fix basePath for GitHub Pages deployment
- **[Bug]** Fix tide and activities data fetching for GitHub Pages

## [0.1.0] - 2024-11-01

### chatel-meteo-planner

- **[Feature]** Initial release — weather dashboard for Chatelaillon-Plage
- **[Feature]** Real-time wind, temperature, webcam
- **[Feature]** Tide curves and cache
- **[Feature]** Global forecast view
- **[Setup]** GitHub Pages deployment workflow
