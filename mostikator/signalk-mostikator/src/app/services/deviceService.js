/**
 * Device service – REST + WebSocket access to the ESP32-P4 detection node.
 *
 * The same webapp is served from two places; the API base URL adapts:
 *   - TARGET=signalk (default): https://<signalk>/signalk-mostikator/device/*  (plugin proxy)
 *   - TARGET=esp              : http://<esp>/api/*                              (served by the device)
 *   - npm run dev             : NEXT_PUBLIC_DEVICE_URL/api/*
 */

const TARGET = process.env.NEXT_PUBLIC_TARGET || "signalk";
const DEV_DEVICE_URL = process.env.NEXT_PUBLIC_DEVICE_URL || "http://192.168.1.90";

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
            throw new Error(`Device error ${response.status}${detail ? ` – ${detail}` : ""}`);
        }
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
};

const post = (path, params = {}) =>
    request(path, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params).toString()
    });

export const getStatus  = () => request("/status");
export const getTargets = () => request("/targets");
export const getStats   = () => request("/stats");
export const getConfig  = () => request("/config");
export const arm        = () => post("/arm");
export const disarm     = () => post("/disarm");
export const resetStats = () => post("/stats/reset");
export const reportShot = (targetId, hit) => post("/shot", { target: targetId ?? 0, result: hit ? "hit" : "miss" });
export const saveConfig = (params) => post("/config", params);
export const resetConfig = () => post("/config", { reset: 1 });

export const getStreamUrl  = () => `${getDeviceBaseUrl()}/stream`;
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
