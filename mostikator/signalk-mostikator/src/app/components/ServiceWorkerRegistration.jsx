"use client";

import { useEffect } from "react";

/**
 * Registers the service worker with the right base path for both hosts
 * (SignalK: /signalk-mostikator, ESP32: /).
 */
export default function ServiceWorkerRegistration() {
    useEffect(() => {
        if (!("serviceWorker" in navigator)) return;
        if (process.env.NODE_ENV !== "production") return;
        const basePath = process.env.NEXT_PUBLIC_TARGET === "esp" ? "" : "/signalk-mostikator";
        navigator.serviceWorker
            .register(`${basePath}/sw.js`, { scope: `${basePath}/` })
            .catch((error) => console.log("Service Worker registration failed:", error));
    }, []);

    return null;
}
