import { getTideData } from "./signalkService";

const toTwoDigits = (value) => value.toString().padStart(2, "0");

/**
 * Fetch tide data from SignalK (signalk-tides plugin)
 */
export const fetchTideData = async () => {
    try {
        const signalkData = await getTideData();
        
        if (signalkData && signalkData.heightNow !== null) {
            const now = new Date();
            const nowTime = `${toTwoDigits(now.getHours())}:${toTwoDigits(now.getMinutes())}`;
            
            const timeHighDisplay = signalkData.timeHigh ? new Date(signalkData.timeHigh).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : null;
            const timeLowDisplay = signalkData.timeLow ? new Date(signalkData.timeLow).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : null;
            
            let isRising = false;
            if (signalkData.timeHigh && signalkData.timeLow) {
                const nextHighTime = new Date(signalkData.timeHigh);
                const nextLowTime = new Date(signalkData.timeLow);
                isRising = nextHighTime < nextLowTime;
            } else if (signalkData.timeHigh) {
                isRising = true;
            } else if (signalkData.timeLow) {
                isRising = false;
            }
            
            return {
                nowTime,
                isRising,
                heightNow: signalkData.heightNow,
                heightHigh: signalkData.heightHigh,
                heightLow: signalkData.heightLow,
                timeHigh: signalkData.timeHigh,
                timeLow: signalkData.timeLow,
                timeHighDisplay,
                timeLowDisplay,
                coeffNow: null,
                stationName: signalkData.stationName,
                source: "signalk"
            };
        }
        
        return null;
    } catch (error) {
        console.error("[TideService] Failed to fetch tide data from SignalK:", error.message);
        return null;
    }
};
