package org.leslaborie.cws.domain.tides;

import java.util.Date;

public class TideInfo {

	private String port;
	private Date highTime;
	private Date lowTime;
	private Integer coef;
	private Double marnage;
	private Double tideHeight;

	public TideInfo(Tide tide) {
		this.port = tide.getPort();
		this.coef = tide.getCoef();
		this.tideHeight = tide.getHeight();
	}

	public String getPort() {
		return port;
	}

	public void setPort(String port) {
		this.port = port;
	}

	public Date getHighTime() {
		return highTime;
	}

	
	public Double getMarnage() {
		return marnage;
	}

	public void setMarnage(Double marnage) {
		this.marnage = marnage;
	}
	
	
	public Double getTideHeight() {
		return tideHeight;
	}


	public Long getTideDuration(){
		return Math.abs(highTime.getTime()  - lowTime.getTime());
	}
	
	@Override
	public String toString() {
		return "TideInfo [port=" + port + ", highTime=" + highTime + ", lowTime=" + lowTime + ", coef=" + coef + "]";
	}

	@Override
	public int hashCode() {
		final int prime = 31;
		int result = 1;
		result = prime * result + ((coef == null) ? 0 : coef.hashCode());
		result = prime * result + ((highTime == null) ? 0 : highTime.hashCode());
		result = prime * result + ((lowTime == null) ? 0 : lowTime.hashCode());
		result = prime * result + ((port == null) ? 0 : port.hashCode());
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
		TideInfo other = (TideInfo) obj;
		if (coef == null) {
			if (other.coef != null)
				return false;
		} else if (!coef.equals(other.coef))
			return false;
		if (highTime == null) {
			if (other.highTime != null)
				return false;
		} else if (!highTime.equals(other.highTime))
			return false;
		if (lowTime == null) {
			if (other.lowTime != null)
				return false;
		} else if (!lowTime.equals(other.lowTime))
			return false;
		if (port == null) {
			if (other.port != null)
				return false;
		} else if (!port.equals(other.port))
			return false;
		return true;
	}

	public void setHighTime(Date highTime) {
		this.highTime = highTime;
	}

	public Date getLowTime() {
		return lowTime;
	}

	public void setLowTime(Date lowTime) {
		this.lowTime = lowTime;
	}

	public Integer getCoef() {
		return coef;
	}

	public void setCoef(Integer coef) {
		this.coef = coef;
	}

}
