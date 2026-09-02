/**
 * SignalK service – reads the paths published by the device through the
 * MQTT bridge (environment.mostikator.*) and streams them over the
 * SignalK WebSocket. Used when the dashboard is served by SignalK
 * (no direct access to the device WebSocket behind HTTPS).
 */

export const SK_BASE = "environment.mostikator.";

const getSignalKBaseUrl = () => {
    if (typeof window === "undefined") {
        return process.env.NEXT_PUBLIC_SIGNALK_URL || "http://localhost:3000";
    }
    return process.env.NEXT_PUBLIC_SIGNALK_URL || window.location.origin;
};

export const checkServerAvailability = async () => {
    try {
        const response = await fetch(`${getSignalKBaseUrl()}/signalk`, { headers: { Accept: "application/json" } });
        return response.ok;
    } catch {
        return false;
    }
};

const getNestedValue = (tree, dotPath) => {
    let node = tree;
    for (const segment of dotPath.split(".")) {
        if (node === null || node === undefined) return null;
        node = node[segment];
    }
    if (node === null || node === undefined) return null;
    return node.value !== undefined ? node.value : null;
};

/**
 * One-shot read of the mostikator subtree from the REST API.
 */
export const getMostikatorTree = async () => {
    const response = await fetch(`${getSignalKBaseUrl()}/signalk/v1/api/vessels/self`, {
        headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`SignalK API error (${response.status})`);
    const tree = await response.json();
    return {
        state: getNestedValue(tree, SK_BASE + "detector.state"),
        target: getNestedValue(tree, SK_BASE + "target"),
        stats: {
            seen: getNestedValue(tree, SK_BASE + "stats.seen"),
            shots: getNestedValue(tree, SK_BASE + "stats.shots"),
            hits: getNestedValue(tree, SK_BASE + "stats.hits"),
            misses: getNestedValue(tree, SK_BASE + "stats.misses")
        },
        rssi: getNestedValue(tree, SK_BASE + "device.rssi"),
        uptime: getNestedValue(tree, SK_BASE + "device.uptime")
    };
};

/**
 * Subscribes to environment.mostikator.* deltas.
 * onDelta receives { path (relative to SK_BASE), value, timestamp }.
 */
export const createMostikatorWebSocket = (onDelta, onState) => {
    const wsUrl = getSignalKBaseUrl().replace(/^http/, "ws") + "/signalk/v1/stream?subscribe=none";
    let ws = null;
    let reconnectTimer = null;
    let closed = false;

    const connect = () => {
        try {
            ws = new WebSocket(wsUrl);
        } catch {
            reconnectTimer = setTimeout(connect, 5000);
            return;
        }
        ws.onopen = () => {
            ws.send(JSON.stringify({
                context: "vessels.self",
                subscribe: [{ path: SK_BASE + "*", period: 100, policy: "instant" }]
            }));
            if (onState) onState(true);
        };
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (!data.updates) return;
                for (const update of data.updates) {
                    if (!update.values) continue;
                    for (const v of update.values) {
                        if (!v.path || !v.path.startsWith(SK_BASE)) continue;
                        onDelta({ path: v.path.slice(SK_BASE.length), value: v.value, timestamp: update.timestamp });
                    }
                }
            } catch (e) {
                console.warn("[SignalK WS] Parse error", e);
            }
        };
        ws.onclose = () => {
            if (onState) onState(false);
            if (!closed) reconnectTimer = setTimeout(connect, 5000);
        };
        ws.onerror = () => { /* onclose follows */ };
    };

    connect();

    return {
        close: () => {
            closed = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (ws) ws.close();
        }
    };
};
