package org.leslaborie.cws.service.impl;

import java.util.Arrays;
import java.util.List;

import org.leslaborie.cws.domain.ActivitySpecification;
import org.leslaborie.cws.domain.Range;
import org.leslaborie.cws.service.CWSActivitySpecService;
import org.springframework.stereotype.Service;

@Service
public class CWSActivitySpecServiceImpl implements CWSActivitySpecService {

	/**
	 * Batimetrie chatel
	 * Port 4.1m
	 * Cornard 1.6m
	 * Plage 2.5m
	 * 
	 * Limites : 
	 *   -> Piaf min: 5m
	 *   -> Planche min: 3.50m
	 *   -> Speedsail max: 5m
	 *   -> Palourde max : 3m 
	 */
	
	
	@Override
	public List<ActivitySpecification> getActivitySpecifications() {
		
		ActivitySpecification windsurf1 = new ActivitySpecification("windsurf-neilpryde6_9-taboo115");
		windsurf1.setWindRange(new Range(19d,31d)); //19 --> 31 km/h  
		windsurf1.setTideRange(new Range(3.50d, 6d)); //3.60 --> 6m
		windsurf1.setMinimalDuration(1);
		
		ActivitySpecification windsurf2 = new ActivitySpecification("windsurf-northsails5_7-taboo115");
		windsurf2.setWindRange(new Range(24d,41d)); //24 --> 41 km/h  
		windsurf2.setTideRange(new Range(3.50d, 6d)); //3.60 --> 6m
		windsurf2.setMinimalDuration(1);
		
		ActivitySpecification windsurf3 = new ActivitySpecification("windsurf-neilpryde5_8-speedsail");
		windsurf3.setWindRange(new Range(24d,41d)); //24 --> 41 km/h  
		windsurf3.setTideRange(new Range(0d, 5d)); //0 --> 4,98m
		
		ActivitySpecification piaf = new ActivitySpecification("boat-piaf");
		piaf.setWindRange(new Range(19d,31d)); //19 --> 31 km/h  
		piaf.setTideRange(new Range(5d,6d)); //4.98 --> 6m
		
		
		ActivitySpecification beachcombing1 = new ActivitySpecification("fishing-landingnet-clam");
		beachcombing1.setTideRange(new Range(0d,3d));
				
		
		return Arrays.asList(windsurf1,windsurf2,windsurf3,piaf,beachcombing1);
	}

}
