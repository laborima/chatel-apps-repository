package org.leslaborie.cws.service;

import java.util.List;

import org.leslaborie.cws.domain.WeatherDependentActivity;

public interface CWSService {

	List<WeatherDependentActivity> getActivities(String day);

	WeatherDependentActivity getCurrentWeather();

}
