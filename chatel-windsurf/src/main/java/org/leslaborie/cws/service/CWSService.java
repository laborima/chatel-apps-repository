package org.leslaborie.cws.service;

import java.util.List;

import org.leslaborie.cws.domain.WeatherDependentActivity;
import org.leslaborie.cws.domain.WeatherForecast;

public interface CWSService {

	List<WeatherDependentActivity> getActivities(String day);

	WeatherDependentActivity getCurrentWeather();

	List<WeatherForecast> getForecasts(String day);

}
