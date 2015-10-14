package org.leslaborie.cws.service.impl;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Calendar;
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
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Service
public class TideServiceImpl implements TideService {

	private static Log logger = LogFactory.getLog(TideServiceImpl.class);
	// http://www.meteofrance.com/mf3-rpc-portlet/rest/maree/la-rochelle-pallice/20151001/METROPOLE

	@Value("${tide.api.endpoint}")
	private String tideEndPoint;

	@Override
	@Cacheable("tides")
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
	
	/**
	 * 
	 * Méthode sinusoïdale
	La méthode harmonique est utilisée pour les ports rattachés, car aucune courbe type n'est délivrée pour ces derniers. On assimile la variation de la hauteur d'eau dans le temps à une sinusoïde. La hauteur d'eau à une heure donnée ou, l'heure à laquelle la hauteur d'eau est atteinte, s'obtient par l'utilisation d'une des deux formules ci-dessous.

	La première approximation effectuée pour modéliser l'onde de marée de façon simple est la considération de celle-ci comme étant sinusoïdale. Voici les formules de la méthode dite harmonique :

	\Delta H = ma * sin^2((90* Delta t)/Du)

	\Delta t =  Du / 90 * arcsin( sqrt ({Delta H}/{ma}))

	avec :

	    \Delta H : variation de hauteur par rapport au point de repère choisi
	    ma : marnage de la marée concernée
	    \Delta t : temps écoulé depuis le point de repère choisi
	    Du : durée de la marée
	    

	*/

	@Override
	public TideInterval getTideInterval(Date startDate, Date endDate, Range tideRange, String cityId) {

		TideInterval tideInterval = new TideInterval();
		tideInterval.setStartDate(startDate);
		tideInterval.setEndDate(endDate);
		try {
			List<Tide> tides = getDayTides(cityId, startDate);
			logger.info(tides.toString());
			
			SimpleDateFormat dateFormat = new SimpleDateFormat("yyyyMMddHHmm");

			Tide hightTide = null;
			Tide lowTide = null;
			Double dt = null;

			for (Tide tide : tides) {
				Date tideDate = dateFormat.parse(tide.getTime());
				if (tide.getHigh()) {
					if ( startDate.getTime() < tideDate.getTime() 
							&& (dt == null ||   dt >  (tideDate.getTime() - startDate.getTime()))) {
						hightTide = tide;
						dt = (double) (tideDate.getTime() - startDate.getTime());
					}
				} 
			}

			dt = null;
			for (Tide tide : tides) {
				Date tideDate = dateFormat.parse(tide.getTime());
				if (!tide.getHigh()) {
					if ( startDate.getTime() < tideDate.getTime() 
							&& (dt == null ||   dt >  (tideDate.getTime() - startDate.getTime()))) {
						lowTide = tide;
						dt = (double) (tideDate.getTime() - startDate.getTime());
					}
				} 
			}

			
			TideInfo infos = new TideInfo(hightTide);
			infos.setHighTime(dateFormat.parse(hightTide.getTime()));
			infos.setLowTime(dateFormat.parse(lowTide.getTime()));

			tideInterval.setTideInfo(infos);

			//if(tideRange!=null){
				
				Double ma = hightTide.getHeight() - lowTide.getHeight();
				Double du = (double) Math.abs(infos.getHighTime().getTime()  - infos.getLowTime().getTime())*2; // *2 aprxo attention pas bon 
	
				if (logger.isInfoEnabled()) {
					logger.info("Nearest hight tide: " + infos.getHighTime().toString());
					logger.info("Nearest low tide: " + infos.getLowTime().toString());
					logger.info("Marnage:" + ma +"m ");
					logger.info("Tide duration:" + (du/(1000*60*60)));
				}
				
				Calendar tmp = Calendar.getInstance();
				tmp.setTime(startDate);
				
				String log = "";
				
				while(tmp.getTimeInMillis()< endDate.getTime() ){
					
					dt = (double) (tmp.getTimeInMillis() - infos.getHighTime().getTime())  ;
					Double dh = ma * Math.pow(Math.sin((90 * dt) / du), 2);
					
					log+= "\n"+ dh+" "+(dt/du)+" "+tmp.getTime().toString();
					
					tmp.add(Calendar.MINUTE, 10);
				}
			
				
				System.out.println(log.replaceAll("\\.", ","));
				
				
			
				// On cherche la marée haute la plus proche
	
				// DT delta temps
				// DH delta hauteur
				// DU durée marrée
	
				
	
				
			
			//}

		} catch (ParseException e) {
			logger.error(e, e);
		}
		return tideInterval;
	}

}
