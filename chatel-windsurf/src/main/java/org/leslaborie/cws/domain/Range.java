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

	@Override
	public int hashCode() {
		final int prime = 31;
		int result = 1;
		result = prime * result + ((max == null) ? 0 : max.hashCode());
		result = prime * result + ((min == null) ? 0 : min.hashCode());
		return result;
	}

	@Override
	public boolean equals(Object obj) {
		if (this == obj)
			return true;
		if (obj == null)
			return false;
		if (getClass() != obj.getClass())
			return false;
		Range other = (Range) obj;
		if (max == null) {
			if (other.max != null)
				return false;
		} else if (!max.equals(other.max))
			return false;
		if (min == null) {
			if (other.min != null)
				return false;
		} else if (!min.equals(other.min))
			return false;
		return true;
	}

	@Override
	public String toString() {
		return "Range [min=" + min + ", max=" + max + "]";
	}
	
	
	
}
