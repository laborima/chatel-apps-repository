
package org.leslaborie.cws.domain.owm;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.annotation.Generated;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;

@JsonInclude(JsonInclude.Include.NON_NULL)
@Generated("org.jsonschema2pojo")
@JsonPropertyOrder({
    "city",
    "list"
})
public class ForecastWheatherData {

    @JsonProperty("city")
    private City city;
    @JsonProperty("list")
    private List<Forecast> forecasts = new ArrayList<>();
    @JsonIgnore
    private Map<String, Object> additionalProperties = new HashMap<String, Object>();


    @JsonProperty("city")
    public City getCity() {
        return city;
    }

    @JsonProperty("city")
    public void setCity(City city) {
        this.city = city;
    }

    @JsonProperty("list")
    public java.util.List<Forecast> getForecasts() {
        return forecasts;
    }

  
    @JsonProperty("list")
    public void setForecasts(List<Forecast> forecasts) {
        this.forecasts = forecasts;
    }

    @JsonAnyGetter
    public Map<String, Object> getAdditionalProperties() {
        return this.additionalProperties;
    }

    @JsonAnySetter
    public void setAdditionalProperty(String name, Object value) {
        this.additionalProperties.put(name, value);
    }

}
