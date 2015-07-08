package org.leslaborie.cws.service.impl;

import java.util.List;

import org.leslaborie.cws.domain.WeatherDependentActivity;
import org.leslaborie.cws.service.CWSService;
import org.leslaborie.cws.service.TideService;
import org.leslaborie.cws.service.WeatherService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class CWSServiceImpl implements CWSService {

	@Autowired
	WeatherService weatherService;
	
	@Autowired
	TideService tideService;
	
	/**
	 * {
 name :"windsurf-1"
 sail: "sail-1"
 board: "120L"
 duration:2h,
 min-wind: 3bft,
 max-wind: 5bft,
 min-tide: 3m,
 max-tide: -1,
 min-temperature: 17°,
 max-temperature: -1,
 min-water-temp: 15°
 max-water-temp:-1
 allow-rain:true
},

{
 name :"piaf"
 duration:3h,
 min-wind: 3bft,
 max-wind: 5bft,
 min-tide: 3m,
 max-tide: -1,
 min-temperature: 17°,
 max-temperature: -1,
 min-water-temp: 15°
 max-water-temp:-1
 allow-rain:true
}

	 * 
	 */
	
	
	@Override
	public List<WeatherDependentActivity> getActivities(String day) {
		// TODO Auto-generated method stub
		return null;
	}

	@Override
	public WeatherDependentActivity getCurrentWeather() {
		// TODO Auto-generated method stub
		return null;
	}

}
