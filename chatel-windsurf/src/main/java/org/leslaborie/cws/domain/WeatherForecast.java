package org.leslaborie.cws.domain;

import java.util.Calendar;
import java.util.Date;

import org.leslaborie.cws.domain.owm.Forecast;
import org.leslaborie.cws.domain.tides.TideInfo;

public class WeatherForecast {
	
	private Forecast forecast;

	private Date startDate;
	private Date endDate;

	private Double windSpeedKmPerHour;
	private Integer windSpeedBeaufort;
	private String  windSpeedBeaufordDesc;
	private Double windSpeedKnots;
	
	private TideInfo tideInfo;

	
	public TideInfo getTideInfo() {
		return tideInfo;
	}
	
	public Forecast getForecast() {
		return forecast;
	}


	public WeatherForecast(Forecast forecast) {
		this.forecast = forecast;
		
		Calendar tmp = Calendar.getInstance();
		tmp.setTimeInMillis(forecast.getDt() * 1000L);
		this.startDate = tmp.getTime();
		
		this.windSpeedKmPerHour = WeatherHelper.convertVelocity(WeatherHelper.MPS, WeatherHelper.KMPH, forecast.getWind().getSpeed());
		this.windSpeedKnots = WeatherHelper.convertVelocity(WeatherHelper.MPS, WeatherHelper.KNOTS, forecast.getWind().getSpeed());
		this.windSpeedBeaufort = WeatherHelper.getBeaufort(this.windSpeedKmPerHour);
		this.windSpeedBeaufordDesc = WeatherHelper.getBeaufortDesc(this.windSpeedKmPerHour);
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

	public Double getWindSpeedKmPerHour() {
		return windSpeedKmPerHour;
	}

	public Integer getWindSpeedBeaufort() {
		return windSpeedBeaufort;
	}

	public String getWindSpeedBeaufordDesc() {
		return windSpeedBeaufordDesc;
	}

	public Double getWindSpeedKnots() {
		return windSpeedKnots;
	}

	
}
