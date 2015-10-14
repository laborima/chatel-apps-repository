package org.leslaborie.cws.service.impl;

import java.util.HashMap;
import java.util.Map;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.leslaborie.cws.domain.owm.CurrentWheatherData;
import org.leslaborie.cws.domain.owm.ForecastWheatherData;
import org.leslaborie.cws.service.WeatherService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
/**
 * Open weather implementation
 * @author matthieu
 *
 */
@Service
public class OwmWeatherServiceImpl implements WeatherService{

	private static Log logger = LogFactory.getLog(OwmWeatherServiceImpl.class);
	
	@Value("${weather.api.endpoint}")
	private String weatherEndPoint;
	
	@Value("${weather.api.id}")
	private String appId;
	
	
	public CurrentWheatherData currentWeatherAtCity(String cityId)  { 
		
		logger.info("Calling endpoint : "+weatherEndPoint);
		
			RestTemplate restTemplate = new RestTemplate();
			Map<String, String> vars = new HashMap<>();
			vars.put("city", cityId);
			vars.put("endpoint",weatherEndPoint);
			vars.put("appId", appId);
			CurrentWheatherData currentWeather = restTemplate.getForObject("{endpoint}/weather?q={city}&mode=json&units=metric&APPID={appId}", CurrentWheatherData.class,vars);

		return currentWeather;
	}
	

	@Cacheable("forecasts")
	public ForecastWheatherData forecastWeatherAtCity(String cityId) {
		RestTemplate restTemplate = new RestTemplate();
		Map<String, String> vars = new HashMap<>();
		vars.put("city", cityId);
		vars.put("endpoint",weatherEndPoint);
		vars.put("appId", appId);
		ForecastWheatherData forecast = restTemplate.getForObject("{endpoint}/forecast?q={city}&mode=json&units=metric&APPID={appId}", ForecastWheatherData.class,vars);
		
		return forecast;
	}
	
	
}
