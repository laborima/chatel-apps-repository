package org.leslaborie.cws.service.impl;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.leslaborie.cws.domain.tides.Tide;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Service
public class MeteoFranceRestTideService {

	private static Log logger = LogFactory.getLog(TideServiceImpl.class);

	@Value("${tide.api.endpoint}")
	private String tideEndPoint;

	@Cacheable("tides")
	public List<Tide> getDayTides(String cityId, String date) {

		logger.info("Calling endpoint : " + tideEndPoint + " at date " + date);

		RestTemplate restTemplate = new RestTemplate();
		Map<String, String> vars = new HashMap<>();
		vars.put("city", cityId);
		vars.put("date", date);
		vars.put("endpoint", tideEndPoint);

		return Arrays.asList(restTemplate.getForObject(
				"{endpoint}/{city}/{date}/METROPOLE", Tide[].class, vars));
	}

}
