package org.leslaborie.cws.web;

import java.util.List;

import org.leslaborie.cws.domain.WeatherDependentActivity;
import org.leslaborie.cws.service.CWSService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value="/service")
public class CWSRestController {
	
	@Autowired
	CWSService cwsService;

	@RequestMapping(value="/{day}/activities", method=RequestMethod.GET)
	public List<WeatherDependentActivity> getActivities(@PathVariable String day){
		return cwsService.getActivities(day);
	}
	
	@RequestMapping(value="/current", method=RequestMethod.GET)
	public WeatherDependentActivity getCurrentWeather(){
		return cwsService.getCurrentWeather();
	}
	
}
