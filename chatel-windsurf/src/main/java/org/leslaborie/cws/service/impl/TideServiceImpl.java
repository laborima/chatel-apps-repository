package org.leslaborie.cws.service.impl;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.leslaborie.cws.domain.Range;
import org.leslaborie.cws.domain.tides.Tide;
import org.leslaborie.cws.domain.tides.TideInfo;
import org.leslaborie.cws.domain.tides.TideInterval;
import org.leslaborie.cws.service.TideService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Service
public class TideServiceImpl implements TideService {

	private static Log logger = LogFactory.getLog(TideServiceImpl.class);
	// http://www.meteofrance.com/mf3-rpc-portlet/rest/maree/la-rochelle-pallice/20151001/METROPOLE

	@Value("${tide.api.endpoint}")
	private String tideEndPoint;

	@Override
	public List<Tide> getDayTides(String cityId, Date date) {

		SimpleDateFormat dateFormat = new SimpleDateFormat("yyyyMMdd");

		logger.info("Calling endpoint : " + tideEndPoint);

		RestTemplate restTemplate = new RestTemplate();
		Map<String, String> vars = new HashMap<>();
		vars.put("city", cityId);
		vars.put("date", dateFormat.format(date));
		vars.put("endpoint", tideEndPoint);

		return Arrays.asList(restTemplate.getForObject("{endpoint}/{city}/{date}/METROPOLE", Tide[].class, vars));
	}

	@Override
	public Double getWaterHeightAtDateTime(String cityId, Date date) {
		try {
			List<Tide> tides = getDayTides(cityId, date);
			// 201510011947
			SimpleDateFormat dateFormat = new SimpleDateFormat("yyyyMMddHHmm");

			Tide currentHightTide = null;
			Long dt = null;
			Long du = null;
			Double ma = null;
			for (Tide tide : tides) {
				Date tideDate = dateFormat.parse(tide.getTime());
				if (tide.getHigh()) {

					if ((dt == null) || (dt > Math.abs(date.getTime() - tideDate.getTime()))) {
						currentHightTide = tide;
						logger.info("Time delta:" + date.toString() + " " + tideDate.toString());

						dt = Math.abs(date.getTime() - tideDate.getTime()) / 1000;
						du = null;
					}
				} else if (du == null) {
					Date tmp = dateFormat.parse(currentHightTide.getTime());
					ma = currentHightTide.getHeight() - tide.getHeight();
					du = (tmp.getTime() - tideDate.getTime()) / 1000;
				}

			}

			// On cherche la marée haute la plus proche

			// DT delta temps
			// DH delta hauteur
			// DU durée marrée

			Double dh = ma * Math.pow(Math.sin((90 * du) / dt), 2);

			if (logger.isInfoEnabled()) {
				logger.info("Nearest hight tide: " + currentHightTide.toString());
				logger.info("Time delta:" + dt);
				logger.info("Marnage:" + ma);
				logger.info("Tide duration:" + du);
				logger.info("Height delta:" + dh);
			}

			return currentHightTide.getHeight() - dh;

		} catch (ParseException e) {
			logger.error(e, e);
		}
		return 0d;
	}

	@Override
	public TideInterval getTideInterval(Date startDate, Date endDate, Range tideRange, String cityId) {

		TideInterval tideInterval = null;
		try {
			List<Tide> tides = getDayTides(cityId, startDate);
			SimpleDateFormat dateFormat = new SimpleDateFormat("yyyyMMddHHmm");

			Tide hightTide = null;
			Tide lowTide = null;
			Long dt = null;

			for (Tide tide : tides) {
				Date tideDate = dateFormat.parse(tide.getTime());
				if (tide.getHigh()) {
					if ((dt == null) || (dt > Math.abs(startDate.getTime() - tideDate.getTime()))) {
						hightTide = tide;
					}
				}
			}

			for (Tide tide : tides) {
				Date tideDate = dateFormat.parse(tide.getTime());
				if (!tide.getHigh()) {
					if ((dt == null) || (dt > Math.abs(startDate.getTime() - tideDate.getTime()))) {
						lowTide = tide;
					}
				}
			}

			Double ma = hightTide.getHeight() - lowTide.getHeight();
			Double du = 0d;// lowTide.getTime() - hightTide.getTime();

			TideInfo infos = new TideInfo(hightTide);
			infos.setHighTime(dateFormat.parse(hightTide.getTime()));
			infos.setLowTime(dateFormat.parse(lowTide.getTime()));

			// On cherche la marée haute la plus proche

			// DT delta temps
			// DH delta hauteur
			// DU durée marrée

			Double dh = ma * Math.pow(Math.sin((90 * du) / dt), 2);

			if (logger.isInfoEnabled()) {
				logger.info("Nearest hight tide: " + hightTide.toString());
				logger.info("Time delta:" + dt);
				logger.info("Marnage:" + ma);
				logger.info("Tide duration:" + du);
				logger.info("Height delta:" + dh);
			}

		} catch (ParseException e) {
			logger.error(e, e);
		}
		return tideInterval;
	}

}
