package org.leslaborie.cws.service.impl;

import java.util.Arrays;
import java.util.List;

import org.leslaborie.cws.domain.ActivitySpecification;
import org.leslaborie.cws.domain.Range;
import org.leslaborie.cws.service.CWSActivitySpecService;
import org.springframework.stereotype.Service;

@Service
public class CWSActivitySpecServiceImpl implements CWSActivitySpecService {

	@Override
	public List<ActivitySpecification> getActivitySpecifications() {
		
		ActivitySpecification windsurf1 = new ActivitySpecification("windsurf-neilpryde6_9-taboo115");
		windsurf1.setWindRange(new Range(19d,31d)); //19 --> 31 km/h  
		
		ActivitySpecification windsurf2 = new ActivitySpecification("windsurf-northsails5_7-taboo115");
		windsurf1.setWindRange(new Range(24d,41d)); //24 --> 41 km/h  
		
		ActivitySpecification windsurf3 = new ActivitySpecification("windsurf-neilpryde5_8-speedsail");
		windsurf1.setWindRange(new Range(24d,41d)); //24 --> 41 km/h  
		
		ActivitySpecification piaf = new ActivitySpecification("boat-piaf");
		windsurf1.setWindRange(new Range(19d,31d)); //19 --> 31 km/h  
		
		
		ActivitySpecification beachcombing1 = new ActivitySpecification("fishing-landingnet");
		ActivitySpecification beachcombing2 = new ActivitySpecification("fishing-clam");
				
		
		return Arrays.asList(windsurf1,windsurf2,windsurf3,piaf,beachcombing1,beachcombing2);
	}

}
