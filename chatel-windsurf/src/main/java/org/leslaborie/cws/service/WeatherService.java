package org.leslaborie.cws.service;

import org.leslaborie.cws.domain.owm.CurrentWheatherData;
import org.leslaborie.cws.domain.owm.ForecastWheatherData;

public interface WeatherService {

	 CurrentWheatherData currentWeatherAtCity(String cityId);
	 
	 ForecastWheatherData forecastWeatherAtCity(String cityId);

}
