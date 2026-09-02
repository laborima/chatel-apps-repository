"use client";

import useMostikator from "./hooks/useMostikator";
import ConnectionStatus from "./components/ConnectionStatus";
import StatsCard from "./components/StatsCard";
import VideoCard from "./components/VideoCard";
import TargetList from "./components/TargetList";
import EventLog from "./components/EventLog";
import DetectorControls from "./components/DetectorControls";

export default function Home() {
    const mk = useMostikator();
    const armed = !!mk.status?.detector?.armed;

    return (
        <div className="mk-backdrop min-h-screen">
            <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
                <header className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="./icons/icon-192x192.png" alt="Mostikator" className="h-14 w-14 rounded-xl border border-mk-border" />
                        <div>
                            <h1 className="mk-title text-3xl sm:text-4xl">Mostikator</h1>
                            <p className="text-mk-muted mt-1 text-sm">
                                Le moustique a tort. <span className="mk-laser-text">L&apos;Empire contre-attaque.</span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <ConnectionStatus
                            deviceOnline={mk.deviceOnline}
                            liveConnected={mk.liveConnected}
                            liveSource={mk.liveSource}
                            lastUpdate={mk.lastUpdate}
                        />
                        <button onClick={mk.refresh} disabled={mk.loading} className="mk-btn text-xs" title="Actualiser">
                            <svg className={`w-4 h-4 ${mk.loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>
                </header>

                {mk.error && (
                    <div className="mb-6 rounded-xl border border-mk-alert/40 bg-mk-alert/10 p-4 flex items-center gap-3">
                        <span className="text-2xl">⚠️</span>
                        <div>
                            <p className="font-medium">Liaison détecteur</p>
                            <p className="text-sm text-mk-muted">{mk.error}</p>
                        </div>
                    </div>
                )}

                <div className="mb-6">
                    <StatsCard stats={mk.stats} onReset={mk.resetStats} />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
                    <div className="xl:col-span-2">
                        <VideoCard
                            status={mk.status}
                            config={mk.config}
                            targets={mk.targets}
                            armed={armed}
                            onArm={mk.arm}
                            onDisarm={mk.disarm}
                        />
                    </div>
                    <div className="flex flex-col gap-6">
                        <TargetList targets={mk.targets} onShot={mk.reportShot} disabled={!mk.deviceOnline} />
                        <EventLog events={mk.events} />
                    </div>
                </div>

                <div className="mb-6">
                    <DetectorControls
                        config={mk.config}
                        onSave={mk.saveConfig}
                        onReset={mk.resetConfig}
                        disabled={!mk.deviceOnline}
                    />
                </div>

                <footer className="text-center text-mk-muted text-xs py-8 border-t border-mk-border mk-mono">
                    <p>
                        {mk.status?.device ? `${mk.status.device} · ${mk.status.ip} · RSSI ${mk.status.wifi_rssi} dBm · up ${Math.floor((mk.status.uptime || 0) / 60)} min` : "Mostikator"}
                    </p>
                    <p className="mt-1">ESP32-P4 · OV5647 · SignalK</p>
                </footer>
            </div>
        </div>
    );
}
