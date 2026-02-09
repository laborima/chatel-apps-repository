[![License](https://img.shields.io/badge/License-Apache%202.0-brightgreen.svg)](https://opensource.org/licenses/Apache-2.0)
[![SignalK](https://img.shields.io/badge/SignalK-plugin-blue.svg)](https://signalk.org/)
[![Node.js](https://img.shields.io/badge/Node.js-plugin-green.svg)](https://nodejs.org/)

🌍 *[Français](README.fr.md)*

# SignalK Meteo La Rochelle Provider

SignalK plugin that scrapes real-time weather data from [meteolarochelle.fr](https://www.meteolarochelle.fr) (Chatelaillon station) and publishes it to SignalK.

## Published Data

| SignalK Path | Description |
|---|---|
| `environment.wind.speedTrueGround` | Wind speed (m/s) |
| `environment.wind.angleTrueGround` | Wind direction (rad) |
| `environment.wind.gustTrueGround` | Gusts (m/s) |
| `environment.outside.temperature` | Temperature (K) |
| `environment.outside.pressure` | Pressure (Pa) |
| `environment.outside.relativeHumidity` | Relative humidity (ratio) |
| `navigation.position` | Vessel position (Chatelaillon-Plage) |

## Installation

Copy the folder to the SignalK plugins directory:

```bash
cp -r chatel-signalk-weatherprovider/ ~/.signalk/node_modules/signalk-meteolarochelle-provider/
```

Or use the deploy script:

```bash
./deploy-signalk.sh --weather
```

## Configuration

The plugin is configured via the SignalK interface (Admin UI > Server > Plugin Config):

| Parameter | Default | Description |
|---|---|---|
| `refreshRate` | 60 | Refresh interval (seconds) |
| `stationName` | Meteo La Rochelle | Station name |
| `latitude` | 46.062 | Vessel latitude |
| `longitude` | -1.095 | Vessel longitude |

## Data Source

Data comes from the `clientraw.txt` file of the meteolarochelle.fr station (Weather Display format).

## Deploy Script

The `deploy-signalk.sh` script deploys all plugins and webapps to the remote SignalK server via SSH:

```bash
./deploy-signalk.sh              # Deploy all
./deploy-signalk.sh --planner    # chatel-meteo-planner only
./deploy-signalk.sh --weather    # This plugin only
./deploy-signalk.sh --tides      # signalk-tides only
./deploy-signalk.sh --poi-lab    # POI Laboratory only
./deploy-signalk.sh --no-restart # Skip SignalK restart
./deploy-signalk.sh --host IP    # Specify remote host
```

SSH credentials are loaded from `.env` (see `.env.example`).

## Files

| File | Description |
|---|---|
| `index.js` | Main plugin (scraping + SignalK publishing) |
| `meteoService_locale.js` | Local weather service (reference) |
| `deploy-signalk.sh` | SSH deploy script |
| `signalk-data/` | SignalK test data (sample NMEA, settings) |

## License

Apache-2.0
