"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import * as device from "../services/deviceService";
import { createMostikatorWebSocket } from "../services/signalkService";

const MAX_EVENTS = 50;
const STATUS_POLL_MS = 5000;

/**
 * Aggregates device status/config/stats (REST, polled) and the live
 * target/event stream (device WebSocket when reachable, SignalK stream
 * otherwise) into one state object with actions.
 */
export default function useMostikator() {
    const [status, setStatus] = useState(null);
    const [config, setConfig] = useState(null);
    const [stats, setStats] = useState(null);
    const [targets, setTargets] = useState([]);
    const [events, setEvents] = useState([]);
    const [deviceOnline, setDeviceOnline] = useState(false);
    const [liveConnected, setLiveConnected] = useState(false);
    const [error, setError] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [loading, setLoading] = useState(true);
    const liveSource = device.canUseDeviceWebSocket() ? "device" : "signalk";

    const wsPortRef = useRef(82);
    const socketRef = useRef(null);
    const targetTimerRef = useRef(null);

    const pushEvent = useCallback((evt) => {
        setEvents((prev) => [{ ...evt, key: `${evt.ts || Date.now()}-${Math.random()}` }, ...prev].slice(0, MAX_EVENTS));
    }, []);

    const refresh = useCallback(async () => {
        try {
            const st = await device.getStatus();
            setStatus(st);
            if (st.stats) setStats((prev) => ({ ...(prev || {}), ...st.stats }));
            if (st.ws_port) wsPortRef.current = st.ws_port;
            setDeviceOnline(true);
            setError(null);
            setLastUpdate(new Date().toISOString());
            // Targets from REST too (SignalK mode only receives the primary target)
            if (st.detector?.armed) {
                try {
                    const t = await device.getTargets();
                    if (t.targets) setTargets(t.targets);
                } catch { /* ignore */ }
            } else {
                setTargets([]);
            }
        } catch (err) {
            setDeviceOnline(false);
            setError(err.name === "AbortError" ? "Détecteur injoignable (timeout)" : err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadConfig = useCallback(async () => {
        try {
            setConfig(await device.getConfig());
        } catch { /* device offline */ }
    }, []);

    // Handles a message from the device WebSocket
    const onDeviceMessage = useCallback((msg) => {
        switch (msg.type) {
            case "status":
                setStatus(msg);
                if (msg.stats) setStats((prev) => ({ ...(prev || {}), ...msg.stats }));
                setLastUpdate(new Date().toISOString());
                break;
            case "config":
                setConfig(msg);
                break;
            case "stats":
                setStats(msg);
                break;
            case "targets":
                setTargets(msg.targets || []);
                break;
            case "event":
                pushEvent(msg);
                break;
            default:
                break;
        }
    }, [pushEvent]);

    // Handles a SignalK delta (path relative to environment.mostikator.)
    const onSignalKDelta = useCallback(({ path, value, timestamp }) => {
        const ts = timestamp ? new Date(timestamp).getTime() : Date.now();
        if (path === "target") {
            if (value && typeof value === "object") {
                setTargets((prev) => {
                    const others = prev.filter((t) => t.id !== value.id);
                    return [value, ...others].slice(0, 8);
                });
                if (targetTimerRef.current) clearTimeout(targetTimerRef.current);
                targetTimerRef.current = setTimeout(() => setTargets([]), 2000);
            } else {
                setTargets([]);
            }
        } else if (path === "event" && value && typeof value === "object") {
            pushEvent({ type: "event", ts, ...value, target_id: value.target_id ?? value.target?.id });
        } else if (path.startsWith("stats.")) {
            const key = path.slice("stats.".length);
            setStats((prev) => ({ ...(prev || {}), [key]: value }));
        } else if (path === "detector.state") {
            setStatus((prev) => (prev ? { ...prev, detector: { ...(prev.detector || {}), state: value, armed: value !== "disarmed" } } : prev));
        }
        setLastUpdate(new Date().toISOString());
    }, [pushEvent]);

    // Live stream: device WebSocket (ESP-hosted / dev) or SignalK stream
    useEffect(() => {
        if (device.canUseDeviceWebSocket()) {
            socketRef.current = device.createDeviceEventSocket(wsPortRef.current, onDeviceMessage, setLiveConnected);
        } else {
            socketRef.current = createMostikatorWebSocket(onSignalKDelta, setLiveConnected);
        }
        return () => {
            if (socketRef.current) socketRef.current.close();
            if (targetTimerRef.current) clearTimeout(targetTimerRef.current);
        };
    }, [onDeviceMessage, onSignalKDelta]);

    // REST polling
    useEffect(() => {
        const initial = setTimeout(() => { refresh(); loadConfig(); }, 0);
        const timer = setInterval(refresh, STATUS_POLL_MS);
        return () => { clearTimeout(initial); clearInterval(timer); };
    }, [refresh, loadConfig]);

    const runAction = useCallback(async (fn) => {
        try {
            const result = await fn();
            setError(null);
            return result;
        } catch (err) {
            setError(err.message);
            throw err;
        }
    }, []);

    const actions = {
        refresh,
        arm: () => runAction(async () => { const st = await device.arm(); setStatus(st); return st; }),
        disarm: () => runAction(async () => { const st = await device.disarm(); setStatus(st); setTargets([]); return st; }),
        reportShot: (targetId, hit) => runAction(async () => {
            const st = await device.reportShot(targetId, hit);
            setStats(st);
            pushEvent({ type: "event", event: "shot", ts: Date.now(), target_id: targetId, result: hit ? "hit" : "miss", local: true });
            return st;
        }),
        resetStats: () => runAction(async () => { const st = await device.resetStats(); setStats(st); return st; }),
        saveConfig: (params) => runAction(async () => { const cfg = await device.saveConfig(params); setConfig(cfg); return cfg; }),
        resetConfig: () => runAction(async () => { const cfg = await device.resetConfig(); setConfig(cfg); return cfg; })
    };

    return {
        status, config, stats, targets, events,
        deviceOnline, liveConnected, liveSource,
        error, lastUpdate, loading,
        ...actions
    };
}
