package org.leslaborie.cws.domain;

public class Range {

	public static Long UNLIMITED = -1L;
	
	private Double min;
	private Double max;
	
	
	public Range(Double min, Double max) {
		super();
		this.min = min;
		this.max = max;
	}
	
	public Double getMin() {
		return min;
	}
	public void setMin(Double min) {
		this.min = min;
	}
	public Double getMax() {
		return max;
	}
	public void setMax(Double max) {
		this.max = max;
	}
	
	public boolean isInRange(Double value){
		return value!=null && (UNLIMITED.equals(min) || value>=min) &&   (UNLIMITED.equals(max) || value<=max);
	}
	
}
