[![License](https://img.shields.io/badge/License-Apache%202.0-brightgreen.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub Issues](https://img.shields.io/github/issues/laborima/chatel-apps-repository.svg)](https://github.com/laborima/chatel-apps-repository/issues)
[![Contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](https://github.com/laborima/chatel-apps-repository)
[![SignalK](https://img.shields.io/badge/SignalK-integrated-blue.svg)](https://signalk.org/)

🌍 *[English](README.md)*

# Chatel Apps Repository

Applications et outils pour Chatelaillon-Plage, integres autour de [SignalK](https://signalk.org/).

## Projets

| Projet | Description | Stack |
|--------|-------------|-------|
| [chatel-meteo-planner](chatel-meteo-planner/) | Planificateur meteo et activites nautiques | Next.js 16, React 19, Tailwind CSS 4 |
| [chatel-signalk-weatherprovider](chatel-signalk-weatherprovider/) | Plugin SignalK — donnees meteo temps reel depuis meteolarochelle.fr | Node.js, SignalK plugin |
| [signalk-esp-pond-sensor](signalk-esp-pond-sensor/) | Capteur ESP32 pour monitoring de bassin + webapp POI Laboratory | Arduino/C++, Next.js 16 |

## Architecture

```text
chatel-apps-repository/
├── chatel-meteo-planner/              # Webapp SignalK — planificateur meteo
├── chatel-signalk-weatherprovider/    # Plugin SignalK — weather provider
├── signalk-esp-pond-sensor/
│   ├── signalk_esp_pond_sensor/       # Firmware ESP32 (Arduino)
│   └── signalk-poi-lab/              # Webapp SignalK — monitoring bassin
├── resources/                         # Ressources et mockups
└── SPECS.md                           # Specifications fonctionnelles
```

## Integration SignalK

Toutes les applications s'integrent dans un serveur [SignalK](https://signalk.org/) :

- **chatel-meteo-planner** — webapp SignalK, utilise les donnees meteo et marees du serveur
- **chatel-signalk-weatherprovider** — plugin serveur, scrape meteolarochelle.fr et publie les donnees dans SignalK
- **signalk-poi-lab** — webapp SignalK, affiche les donnees du capteur ESP32
- **signalk_esp_pond_sensor** — capteur ESP32, publie via MQTT vers SignalK

## Deploiement

Le script `chatel-signalk-weatherprovider/deploy-signalk.sh` deploie l'ensemble des plugins et webapps sur le serveur SignalK distant.

```bash
cd chatel-signalk-weatherprovider
./deploy-signalk.sh              # Deploie tout
./deploy-signalk.sh --planner    # Deploie uniquement le planner
./deploy-signalk.sh --weather    # Deploie uniquement le weather provider
./deploy-signalk.sh --poi-lab    # Deploie uniquement POI Laboratory
```

Le planner est egalement deploye sur GitHub Pages : <https://laborima.github.io/chatel-apps-repository>

## Licence

Apache-2.0
