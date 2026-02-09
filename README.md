[![License](https://img.shields.io/badge/License-Apache%202.0-brightgreen.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub Issues](https://img.shields.io/github/issues/laborima/chatel-apps-repository.svg)](https://github.com/laborima/chatel-apps-repository/issues)
[![Contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](https://github.com/laborima/chatel-apps-repository)
[![SignalK](https://img.shields.io/badge/SignalK-integrated-blue.svg)](https://signalk.org/)

🌍 *[Français](README.fr.md)*

# Chatel Apps Repository

Applications and tools for Chatelaillon-Plage, built around [SignalK](https://signalk.org/).

## Projects

| Project | Description | Stack |
|---------|-------------|-------|
| [chatel-meteo-planner](chatel-meteo-planner/) | Weather & water sports activity planner | Next.js 16, React 19, Tailwind CSS 4 |
| [chatel-signalk-weatherprovider](chatel-signalk-weatherprovider/) | SignalK plugin — real-time weather data from meteolarochelle.fr | Node.js, SignalK plugin |
| [signalk-esp-pond-sensor](signalk-esp-pond-sensor/) | ESP32 pond monitoring sensor + POI Laboratory webapp | Arduino/C++, Next.js 16 |

## Architecture

```text
chatel-apps-repository/
├── chatel-meteo-planner/              # SignalK webapp — weather planner
├── chatel-signalk-weatherprovider/    # SignalK plugin — weather provider
├── signalk-esp-pond-sensor/
│   ├── signalk_esp_pond_sensor/       # ESP32 firmware (Arduino)
│   └── signalk-poi-lab/              # SignalK webapp — pond monitoring
├── resources/                         # Resources and mockups
└── SPECS.md                           # Functional specifications
```

## SignalK Integration

All applications integrate into a [SignalK](https://signalk.org/) server:

- **chatel-meteo-planner** — SignalK webapp, consumes weather and tide data
- **chatel-signalk-weatherprovider** — server plugin, scrapes meteolarochelle.fr and publishes to SignalK
- **signalk-poi-lab** — SignalK webapp, displays ESP32 sensor data
- **signalk_esp_pond_sensor** — ESP32 sensor, publishes via MQTT to SignalK

## Deployment

The script `chatel-signalk-weatherprovider/deploy-signalk.sh` deploys all plugins and webapps to the remote SignalK server.

```bash
cd chatel-signalk-weatherprovider
./deploy-signalk.sh              # Deploy all
./deploy-signalk.sh --planner    # Deploy planner only
./deploy-signalk.sh --weather    # Deploy weather provider only
./deploy-signalk.sh --poi-lab    # Deploy POI Laboratory only
```

The planner is also deployed on GitHub Pages: <https://laborima.github.io/chatel-apps-repository>

## License

Apache-2.0