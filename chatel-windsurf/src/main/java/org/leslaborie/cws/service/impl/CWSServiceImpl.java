package org.leslaborie.cws.service.impl;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.leslaborie.cws.domain.ActivitySpecification;
import org.leslaborie.cws.domain.Range;
import org.leslaborie.cws.domain.WeatherDependentActivity;
import org.leslaborie.cws.domain.owm.Forecast;
import org.leslaborie.cws.domain.owm.ForecastWheatherData;
import org.leslaborie.cws.domain.tides.Tide;
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

	private final static Long FORECAST_TIME_INTERVAL = 3*60*60L;
	
	@Autowired
	WeatherService weatherService;

	@Autowired
	TideService tideService;

	@Autowired
	CWSActivitySpecService activitySpecService;

	@Override
	public List<WeatherDependentActivity> getActivities(String day) {

		List<WeatherDependentActivity> ret = new LinkedList<>();
		List<ActivitySpecification> specs = activitySpecService.getActivitySpecifications();
		ForecastWheatherData fwData = weatherService.forecastWeatherAtCity("Chatelaillon-Plage");

		Map<ActivitySpecification, List<Forecast>> forecastsByActivities = new HashMap<>();
		for (ActivitySpecification spec : specs) {
			for (Forecast forecast : fwData.getForecasts()) {
				if (isInCurrentDay(forecast.getDt(), day)) {

					// Only during the day --> Need to call currentWheater
					// if(forecast.getDt() >
					// fwData.getCity().getSys().getSunrise()
					// && forecast.getDt() <
					// fwData.getCity().getSys().getSunset()){

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

			WeatherDependentActivity activity = null;
			for (Forecast forecast : entry.getValue()) {
				if (activity == null || activity.getEndDate().getTime() != forecast.getDt() * 1000L) {
					activity = new WeatherDependentActivity(entry.getKey(), forecast);
					activity.setStartDate(new Date(forecast.getDt() * 1000L));
					activity.setEndDate(new Date((forecast.getDt() + FORECAST_TIME_INTERVAL) * 1000L));
					ret.add(activity);
				} else {

					// TODO SHOULD also merged forecast
					activity.setEndDate(new Date((forecast.getDt() + FORECAST_TIME_INTERVAL) * 1000L));
				}
			}

		}

		// Check tides
		for (WeatherDependentActivity activity : tempActivities) {

			if (activity.getActivity().getTideRange() != null) {

				TideInterval tideInterval = tideService.getTideInterval(activity.getStartDate(), activity.getEndDate(), activity.getActivity()
						.getTideRange(), "la-rochelle-pallice");
				if (tideInterval != null && tideInterval.getDuration() > activity.getActivity().getMinimalDuration()) {
					activity.setStartDate(tideInterval.getStartDate());
					activity.setEndDate(tideInterval.getEndDate());
					activity.setTideInfo(tideInterval.getTideInfo());
					ret.add(activity);
				}
			} else {
				ret.add(activity);
			}
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
			return dtTime.get(Calendar.DAY_OF_YEAR) == now.get(Calendar.DAY_OF_YEAR);
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
