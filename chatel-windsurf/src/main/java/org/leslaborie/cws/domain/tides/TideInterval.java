package org.leslaborie.cws.domain.tides;

import java.util.Date;

import org.leslaborie.cws.domain.Range;

public class TideInterval {

	private TideInfo tideInfo;


	private Date startDate;
	private Date endDate;
	private Range tideRange;

	public TideInfo getTideInfo() {
		return tideInfo;
	}

	public void setTideInfo(TideInfo tideInfo) {
		this.tideInfo = tideInfo;
	}

	public Date getStartDate() {
		return startDate;
	}

	public void setStartDate(Date startDate) {
		this.startDate = startDate;
	}

	public Date getEndDate() {
		return endDate;
	}

	public void setEndDate(Date endDate) {
		this.endDate = endDate;
	}

	public Range getTideRange() {
		return tideRange;
	}

	public void setTideRange(Range tideRange) {
		this.tideRange = tideRange;
	}

	public Long getDuration() {
		return (endDate.getTime() - startDate.getTime())/(1000*60*60);
	}
	
	@Override
	public String toString() {
		return "TideInterval [tideInfo=" + tideInfo + ", startDate=" + startDate + ", endDate=" + endDate + ", tideRange=" + tideRange + "]";
	}

	@Override
	public int hashCode() {
		final int prime = 31;
		int result = 1;
		result = prime * result + ((endDate == null) ? 0 : endDate.hashCode());
		result = prime * result + ((startDate == null) ? 0 : startDate.hashCode());
		result = prime * result + ((tideInfo == null) ? 0 : tideInfo.hashCode());
		result = prime * result + ((tideRange == null) ? 0 : tideRange.hashCode());
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
		TideInterval other = (TideInterval) obj;
		if (endDate == null) {
			if (other.endDate != null)
				return false;
		} else if (!endDate.equals(other.endDate))
			return false;
		if (startDate == null) {
			if (other.startDate != null)
				return false;
		} else if (!startDate.equals(other.startDate))
			return false;
		if (tideInfo == null) {
			if (other.tideInfo != null)
				return false;
		} else if (!tideInfo.equals(other.tideInfo))
			return false;
		if (tideRange == null) {
			if (other.tideRange != null)
				return false;
		} else if (!tideRange.equals(other.tideRange))
			return false;
		return true;
	}
	
	

}
