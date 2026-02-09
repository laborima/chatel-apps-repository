[![License](https://img.shields.io/badge/License-Apache%202.0-brightgreen.svg)](https://opensource.org/licenses/Apache-2.0)
[![SignalK](https://img.shields.io/badge/SignalK-webapp-blue.svg)](https://signalk.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC.svg)](https://tailwindcss.com/)

🌍 *[Français](README.fr.md)*

# Chatel Meteo Planner

SignalK webapp to plan water sports sessions at Chatelaillon-Plage based on weather and tides.

Deployed on GitHub Pages: <https://laborima.github.io/chatel-apps-repository>

## Features

- **Real-time dashboard** — wind, tides, temperature, webcam
- **Activity recommendations** — personalized suggestions per sailor profile
- **5-day planner** — weather forecasts and favorable time slots
- **Sailor profiles** — 5 pre-configured profiles with gear and preferences
- **Notifications** — alerts for ideal conditions
- **PWA** — installable on mobile

## Installation

```bash
npm install
npm run dev
```

No API key required. The app uses the free [Open-Meteo](https://open-meteo.com/) API (Meteo France data).

## Data Sources

**With SignalK (recommended)** — when deployed as a SignalK webapp:

- **Real-time** : `signalk-meteolarochelle-provider` plugin
- **Tides** : `signalk-tides` plugin

**Standalone mode (fallback)** — without SignalK:

- **Weather** : [Open-Meteo API](https://open-meteo.com/en/docs/meteofrance-api) (Meteo France)
- **Tides** : local JSON data
- **Webcam** : [Viewsurf - Port de Chatelaillon](https://pv.viewsurf.com/2080/Chatelaillon-Port)

## Activities

| Activity | Conditions | Tide |
|----------|-----------|------|
| Cirrus (sailboat) | Wind 5-20 kts, swell < 3m | > 1m |
| Windsurf | Wind 15-25 kts, direction SW/W/NW | > 3m |
| Wingfoil | Wind 10-20 kts, swell < 1m | > 4m |
| Speedsail | Wind > 15 kts, direction SW/W | < 3.5m |
| SUP Paddle | Wind < 10 kts, swell < 0.8m | > 4m |

## Deployment

### SignalK (recommended)

```bash
cd ../chatel-signalk-weatherprovider
./deploy-signalk.sh --planner
```

### GitHub Pages

```bash
npm run build
# Static files in out/
```

### Configuration

Optional `.env.local` file:

```bash
# SignalK server URL (empty = use page origin)
NEXT_PUBLIC_SIGNALK_URL=http://192.168.x.x:3000
```

## Stack

- **Next.js 16** (React 19) — static export
- **Tailwind CSS 4**
- **Open-Meteo API** (free, no key required)

## License

Apache-2.0
