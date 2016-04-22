package org.leslaborie.cws.web;

import java.util.List;

import org.leslaborie.cws.domain.WeatherDependentActivity;
import org.leslaborie.cws.domain.WeatherForecast;
import org.leslaborie.cws.service.CWSService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value="/service")
public class CWSRestController {
	
	@Autowired
	CWSService cwsService;

	@RequestMapping(value="/activities", method=RequestMethod.GET)
	public List<WeatherDependentActivity> getActivities(@RequestParam("d") String day){
		return cwsService.getActivities(day);
	}
	
	@RequestMapping(value="/forecasts", method=RequestMethod.GET)
	public List<WeatherForecast> getForecasts(@RequestParam("d") String day){
		return cwsService.getForecasts(day);
	}
	
	@RequestMapping(value="/current", method=RequestMethod.GET)
	public WeatherDependentActivity getCurrentWeather(){
		return cwsService.getCurrentWeather();
	}
	
}
