package org.leslaborie.cws.domain;


/**
Beaufort 	Km/h 	Noeuds 	m/s 	descriptif
0 	0 à 1 	< 1 	0 à 0,3 	calme
1 	2 à 5 	1 à 2 	0,3 à 1,5 	Très légère brise
2 	6 à 12 	3 à 6 	1,6 à 3,3 	légère brise
3 	13 à 19 	7 à 9 	3,4 à 5,4 	Petite Brise
4 	20 à 28 	10 à 14 	5,5 à 7,9 	Jolie brise
5 	29 à 38 	15 à 20 	8 à 10,7 	Bonne brise
6 	39 à 50 	21 à 27 	10,8 à 13,8 	Vent frais
7 	51 à 61 	28 à 33 	13,9 à 17,1 	Grand frais
8 	62 à 74 	34 à 40 	17,2 à 20,7 	Coup de vent
9 	75 à 88 	41 à 47 	20,8 à 24,4 	Fort coup de vent
10 	89 à 102 	48 à 55 	24,5 à 28,5 	Tempête
11 	103 à 117 	56 à 63 	28,6 à 32,7 	Violente tempête
12 	118 à 132 	64 à 71 	32,8 à 36,7 	Ouragan
13 	> 133 	> 72 	> 36,8 	
*/
public class WeatherHelper {
	
	

    public static final int MPS = 0;
    public static final int KMPH = 1;
    public static final int MPH = 2;
    public static final int KNOTS = 3;
    // Temperature units    
    public static final int CELSIUS = 0;
    public static final int FAHRENHEIT = 1;
    public static int windSpeedUnit = KMPH;
    public static int temperatureUnit = CELSIUS;


	
	 // Factors for velocity conversion
    private final static double[] VELOCITY_FACTORS = {
        1, // m/s (reference unit)
        3.6, // km/h
        2.2369, // mph
        1.9438 // knots
    };
    // Beaufort scale bounds in km/h
    private final static double[] BEAUFORT_LIMITS = {
        1,
        5.5,
        11,
        19,
        28,
        38,
        49,
        61,
        74,
        88,
        102,
        117
    };
    // Beaufort scale descriptions (index corresponds to a Beaufort value)
    private final static String[] BEAUFORT_SCALE = {
    	"Calme",
    	"Très légère brise",
    	"légère brise",
    	"Petite Brise",
    	"Jolie brise",
    	"Bonne brise",
    	"Vent frais",
    	"Grand frais",
    	"Coup de vent",
    	"Fort coup de vent",
    	"Tempête",
    	"Violente tempête",
    	"Ouragan" 
    	};

    /**
     * Get temperature unit string
     * @param unit
     * @return Temperature unit in verbose form
     */
    public static String getTemperatureUnit(int unit) {
        switch (unit) {
            case FAHRENHEIT:
                return "Fahrenheit";
            default:
                return "Celsius";
        }
    }

    /**
     * Get wind speed unit string
     * @param unit
     * @return Wind speed unit in verbose form
     */
    public static String getWindSpeedUnit(int unit) {
        switch (unit) {
            case KMPH:
                return "km/h";
            case MPH:
                return "Mph";
            case KNOTS:
                return "Knots";
            default:
                return "m/s";
        }
    }

    /**
     * Convert velocity from one unit to another
     * @param from Unit of the passed value
     * @param to Unit of the returned value
     * @param value Value to be converted
     * @return Converted value
     */
    public static double convertVelocity(int from, int to, double value) {
        try {
            return 1 / VELOCITY_FACTORS[from] * value * VELOCITY_FACTORS[to];
        }
        catch (IndexOutOfBoundsException ioobe) {
            return Double.NaN;
        }
    }

    /**
     * Get Beaufort value
     * @param kmph Velocity in kilometers per hour
     * @return Beaufort value as integer
     */
    public static int getBeaufort(double kmph) {
        for (int i = BEAUFORT_LIMITS.length - 1; i >= 0; i--) {
            if (kmph > BEAUFORT_LIMITS[i]) {
                return i + 1;
            }
        }
        return 0;
    }

    /**
     * Get Beaufort description
     * @param kmph Velocity in kilometers per hour
     * @return Beaufort in verbose form
     */
    public static String getBeaufortDesc(double kmph) {
        int value = getBeaufort(kmph);
        return ((value >= 0 && value < BEAUFORT_SCALE.length) ? BEAUFORT_SCALE[value] : "");
    }
}
