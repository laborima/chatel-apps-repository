package org.leslaborie.cws.web;

import org.leslaborie.cws.domain.owm.CurrentWheatherData;
import org.leslaborie.cws.service.WeatherService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value="/weather")
public class WeatherRestController {
	
	@Autowired
	WeatherService weatherService;

	
	@RequestMapping(value="/current", method=RequestMethod.GET)
	public CurrentWheatherData getCurrentWeather(){
		return weatherService.currentWeatherAtCity("Chatelaillon-Plage");
	}
	
}
