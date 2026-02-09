# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-01-23

### Added

- Build and deploy script for SignalK plugins (`deploy-signalk.sh`)
- Support for deploying chatel-meteo-planner as SignalK webapp
- Support for deploying signalk-tides plugin
- Author and license metadata in package.json

### Changed

- Updated description to be more descriptive

## [1.0.0] - Initial Release

### Added

- Initial implementation of Meteo La Rochelle weather provider
- Fetches weather data from meteolarochelle.fr clientraw.txt
- Provides SignalK paths:
  - `environment.wind.speedTrueGround` - Wind speed in m/s
  - `environment.wind.angleTrueGround` - Wind direction in radians
  - `environment.wind.gustTrueGround` - Wind gust in m/s
  - `environment.outside.temperature` - Temperature in Kelvin
  - `environment.outside.pressure` - Pressure in Pascals
  - `environment.outside.humidity` - Humidity ratio (0-1)
- Configurable refresh rate
- Supports both Weather Provider API and legacy delta updates
