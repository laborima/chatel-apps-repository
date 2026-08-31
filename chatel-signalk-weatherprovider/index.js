const fetch = require('node-fetch');

const CLIENTRAW_URL = "https://www.meteolarochelle.fr/wdlchatel/clientraw.txt";

// Default position: Châtelaillon-Plage
const DEFAULT_LATITUDE = 46.06226032691301;
const DEFAULT_LONGITUDE = -1.0947554170040406;

module.exports = function(app) {
  let plugin = {};
  let timer = null;

  plugin.id = 'signalk-meteolarochelle-provider';
  plugin.name = 'Meteo La Rochelle Weather Provider';
  plugin.description = 'Scrapes weather data from meteolarochelle.fr';

  plugin.start = function(options) {
    app.debug('Meteo La Rochelle Provider started');

    // Set vessel position to Châtelaillon-Plage
    const latitude = options.latitude || DEFAULT_LATITUDE;
    const longitude = options.longitude || DEFAULT_LONGITUDE;
    
    app.handleMessage(plugin.id, {
      updates: [{
        values: [
          { path: 'navigation.position', value: { latitude, longitude } }
        ]
      }]
    });
    app.debug(`Position set to ${latitude}, ${longitude}`);

    const provider = {
      name: 'meteolarochelle',
      methods: {
        getObservations: () => fetchWeather(options),
        getForecasts: () => Promise.resolve([]),
        getWarnings: () => Promise.resolve([])
      }
    };

    if (app.registerWeatherProvider) {
      app.registerWeatherProvider(provider);
    }

    // Always push data periodically via deltas (works with all SK servers)
    const pushWeatherData = () => {
      fetchWeather(options).then(observations => {
        if (observations && observations.length > 0) {
          const updates = observations.map(obs => ({
            path: obs.path,
            value: obs.value
          }));
          
          app.handleMessage(plugin.id, {
            updates: [{
              values: updates
            }]
          });
          app.debug(`Pushed ${observations.length} weather observations`);
        }
      }).catch(err => app.error(`Error fetching weather: ${err.message}`));
    };

    // Fetch immediately on start
    pushWeatherData();

    // Then fetch periodically
    timer = setInterval(pushWeatherData, (options.refreshRate || 60) * 1000);
  };

  plugin.stop = function() {
    if (timer) {
      clearInterval(timer);
    }
    app.debug('Meteo La Rochelle Provider stopped');
  };

  plugin.schema = {
    type: 'object',
    properties: {
      refreshRate: {
        type: 'number',
        title: 'Refresh Rate (seconds)',
        default: 60
      },
      stationName: {
        type: 'string',
        title: 'Station Name',
        default: 'Meteo La Rochelle'
      },
      latitude: {
        type: 'number',
        title: 'Latitude',
        description: 'Default vessel latitude (Châtelaillon-Plage)',
        default: 46.06226032691301
      },
      longitude: {
        type: 'number',
        title: 'Longitude',
        description: 'Default vessel longitude (Châtelaillon-Plage)',
        default: -1.0947554170040406
      }
    }
  };

  async function fetchWeather(options) {
    try {
      const response = await fetch(CLIENTRAW_URL, {
        headers: { "User-Agent": "signalk-meteolarochelle/1.0" }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      const clientraw = text.trim().split(' ');

      if (clientraw[0] !== '12345') {
         throw new Error('Invalid clientraw.txt format');
      }

      // Champs clientraw.txt (spec Weather Display) :
      // 1: vent moyen (nœuds)
      // 2: rafale courante / vent instantané (nœuds)
      // 3: direction (deg)
      // 4: température (C)
      // 5: humidité (%)
      // 6: pression (hPa)
      // 71: rafale max du jour (nœuds) — le "max atteint" de l'anémomètre
      // NB: l'index 140 utilisé auparavant pour la rafale duplique en
      // réalité le vent courant, d'où rafale == vent dans les affichages.

      const windKnots = parseFloat(clientraw[1]);
      const gustKnots = parseFloat(clientraw[2]);
      const directionDeg = parseInt(clientraw[3], 10);
      const tempC = parseFloat(clientraw[4]);
      const humidity = parseInt(clientraw[5], 10);
      const pressureHpa = parseFloat(clientraw[6]);
      const maxGustTodayKnots = parseFloat(clientraw[71]);

      // Conversions
      const KNOTS_TO_MS = 0.514444;

      const windSpeedMs = windKnots * KNOTS_TO_MS;
      const gustMs = gustKnots * KNOTS_TO_MS;
      const maxGustTodayMs = maxGustTodayKnots * KNOTS_TO_MS;
      const tempK = tempC + 273.15;
      const pressurePa = pressureHpa * 100;
      const humidityRatio = humidity / 100;
      const directionRad = directionDeg * (Math.PI / 180);

      const observations = [];

      if (!isNaN(windSpeedMs)) {
        observations.push({ path: 'environment.wind.speedOverGround', value: windSpeedMs });
      }
      if (!isNaN(directionRad)) {
        observations.push({ path: 'environment.wind.directionTrue', value: directionRad });
      }
      if (!isNaN(gustMs)) {
        observations.push({ path: 'environment.wind.gustOverGround', value: gustMs });
      }
      if (!isNaN(maxGustTodayMs)) {
        observations.push({ path: 'environment.wind.maxGustToday', value: maxGustTodayMs });
      }
      if (!isNaN(tempK)) {
        observations.push({ path: 'environment.outside.temperature', value: tempK });
      }
      if (!isNaN(pressurePa)) {
        observations.push({ path: 'environment.outside.pressure', value: pressurePa });
      }
      if (!isNaN(humidityRatio)) {
        observations.push({ path: 'environment.outside.relativeHumidity', value: humidityRatio });
      }
      
      return observations;

    } catch (error) {
      app.error(`Error fetching weather: ${error.message}`);
      return [];
    }
  }

  return plugin;
};
