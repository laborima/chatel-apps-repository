const TIDE_FILE_DIRECTORY = "/tides/larochelle";
const MINUTES_PER_DAY = 24 * 60;
const RULE_OF_TWELFTHS_PATTERN = [1, 2, 3, 3, 2, 1];

const toTwoDigits = (value) => value.toString().padStart(2, "0");

const convertTimeToMinutes = (timeString) => {
    const [hours, minutes] = timeString.split(":").map(Number);
    return hours * 60 + minutes;
};

const normaliseCycleEnd = (startMinutes, endMinutes) => {
    return endMinutes >= startMinutes ? endMinutes : endMinutes + MINUTES_PER_DAY;
};

const parseRawTideEntry = (raw) => {
    const [type, time, height, coef] = raw;
    const numericHeight = typeof height === "string" ? parseFloat(height) : height;
    return {
        type,
        time,
        height: Number.isFinite(numericHeight) ? numericHeight : NaN,
        timeInMinutes: convertTimeToMinutes(time),
        coef: typeof coef === "number" ? coef : null
    };
};

const computeHeightChangeForElapsed = (elapsedMinutes, windowMinutes, tideChange) => {
    if (windowMinutes <= 0) {
        return tideChange / 2;
    }

    const minutesPerSegment = windowMinutes / RULE_OF_TWELFTHS_PATTERN.length;
    const twelfthHeight = tideChange / 12;

    let remaining = Math.max(0, Math.min(elapsedMinutes, windowMinutes));
    let accumulatedTwelfths = 0;

    for (let index = 0; index < RULE_OF_TWELFTHS_PATTERN.length && remaining > 0; index += 1) {
        const segmentMinutes = Math.min(remaining, minutesPerSegment);
        const segmentFraction = segmentMinutes / minutesPerSegment;
        accumulatedTwelfths += RULE_OF_TWELFTHS_PATTERN[index] * segmentFraction;
        remaining -= segmentMinutes;
    }

    return twelfthHeight * accumulatedTwelfths;
};

export const calculateTideHeightUsingTwelfths = (
    highTideHeight,
    lowTideHeight,
    currentTime,
    highTideTime,
    lowTideTime
) => {
    const timePattern = /^\d{1,2}:\d{2}$/;
    if (!timePattern.test(currentTime) || !timePattern.test(highTideTime) || !timePattern.test(lowTideTime)) {
        console.error("Invalid time format provided to calculateTideHeightUsingTwelfths");
        return (highTideHeight + lowTideHeight) / 2;
    }

    const highMinutes = convertTimeToMinutes(highTideTime);
    const lowMinutes = convertTimeToMinutes(lowTideTime);
    const currentMinutes = convertTimeToMinutes(currentTime);

    const risingCycle = lowMinutes <= highMinutes;
    const isWithinRising = risingCycle
        ? lowMinutes <= currentMinutes && currentMinutes <= highMinutes
        : currentMinutes <= highMinutes || currentMinutes >= lowMinutes;

    let cycleStartHeight;
    let cycleEndHeight;
    let cycleStartMinutes;
    let cycleEndMinutes;
    let isRising;

    if (isWithinRising) {
        isRising = true;
        cycleStartHeight = lowTideHeight;
        cycleEndHeight = highTideHeight;
        cycleStartMinutes = lowMinutes;
        cycleEndMinutes = normaliseCycleEnd(lowMinutes, highMinutes);
    } else {
        isRising = false;
        cycleStartHeight = highTideHeight;
        cycleEndHeight = lowTideHeight;
        cycleStartMinutes = highMinutes;
        cycleEndMinutes = normaliseCycleEnd(highMinutes, lowMinutes);
    }

    const windowMinutes = cycleEndMinutes - cycleStartMinutes;
    let elapsedMinutes = currentMinutes - cycleStartMinutes;
    if (elapsedMinutes < 0) {
        elapsedMinutes += MINUTES_PER_DAY;
    }

    const tideChange = Math.abs(cycleEndHeight - cycleStartHeight);
    if (!Number.isFinite(tideChange) || windowMinutes <= 0) {
        return (highTideHeight + lowTideHeight) / 2;
    }

    const heightChange = computeHeightChangeForElapsed(elapsedMinutes, windowMinutes, tideChange);
    return isRising ? cycleStartHeight + heightChange : cycleStartHeight - heightChange;
};

export const fetchTideData = async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = toTwoDigits(now.getMonth() + 1);
    const fileName = `${month}_${year}.json`;

    let data;

    // Server-side: read from filesystem
    if (typeof window === "undefined") {
        try {
            const [{ readFile }, path] = await Promise.all([
                import("fs/promises"),
                import("path")
            ]);

            const filePath = path.join(
                process.cwd(),
                "public",
                "tides",
                "larochelle",
                fileName
            );

            console.log("[TideService] Reading tide data from:", filePath);
            const fileContent = await readFile(filePath, "utf-8");
            data = JSON.parse(fileContent);
        } catch (error) {
            console.error("[TideService] Failed to read tide data from filesystem:", error.message);
            return null;
        }
    } else {
        // Client-side: fetch from public folder
        const filePath = `${TIDE_FILE_DIRECTORY}/${fileName}`;
        const response = await fetch(filePath);
        if (!response.ok) {
            console.warn("[TideService] No tide data found at:", filePath);
            return null;
        }
        data = await response.json();
    }

    const todayKey = now.toISOString().split("T")[0];
    const todayEntries = data?.[todayKey];

    if (!Array.isArray(todayEntries)) {
        console.warn("No tide data available for today");
        return null;
    }

    const tides = todayEntries
        .map(parseRawTideEntry)
        .filter((entry) => Number.isFinite(entry.height))
        .sort((left, right) => left.timeInMinutes - right.timeInMinutes);

    if (tides.length === 0) {
        console.warn("Unable to compute tides: empty dataset after parsing");
        return null;
    }

    const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();

    let lastTide = null;
    let nextTide = null;

    for (const tide of tides) {
        if (tide.timeInMinutes <= currentTimeInMinutes) {
            lastTide = tide;
        } else {
            nextTide = tide;
            break;
        }
    }

    if (!lastTide) {
        lastTide = tides[tides.length - 1];
    }
    if (!nextTide) {
        nextTide = tides[0];
    }

    if (!lastTide || !nextTide) {
        throw new Error("Cannot determine tide trend");
    }

    const isRising = lastTide.type === "tide.low" && nextTide.type === "tide.high";

    let closestHighTide = null;
    let closestLowTide = null;

    if (isRising) {
        closestHighTide = nextTide.type === "tide.high" ? nextTide : null;
        closestLowTide = lastTide.type === "tide.low" ? lastTide : null;
    } else {
        closestHighTide = lastTide.type === "tide.high" ? lastTide : null;
        closestLowTide = nextTide.type === "tide.low" ? nextTide : null;
    }

    if (!closestHighTide || !closestLowTide) {
        throw new Error("Tide data for today is incomplete.");
    }

    const nowTime = `${toTwoDigits(now.getHours())}:${toTwoDigits(now.getMinutes())}`;
    const heightNow = calculateTideHeightUsingTwelfths(
        closestHighTide.height,
        closestLowTide.height,
        nowTime,
        closestHighTide.time,
        closestLowTide.time
    );

    return {
        nowTime,
        isRising,
        heightNow,
        heightHigh: closestHighTide.height,
        heightLow: closestLowTide.height,
        timeHigh: closestHighTide.time,
        timeLow: closestLowTide.time,
        coeffNow: closestHighTide.coef,
        lastTide,
        nextTide,
        tides
    };
};
