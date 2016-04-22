package org.leslaborie.cws.service.impl;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.leslaborie.cws.domain.ActivitySpecification;
import org.leslaborie.cws.domain.WeatherDependentActivity;
import org.leslaborie.cws.domain.WeatherForecast;
import org.leslaborie.cws.domain.owm.Forecast;
import org.leslaborie.cws.domain.owm.ForecastWheatherData;
import org.leslaborie.cws.domain.tides.TideInterval;
import org.leslaborie.cws.service.CWSActivitySpecService;
import org.leslaborie.cws.service.CWSService;
import org.leslaborie.cws.service.TideService;
import org.leslaborie.cws.service.WeatherService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class CWSServiceImpl implements CWSService {

	private static Log logger = LogFactory.getLog(CWSServiceImpl.class);

	private final static Pattern dayPattern = Pattern.compile("day([0-9])");

	private final static Integer FORECAST_TIME_INTERVAL = 3;
	
	@Autowired
	WeatherService weatherService;

	@Autowired
	TideService tideService;

	@Autowired
	CWSActivitySpecService activitySpecService;

	
	@Override
	public List<WeatherForecast> getForecasts(String day) {

		ForecastWheatherData fwData = weatherService.forecastWeatherAtCity("chatelaillon-plage,FR");

		List<WeatherForecast> ret = new LinkedList<>();
		for (Forecast forecast : fwData.getForecasts()) {
			if (isInCurrentDay(forecast.getDt(), day)) {
				WeatherForecast forecatsWeather = new WeatherForecast(forecast);
				ret.add(forecatsWeather);
			}
		}
		
		return ret;
	}	
	
	@Override
	public List<WeatherDependentActivity> getActivities(String day) {

		List<WeatherDependentActivity> ret = new LinkedList<>();
		List<ActivitySpecification> specs = activitySpecService.getActivitySpecifications();
		ForecastWheatherData fwData = weatherService.forecastWeatherAtCity("chatelaillon-plage,FR");


		
		Map<ActivitySpecification, List<Forecast>> forecastsByActivities = new HashMap<>();
		for (ActivitySpecification spec : specs) {
			for (Forecast forecast : fwData.getForecasts()) {
				if (isInCurrentDay(forecast.getDt(), day)) {

						// Check Temperature
						if (spec.getTemperatureRange() != null
								&& (!spec.getTemperatureRange().isInRange(forecast.getMain().getTempMin()) || !spec.getTemperatureRange().isInRange(
										forecast.getMain().getTempMax()))) {
							logger.info("forecast doesn't match temp : " + forecast.getMain().getTemp());
							break;
						}
						// Check Wind
						if (spec.getWindRange() != null && (!spec.getWindRange().isInRange(convertToKmPerHour(forecast.getWind().getSpeed())))) {
							logger.info("Forecast doesn't match wind : " + convertToKmPerHour(forecast.getWind().getSpeed()));
							break;
						}
	
						List<Forecast> forecasts = forecastsByActivities.get(spec);
						if (forecasts == null) {
							forecasts = new LinkedList<>();
							forecastsByActivities.put(spec, forecasts);
						}
						forecasts.add(forecast);
					}
			}
		}

		// Merge contiguous forecasts
		List<WeatherDependentActivity> tempActivities = new ArrayList<>();
		for (Map.Entry<ActivitySpecification, List<Forecast>> entry : forecastsByActivities.entrySet()) {

			// dt is unix UTC
			
			WeatherDependentActivity activity = null;
			for (Forecast forecast : entry.getValue()) {
				Calendar tmp = Calendar.getInstance();
				tmp.setTimeInMillis(forecast.getDt() * 1000L);
				logger.debug("Forecast start :"+ tmp.getTime());
				if (activity == null || activity.getEndDate().getTime() != tmp.getTimeInMillis()) {
					activity = new WeatherDependentActivity(entry.getKey());	
					activity.setStartDate(tmp.getTime());
					tempActivities.add(activity);
				} else {
					logger.debug("Merging forecast");

					// TODO SHOULD also merged forecast
				}
				tmp.add(Calendar.HOUR, FORECAST_TIME_INTERVAL);
				logger.debug("Forecast end :"+ tmp.getTime());
				activity.setEndDate(tmp.getTime());
				
			}

		}

		
		// Check tides
		for (WeatherDependentActivity activity : tempActivities) {

			TideInterval tideInterval = tideService.getTideInterval(activity.getStartDate(), activity.getEndDate(), activity.getActivity()
						.getTideRange(), "la-rochelle-pallice");
				if (tideInterval != null && tideInterval.getDuration() >= activity.getActivity().getMinimalDuration()) {
					activity.setStartDate(tideInterval.getStartDate());
					activity.setEndDate(tideInterval.getEndDate());
					activity.setTideInfo(tideInterval.getTideInfo());
					ret.add(activity);
				} else {
					logger.info("Not in tide range: "+activity.getActivity().getName());
				}
			
		}
		
		
		//Get the closest forecast
		for (WeatherDependentActivity activity : ret) {
			Forecast tmp = null;
			Long dt = null;
			for (Forecast forecast : forecastsByActivities.get(activity.getActivity())) {
				if (dt == null || dt > Math.abs(forecast.getDt() * 1000L - activity.getStartDate().getTime())) {
					tmp = forecast;
					dt = Math.abs(forecast.getDt() * 1000L - activity.getStartDate().getTime());
				}
			}
			activity.setForecast(tmp);
		}

		return ret;
	}

	
	private boolean isInCurrentDay(Integer dt, String day) {

		Matcher m = dayPattern.matcher(day);

		if (m.matches()) {
			Calendar now = Calendar.getInstance();
			now.add(Calendar.DAY_OF_YEAR, Integer.parseInt(m.group(1)));
			Calendar dtTime = Calendar.getInstance();
			dtTime.setTimeInMillis(dt * 1000L);
			return dtTime.get(Calendar.DAY_OF_YEAR) == now.get(Calendar.DAY_OF_YEAR)
					&& dtTime.get(Calendar.HOUR_OF_DAY) >= 8 && dtTime.get(Calendar.HOUR_OF_DAY) < 20;
		}

		return false;
	}

	private Double convertToKmPerHour(Double speed) {
		if (speed != null) {
			return speed * 3600 / 1000;
		}
		return null;
	}

	@Override
	public WeatherDependentActivity getCurrentWeather() {
		// TODO Auto-generated method stub
		return null;
	}

}
