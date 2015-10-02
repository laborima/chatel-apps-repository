
package org.leslaborie.cws.domain.tides;

import javax.annotation.Generated;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;

@JsonInclude(JsonInclude.Include.NON_NULL)
@Generated("org.jsonschema2pojo")
@JsonPropertyOrder({
    "port",
    "time",
    "formattedTime",
    "height",
    "coef",
    "high"
})
public class Tide {

    @JsonProperty("port")
    private String port;
    @JsonProperty("time")
    private String time;
    @JsonProperty("formattedTime")
    private String formattedTime;
    @JsonProperty("height")
    private Double height;
    @JsonProperty("coef")
    private Integer coef;
    @JsonProperty("high")
    private Boolean high;

    /**
     * 
     * @return
     *     The port
     */
    @JsonProperty("port")
    public String getPort() {
        return port;
    }

    /**
     * 
     * @param port
     *     The port
     */
    @JsonProperty("port")
    public void setPort(String port) {
        this.port = port;
    }

    /**
     * 
     * @return
     *     The time
     */
    @JsonProperty("time")
    public String getTime() {
        return time;
    }

    /**
     * 
     * @param time
     *     The time
     */
    @JsonProperty("time")
    public void setTime(String time) {
        this.time = time;
    }

    /**
     * 
     * @return
     *     The formattedTime
     */
    @JsonProperty("formattedTime")
    public String getFormattedTime() {
        return formattedTime;
    }

    /**
     * 
     * @param formattedTime
     *     The formattedTime
     */
    @JsonProperty("formattedTime")
    public void setFormattedTime(String formattedTime) {
        this.formattedTime = formattedTime;
    }

    /**
     * 
     * @return
     *     The height
     */
    @JsonProperty("height")
    public Double getHeight() {
        return height;
    }

    /**
     * 
     * @param height
     *     The height
     */
    @JsonProperty("height")
    public void setHeight(Double height) {
        this.height = height;
    }

    /**
     * 
     * @return
     *     The coef
     */
    @JsonProperty("coef")
    public Integer getCoef() {
        return coef;
    }

    /**
     * 
     * @param coef
     *     The coef
     */
    @JsonProperty("coef")
    public void setCoef(Integer coef) {
        this.coef = coef;
    }

    /**
     * 
     * @return
     *     The high
     */
    @JsonProperty("high")
    public Boolean getHigh() {
        return high;
    }

    /**
     * 
     * @param high
     *     The high
     */
    @JsonProperty("high")
    public void setHigh(Boolean high) {
        this.high = high;
    }

	@Override
	public String toString() {
		return "Tide [port=" + port + ", time=" + time + ", formattedTime=" + formattedTime + ", height=" + height + ", coef=" + coef + ", high="
				+ high + "]";
	}
    
    

}
