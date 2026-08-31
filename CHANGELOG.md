# Changelog

## [0.4.0] - 2026-08-31

### chatel-meteo-planner

- **[Bug]** Fix tide frozen since 2026-07-29 — read the extremes from the SignalK
  Resources API (`/signalk/v2/api/resources/tides`, recomputed on each request)
  instead of the `environment.tide.*` delta paths, which the server keeps serving
  even when the plugin no longer refreshes them
- **[Bug]** Discard `environment.tide.*` extremes older than 24 h instead of
  displaying them as current
- **[Bug]** Fix 5-day tide forecast — interpolate over the real extremes instead
  of repeating a single half-cycle with a frozen amplitude, which ignored the
  spring/neap cycle (the range at Chatelaillon swings from ~2.5 m to ~5 m)
- **[Bug]** Fix tide phase being computed once and reused for the whole 5-day
  planning
- **[Bug]** Fix school-holiday availability never matching — the check was
  hard-coded to a `2024_2025` calendar key
- **[Bug]** Fix `weekdays: "unavailable"` being ignored in profile availability
- **[Bug]** Honour the `school_holidays` profile key (the code only read
  `school_holidays_zone_b`)
- **[Bug]** Fix activity windows being inflated by 3 h and merged across 3 h gaps
- **[Bug]** Fix tide curve clipping — scale on the plotted range, not on the next
  high/low
- **[Feature]** Graded session scoring — wind-fit curve, gust-factor penalty,
  tide-margin penalty and tidal-coefficient handling, so slots inside the
  acceptable band are ranked instead of all scoring 100
- **[Feature]** Drop activity windows shorter than the session's `duration_min`
- **[Feature]** Display the tidal coefficient
- **[Feature]** PWA installable as a real app on iPhone — add the legacy
  `apple-mobile-web-app-capable` meta (Next 16 only emits the modern
  `mobile-web-app-capable`, which iOS ignores), fix `start_url`/`scope` trailing
  slash, add `viewport-fit=cover`, drop `maximum-scale`
- **[Feature]** Service worker now caches the shell and works offline (it
  previously deleted every cache and had no fetch handler)
- **[Setup]** Update the school calendar to Zone A (academie de Bordeaux, the
  actual zone for Chatelaillon) for 2025-2026 and 2026-2027, and public holidays
  to 2026-2027 — source data.education.gouv.fr / calendrier.api.gouv.fr
- **[Setup]** Anna is available weekends and school holidays only, all day
- **[Setup]** Matthieu can still sail in the evening during school holidays,
  from 18:00 until sunset
- **[Feature]** Availability rules accept a time window on every kind of day, and
  a `"18:00-sunset"` form bounded by the actual sunset of that day. Exactly one
  rule applies: days off first (weekend, then public holiday), then school
  holidays, then ordinary weekdays
- **[Setup]** Paddle restricted to wind under 8 knots and forbidden in an easterly
  (offshore) wind
- **[Feature]** New activity "Peche a pied" — tidal coefficient 80+, within one
  hour either side of low water
- **[Feature]** New rule types in the scoring engine: `wind_direction_forbidden`
  (hard exclusion by wind sector), `coefficient_min`/`coefficient_max` (hard gate
  on the tidal coefficient) and `tide_window` (window around a tide extreme,
  which a height threshold cannot express — the same height occurs twice a cycle)

### signalk-tides (fork)

- **[Bug]** Fix the forecast being fetched once at startup and never refreshed —
  `updateForecast()` only ran on `navigation.position` deltas, which never arrive
  on a fixed installation with no GPS. The forecast is now refreshed on its own
  schedule, and whenever the cached extremes run out
- **[Bug]** Fix tide height interpolation using time-of-day only — it discarded
  the date and used the server timezone, so it broke across midnight (the height
  stayed pinned at the low for hours). Replaced by harmonic interpolation on
  absolute timestamps
- **[Bug]** Clear the update intervals on `stop()` so restarting the plugin no
  longer stacks timers
- **[Feature]** Expose the French tidal coefficient on high waters

### chatel-watch

- **[Feature]** Tide tile redrawn as a full-circle background — the curve now runs
  edge to edge, with a radial vignette so the centre text stays readable, and it
  uses the real extremes (true spring/neap amplitudes) instead of extrapolating
  one half-cycle
- **[Feature]** Tide tile shows the tidal coefficient
- **[Feature]** Larger type on the wind tile — the speed is the one thing you read
  at a glance from the beach
- **[Feature]** Wind tile dims the ring of any activity that is out of its
  conditions, and the legend lists only the ones that are on. Feasibility is
  judged on wind and tide alone — no daylight, no weather, no calendar: the tile
  describes the water, not anyone's availability
- **[Feature]** Watch-face complications for tide and real-time wind in knots
  (SHORT_TEXT, LONG_TEXT and RANGED_VALUE)
- **[Feature]** Shared single-flight cache — several complications on one face
  cost a single network call; the tide is recomputed locally from cached extremes,
  so it needs the network only about twice a day
- **[Feature]** Tide read from the Resources API, with the same staleness guard
  as the web app

### Infrastructure

- **[Setup]** SignalK server upgraded 2.20.3 -> 2.31.1, Docker image refreshed
  (Node 22 -> 24). Volume backed up and rollback image tagged before the upgrade

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
