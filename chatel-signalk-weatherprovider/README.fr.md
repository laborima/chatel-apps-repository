[![License](https://img.shields.io/badge/License-Apache%202.0-brightgreen.svg)](https://opensource.org/licenses/Apache-2.0)
[![SignalK](https://img.shields.io/badge/SignalK-plugin-blue.svg)](https://signalk.org/)
[![Node.js](https://img.shields.io/badge/Node.js-plugin-green.svg)](https://nodejs.org/)

🌍 *[English](README.md)*

# SignalK Meteo La Rochelle Provider

Plugin SignalK qui scrape les donnees meteo temps reel depuis [meteolarochelle.fr](https://www.meteolarochelle.fr) (station Chatelaillon) et les publie dans SignalK.

## Donnees publiees

| Path SignalK | Description |
|---|---|
| `environment.wind.speedTrueGround` | Vitesse du vent (m/s) |
| `environment.wind.angleTrueGround` | Direction du vent (rad) |
| `environment.wind.gustTrueGround` | Rafales (m/s) |
| `environment.outside.temperature` | Temperature (K) |
| `environment.outside.pressure` | Pression (Pa) |
| `environment.outside.relativeHumidity` | Humidite relative (ratio) |
| `navigation.position` | Position du vessel (Chatelaillon-Plage) |

## Installation

Copier le dossier dans le repertoire des plugins SignalK :

```bash
cp -r chatel-signalk-weatherprovider/ ~/.signalk/node_modules/signalk-meteolarochelle-provider/
```

Ou utiliser le script de deploiement :

```bash
./deploy-signalk.sh --weather
```

## Configuration

Le plugin se configure via l'interface SignalK (Admin UI > Server > Plugin Config) :

| Parametre | Defaut | Description |
|---|---|---|
| `refreshRate` | 60 | Intervalle de rafraichissement (secondes) |
| `stationName` | Meteo La Rochelle | Nom de la station |
| `latitude` | 46.062 | Latitude du vessel |
| `longitude` | -1.095 | Longitude du vessel |

## Source de donnees

Les donnees proviennent du fichier `clientraw.txt` de la station meteolarochelle.fr (format Weather Display).

## Script de deploiement

Le fichier `deploy-signalk.sh` deploie l'ensemble des plugins et webapps sur le serveur SignalK distant via SSH :

```bash
./deploy-signalk.sh              # Deploie tout
./deploy-signalk.sh --planner    # chatel-meteo-planner uniquement
./deploy-signalk.sh --weather    # Ce plugin uniquement
./deploy-signalk.sh --tides      # signalk-tides uniquement
./deploy-signalk.sh --poi-lab    # POI Laboratory uniquement
./deploy-signalk.sh --no-restart # Sans redemarrage SignalK
./deploy-signalk.sh --host IP    # Specifier l'hote distant
```

Les identifiants SSH sont charges depuis `.env` (voir `.env.example`).

## Fichiers

| Fichier | Description |
|---|---|
| `index.js` | Plugin principal (scraping + publication SignalK) |
| `meteoService_locale.js` | Service meteo local (reference) |
| `deploy-signalk.sh` | Script de deploiement SSH |
| `signalk-data/` | Donnees de test SignalK (sample NMEA, settings) |

## Licence

Apache-2.0
