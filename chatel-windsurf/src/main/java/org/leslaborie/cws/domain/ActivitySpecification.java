package org.leslaborie.cws.domain;


/**
 * {
name :"windsurf-1"
sail: "sail-1"
board: "120L"
duration:2h,
min-wind: 3bft,
max-wind: 5bft,
min-tide: 3m,
max-tide: -1,
min-temperature: 17°,
max-temperature: -1,
min-water-temp: 15°
max-water-temp:-1
allow-rain:true
}*/
/*{
	 name :"piaf"
	 duration:3h,
	 min-wind: 3bft,
	 max-wind: 5bft,
	 min-tide: 3m,
	 max-tide: -1,
	 min-temperature: 17°,
	 max-temperature: -1,
	 min-water-temp: 15°
	 max-water-temp:-1
	 allow-rain:true
	}
*/
public class ActivitySpecification {

	private String name;
	private Integer minimalDuration = 2; //Default 2 hours
	
	//weather
	private Range windRange;
	private Range windDirectionRange;
	private Range temperatureRange;
	private Range precipitationRange;
	private Range cloudRange;
	
	//Water weather
	private Range tideRange;
	private Range waterTemperatureRange;
	
	
	
	
	public ActivitySpecification(String name) {
		super();
		this.name = name;
	}

	public String getName() {
		return name;
	}
	
	public void setName(String name) {
		this.name = name;
	}
	
	public Integer getMinimalDuration() {
		return minimalDuration;
	}
	
	public void setMinimalDuration(Integer minimalDuration) {
		this.minimalDuration = minimalDuration;
	}
	
	public Range getWindRange() {
		return windRange;
	}
	
	public void setWindRange(Range windRange) {
		this.windRange = windRange;
	}
	
	public Range getWindDirectionRange() {
		return windDirectionRange;
	}
	
	public void setWindDirectionRange(Range windDirectionRange) {
		this.windDirectionRange = windDirectionRange;
	}
	
	public Range getTemperatureRange() {
		return temperatureRange;
	}
	
	public void setTemperatureRange(Range temperatureRange) {
		this.temperatureRange = temperatureRange;
	}
	
	public Range getPrecipitationRange() {
		return precipitationRange;
	}
	
	public void setPrecipitationRange(Range precipitationRange) {
		this.precipitationRange = precipitationRange;
	}
	
	public Range getCloudRange() {
		return cloudRange;
	}
	
	public void setCloudRange(Range cloudRange) {
		this.cloudRange = cloudRange;
	}
	
	public Range getTideRange() {
		return tideRange;
	}
	
	public void setTideRange(Range tideRange) {
		this.tideRange = tideRange;
	}
	
	public Range getWaterTemperatureRange() {
		return waterTemperatureRange;
	}
	
	public void setWaterTemperatureRange(Range waterTemperatureRange) {
		this.waterTemperatureRange = waterTemperatureRange;
	}
	
	
}
