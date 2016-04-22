package org.leslaborie.cws.service.impl;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.leslaborie.cws.domain.Range;
import org.leslaborie.cws.domain.tides.Tide;
import org.leslaborie.cws.domain.tides.TideInfo;
import org.leslaborie.cws.domain.tides.TideInterval;
import org.leslaborie.cws.service.TideService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;


/**
 * Méthode sinusoïdale La méthode harmonique est utilisée pour les ports
 * rattachés, car aucune courbe type n'est délivrée pour ces derniers. On
 * assimile la variation de la hauteur d'eau dans le temps à une sinusoïde.
 * La hauteur d'eau à une heure donnée ou, l'heure à laquelle la hauteur
 * d'eau est atteinte, s'obtient par l'utilisation d'une des deux formules
 * ci-dessous.
 * 
 * La première approximation effectuée pour modéliser l'onde de marée de
 * façon simple est la considération de celle-ci comme étant sinusoïdale.
 * Voici les formules de la méthode dite harmonique :
 * 
 * \Delta H = ma * sin^2((90* Delta t)/Du)
 * 
 * \Delta t = Du / 90 * arcsin( sqrt ({Delta H}/{ma}))
 * 
 * avec :
 * 
 * \Delta H : variation de hauteur par rapport au point de repère choisi ma
 * : marnage de la marée concernée \Delta t : temps écoulé depuis le point
 * de repère choisi Du : durée de la marée
 * 
 */
@Service
public class TideServiceImpl implements TideService {

	private static Log logger = LogFactory.getLog(TideServiceImpl.class);

	@Autowired
	MeteoFranceRestTideService mfRestTideService;
	
	@Override
	public List<Tide> getDayTides(String cityId, Date date) {

		SimpleDateFormat dateFormat = new SimpleDateFormat("yyyyMMdd");
		return mfRestTideService.getDayTides(cityId, dateFormat.format(date));
	}

	@Override
	public Double getWaterHeightAtDateTime(String cityId, Date date) {
		TideInfo tideInfo = getTideInfoAtDateTime(cityId, date);

		Long dt = (date.getTime() - tideInfo.getHighTime().getTime());
		return tideInfo.getTideHeight() - tideInfo.getMarnage() * Math.pow(Math.sin(((90 * dt) / tideInfo.getTideDuration()) * Math.PI / 180), 2);

	}
	
	@Override
	public TideInterval getTideInterval(Date startDate, Date endDate, Range tideRange, String cityId) {

		TideInterval tideInterval = new TideInterval();

		TideInfo tideInfo = getTideInfoAtDateTime(cityId, startDate);

		tideInterval.setTideInfo(tideInfo);
		
		if (tideRange != null) {

			Double ma = tideInfo.getMarnage();
			Long du = tideInfo.getTideDuration();

			if (logger.isDebugEnabled()) {
				logger.info("Nearest hight tide: " + tideInfo.getHighTime().toString());
				logger.info("Nearest low tide: " + tideInfo.getLowTime().toString());
				logger.info("Marnage:" + tideInfo.getMarnage() + "m ");
				logger.info("Tide duration:" + (du / (1000 * 60 * 60)));
			}

			Calendar tmp = Calendar.getInstance();
			tmp.setTime(startDate);

			TideInterval curInter = null;
			List<TideInterval> interList = new ArrayList<>();

			while (tmp.getTimeInMillis() < endDate.getTime()) {

				Long dt = (tmp.getTimeInMillis() - tideInfo.getHighTime().getTime());
				Double height = tideInfo.getTideHeight() - ma * Math.pow(Math.sin(((90 * dt) / du) * Math.PI / 180), 2);

				if (tideRange.isInRange(height)) {
					if (curInter == null) {
						curInter = new TideInterval();
						curInter.setStartDate(tmp.getTime());
						interList.add(curInter);
					}

					curInter.setEndDate(tmp.getTime());

					if (logger.isDebugEnabled()) {
						logger.debug("\u001B[31m" + (height) + " " + tmp.getTime().toString() + "\u001B[0m");
					}
				} else {
					curInter = null;
					if (logger.isDebugEnabled()) {
						logger.debug((height) + " " + tmp.getTime().toString());
					}
				}

				tmp.add(Calendar.MINUTE, 10);
			}

			curInter = null;
			Long maxDuration = 0L;

			for (TideInterval inter : interList) {
				if (inter.getDuration() > maxDuration) {
					curInter = inter;
					maxDuration = inter.getDuration();
				}
			}
			if (curInter != null) {
				logger.info("Inter duraction : " + curInter.getDuration());
				tideInterval.setStartDate(curInter.getStartDate());
				tideInterval.setEndDate(curInter.getEndDate());
			} else {
				return null;
			}

		} else {
			tideInterval.setStartDate(startDate);
			tideInterval.setEndDate(endDate);
		}

		return tideInterval;
	}


	private TideInfo getTideInfoAtDateTime(String cityId, Date date) {
		try {
			List<Tide> tides = getDayTides(cityId, date);

			SimpleDateFormat dateFormat = new SimpleDateFormat("yyyyMMddHHmm");

			Tide hightTide = null;
			Tide lowTide = null;
			Double dt = null;

			for (Tide tide : tides) {
				Date tideDate = dateFormat.parse(tide.getTime());
				if (tide.getHigh()) {
					if (dt == null || dt > Math.abs(tideDate.getTime() - date.getTime())) {
						hightTide = tide;
						dt = (double) Math.abs(tideDate.getTime() - date.getTime());
					}
				}
			}

			dt = null;
			for (Tide tide : tides) {
				Date tideDate = dateFormat.parse(tide.getTime());
				if (!tide.getHigh()) {
					if (dt == null || dt > Math.abs(tideDate.getTime() - date.getTime())) {
						lowTide = tide;
						dt = (double) Math.abs(tideDate.getTime() - date.getTime());
					}
				}
			}

			TideInfo tideInfo = new TideInfo(hightTide);
			tideInfo.setHighTime(dateFormat.parse(hightTide.getTime()));
			tideInfo.setLowTime(dateFormat.parse(lowTide.getTime()));
			tideInfo.setMarnage(hightTide.getHeight() - lowTide.getHeight());

			return tideInfo;
		} catch (ParseException e) {
			logger.error(e, e);
		}
		return null;

	}


}
