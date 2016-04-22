package org.leslaborie.cws.service;

import java.util.Date;
import java.util.List;

import org.leslaborie.cws.domain.Range;
import org.leslaborie.cws.domain.tides.Tide;
import org.leslaborie.cws.domain.tides.TideInterval;

public interface TideService {

	List<Tide> getDayTides(String cityId, Date date);
	
	Double getWaterHeightAtDateTime(String cityId, Date date);

	TideInterval getTideInterval(Date startDate, Date endDate, Range tideRange, String cityId);

}
