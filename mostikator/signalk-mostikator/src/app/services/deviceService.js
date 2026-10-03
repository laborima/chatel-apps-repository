/**
 * Device service – REST + WebSocket access to the ESP32-P4 detection node.
 *
 * The same webapp is served from two places; the API base URL adapts:
 *   - TARGET=signalk (default): https://<signalk>/signalk-mostikator/device/*  (plugin proxy)
 *   - TARGET=esp              : http://<esp>/api/*                              (served by the device)
 *   - npm run dev             : NEXT_PUBLIC_DEVICE_URL/api/*
 */

const TARGET = process.env.NEXT_PUBLIC_TARGET || "signalk";
const DEV_DEVICE_URL = process.env.NEXT_PUBLIC_DEVICE_URL || "http://mostikator-p4-01.local";

export const isEspHosted = () => TARGET === "esp";
export const isDev = () => process.env.NODE_ENV !== "production";

export const getDeviceBaseUrl = () => {
    if (typeof window === "undefined") return "";
    if (isDev()) return `${DEV_DEVICE_URL}/api`;
    if (isEspHosted()) return `${window.location.origin}/api`;
    return `${window.location.origin}/signalk-mostikator/device`;
};

/**
 * The device WebSocket (port ws_port from /status) is only reachable
 * directly when the page is served by the device itself (or in dev).
 * Behind SignalK/HTTPS the events come from the SignalK stream instead.
 */
export const canUseDeviceWebSocket = () => isDev() || isEspHosted();

export const getDeviceWsUrl = (wsPort = 82) => {
    if (typeof window === "undefined") return null;
    const base = isDev() ? new URL(DEV_DEVICE_URL) : window.location;
    return `ws://${base.hostname}:${wsPort}/`;
};

/* ---------- control password ----------
 * Commands (arm, sound, settings, shots) need the device CONTROL_PASSWORD in the X-Mostikator-Key header.
 * Asked once on the first refused command, then remembered by this browser. Reading never needs it. */
const KEY_STORAGE = "mostikator.controlKey";

export const getControlKey = () => {
    try { return window.localStorage.getItem(KEY_STORAGE) || ""; } catch { return ""; }
};
export const setControlKey = (key) => {
    try {
        if (key) window.localStorage.setItem(KEY_STORAGE, key);
        else window.localStorage.removeItem(KEY_STORAGE);
    } catch { /* private mode: asked again next time */ }
    window.dispatchEvent(new Event("mostikator-auth"));
};
export const hasControlKey = () => !!getControlKey();

/** Asks for the password, checks it on the device and keeps it. Returns true when accepted. */
export const login = async () => {
    const key = window.prompt("Mot de passe de contrôle du Mostikator");
    if (!key) return false;
    const response = await fetch(`${getDeviceBaseUrl()}/auth`, { headers: { "X-Mostikator-Key": key }, cache: "no-store" });
    if (!response.ok) {
        window.alert(response.status === 429 ? "Trop d'essais, réessayez dans une minute." : "Mot de passe refusé.");
        return false;
    }
    setControlKey(key);
    return true;
};
export const logout = () => setControlKey("");

const request = async (path, options = {}, timeoutMs = 8000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${getDeviceBaseUrl()}${path}`, {
            signal: controller.signal,
            ...options
        });
        if (!response.ok) {
            let detail = "";
            try { detail = (await response.json()).error || ""; } catch { /* ignore */ }
            const error = new Error(`Device error ${response.status}${detail ? ` – ${detail}` : ""}`);
            error.status = response.status;
            throw error;
        }
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
};

/* Empty / undefined fields are dropped: the firmware would otherwise read "undefined" as 0.
 * A 401 asks for the control password once and replays the command. */
const post = async (path, params = {}) => {
    const send = () => request(path, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Mostikator-Key": getControlKey() },
        body: new URLSearchParams(
            Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
        ).toString()
    });
    try {
        return await send();
    } catch (err) {
        if (err.status !== 401) throw err;
        setControlKey("");
        if (!(await login())) throw new Error("Commande refusée – authentification requise");
        return send();
    }
};

export const getStatus  = () => request("/status");
export const getTargets = () => request("/targets");
export const getStats   = () => request("/stats");
export const getConfig  = () => request("/config");
export const arm        = () => post("/arm");
export const disarm     = () => post("/disarm");
export const resetStats = () => post("/stats/reset");
export const reportShot = (targetId, hit) => post("/shot", { target: targetId ?? 0, result: hit ? "hit" : "miss" });
export const saveConfig = (params) => post("/config", params);
export const getSound   = () => request("/sound");
export const setVolume  = (volume) => post("/sound", { volume });
export const testSound  = (volume) => post("/sound", volume === undefined ? { test: 1 } : { volume, test: 1 });
export const resetConfig = () => post("/config", { reset: 1 });

/** Tail of the firmware log (text/plain), same history as the telnet console. */
export const getLog = async (timeoutMs = 8000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${getDeviceBaseUrl()}/log`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`Device error ${response.status}`);
        return await response.text();
    } finally {
        clearTimeout(timer);
    }
};

export const getStreamUrl  = () => `${getDeviceBaseUrl()}/stream`;
export const getDetectorViewUrl = () => `${getDeviceBaseUrl()}/detector.bmp?t=${Date.now()}`;
export const getCaptureUrl = () => `${getDeviceBaseUrl()}/capture?t=${Date.now()}`;

/**
 * Opens the device JSON event stream with automatic reconnection.
 * Messages: status | config | stats | targets | event
 */
export const createDeviceEventSocket = (wsPort, onMessage, onState) => {
    let ws = null;
    let reconnectTimer = null;
    let closed = false;
    let delay = 1000;

    const connect = () => {
        const url = getDeviceWsUrl(wsPort);
        if (!url) return;
        try {
            ws = new WebSocket(url);
        } catch {
            scheduleReconnect();
            return;
        }
        ws.onopen = () => {
            delay = 1000;
            if (onState) onState(true);
        };
        ws.onmessage = (evt) => {
            try {
                onMessage(JSON.parse(evt.data));
            } catch (e) {
                console.warn("[Device WS] Bad message", e);
            }
        };
        ws.onerror = () => { /* onclose follows */ };
        ws.onclose = () => {
            if (onState) onState(false);
            scheduleReconnect();
        };
    };

    const scheduleReconnect = () => {
        if (closed) return;
        reconnectTimer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 15000);
    };

    connect();

    return {
        send: (text) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(text); },
        close: () => {
            closed = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (ws) ws.close();
        }
    };
};
