package org.leslaborie.cws.domain;

import java.util.Date;

import org.leslaborie.cws.domain.owm.Forecast;
import org.leslaborie.cws.domain.tides.TideInfo;

public class WeatherDependentActivity {

	private ActivitySpecification activity;
	
	private Forecast forecast;

	private Date startDate;
	
	private Date endDate;

	private TideInfo tideInfo;

	
	public TideInfo getTideInfo() {
		return tideInfo;
	}
	
	public ActivitySpecification getActivity() {
		return activity;
	}

	public Forecast getForecast() {
		return forecast;
	}


	public WeatherDependentActivity(ActivitySpecification activity, Forecast forecast) {
		super();
		this.activity = activity;
		this.forecast = forecast;
	}

	public void setTideInfo(TideInfo tideInfo) {
		this.tideInfo = tideInfo;
	}

	public Date getStartDate() {
		return startDate;
	}

	public void setStartDate(Date startDate) {
		this.startDate = startDate;
	}

	public Date getEndDate() {
		return endDate;
	}

	public void setEndDate(Date endDate) {
		this.endDate = endDate;
	}

	
	
	
	
}
