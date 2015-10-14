package org.leslaborie.cws;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CachingConfigurerSupport;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
@EnableCaching
public class ChatelWindsurfApplication  extends CachingConfigurerSupport{

    public static void main(String[] args) {
        SpringApplication.run(ChatelWindsurfApplication.class, args);
    }
    
    @Bean
    @Override
    public CacheManager cacheManager() {
    	//TODO move to ehcache
    	// And set eviction policy 3H to forecasts
    	
        return new ConcurrentMapCacheManager("tides", "forecasts");
    }

}
