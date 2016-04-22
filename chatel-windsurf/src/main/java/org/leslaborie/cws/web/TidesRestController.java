package org.leslaborie.cws.web;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.leslaborie.cws.domain.tides.Tide;
import org.leslaborie.cws.service.TideService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value="/tides")
public class TidesRestController {
	
	private final static Pattern dayPattern = Pattern.compile("day([0-9])");
	
	@Autowired
	TideService tideService;

	@RequestMapping(value="/forecasts", method=RequestMethod.GET)
	public List<Tide> getTidesAtDay(@RequestParam("d") String day){
		
		
		Matcher m = dayPattern.matcher(day);

		if (m.matches()) {
			Calendar now = Calendar.getInstance();
			now.add(Calendar.DAY_OF_YEAR, Integer.parseInt(m.group(1)));
			return tideService.getDayTides("la-rochelle-pallice", now.getTime());
		}
		
		return new ArrayList<>();
	}

	
	
	@RequestMapping(value="/current", method=RequestMethod.GET)
	public List<Tide> getCurrentTides(){
		return tideService.getDayTides("la-rochelle-pallice", new Date());
	}
	
	@RequestMapping(value="/height", method=RequestMethod.GET)
	public Double getCurrentWaterHeight(){
		return tideService.getWaterHeightAtDateTime("la-rochelle-pallice", new Date());
	}
	
}
