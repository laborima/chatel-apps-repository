package org.leslaborie.cws.web;

import java.util.Date;
import java.util.List;

import org.leslaborie.cws.domain.tides.Tide;
import org.leslaborie.cws.service.TideService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(value="/tides")
public class TidesRestController {
	
	@Autowired
	TideService tideService;

	@RequestMapping(value="/current", method=RequestMethod.GET)
	public List<Tide> getCurrentTides(){
		return tideService.getDayTides("la-rochelle-pallice", new Date());
	}
	
	@RequestMapping(value="/height", method=RequestMethod.GET)
	public Double getCurrentWaterHeight(){
		return tideService.getWaterHeightAtDateTime("la-rochelle-pallice", new Date());
	}
	
}
