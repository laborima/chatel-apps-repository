// Sound, synthesised with WebAudio (no files): wind and water noise that follow the speed, and short effects.
// Browsers only start audio after a user gesture: call start() from a click / key / button.
const noiseBuffer = (ctx, sec = 2) => {
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
};

export const createAudio = () => {
    let ctx = null, master, windG, windF, waterG, waterF, buf, muted = false;
    const loop = (filter) => { const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true; n.connect(filter); n.start(); };
    const api = {
        get started() { return !!ctx; },
        start() {
            if (ctx) { ctx.resume?.(); return; }
            const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
            ctx = new AC(); buf = noiseBuffer(ctx);
            master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ctx.destination);
            windF = ctx.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 420; windF.Q.value = 0.7;
            windG = ctx.createGain(); windG.gain.value = 0; windF.connect(windG); windG.connect(master); loop(windF);
            waterF = ctx.createBiquadFilter(); waterF.type = 'highpass'; waterF.frequency.value = 1400;
            const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
            waterG = ctx.createGain(); waterG.gain.value = 0; waterF.connect(lp); lp.connect(waterG); waterG.connect(master); loop(waterF);
        },
        /** Leaving the game: silence everything and release the audio device. */
        stop() { if (ctx) { ctx.close?.(); ctx = null; } },
        /** Tab hidden / shown. */
        pause() { ctx?.suspend?.(); },
        resume() { ctx?.resume?.(); },
        setMuted(m) { muted = m; if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.7, ctx.currentTime, 0.05); },
        get muted() { return muted; },
        /** Every frame: wind with the apparent wind, hiss with the board speed (quiet in the air). */
        update(s) {
            if (!ctx) return; const t = ctx.currentTime;
            const v = s.speed, air = s.mode === 'air';
            windG.gain.setTargetAtTime(0.05 + Math.min(0.22, s.tws * 0.012 + v * 0.008), t, 0.3);
            windF.frequency.setTargetAtTime(320 + v * 28 + s.tws * 6, t, 0.3);
            const hiss = air ? 0 : s.fh > 0.2 ? 0.02 + v * 0.004 : Math.min(0.28, v * (s.planing ? 0.02 : 0.008));
            waterG.gain.setTargetAtTime(hiss, t, 0.08);
            waterF.frequency.setTargetAtTime(s.planing ? 1100 + v * 30 : 1800, t, 0.2);
        },
        sfx(name) {
            if (!ctx || muted) return; const t = ctx.currentTime;
            const burst = (dur, type, f0, f1, gain, q = 0.8) => {
                const n = ctx.createBufferSource(); n.buffer = buf; const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
                f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
                const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
                n.connect(f); f.connect(g); g.connect(master); n.start(t, Math.random()); n.stop(t + dur);
            };
            const tone = (freq, at, dur, gain = 0.15, type = 'sine') => {
                const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; const g = ctx.createGain();
                g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(gain, t + at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
                o.connect(g); g.connect(master); o.start(t + at); o.stop(t + at + dur + 0.02);
            };
            if (name === 'jump') burst(0.45, 'bandpass', 500, 2200, 0.35, 1.2);
            else if (name === 'land') burst(0.6, 'lowpass', 1800, 300, 0.6);
            else if (name === 'crash') { burst(1.3, 'lowpass', 2500, 200, 0.9); burst(0.5, 'bandpass', 300, 120, 0.5, 2); }
            else if (name === 'trick') { tone(660, 0, 0.12); tone(990, 0.08, 0.18); }
            else if (name === 'combo') { tone(880, 0, 0.1); tone(1320, 0.07, 0.14); tone(1760, 0.14, 0.2, 0.12); }
            else if (name === 'mark') { tone(1046, 0, 0.5, 0.2, 'triangle'); tone(1568, 0.02, 0.6, 0.1, 'sine'); }
            else if (name === 'challenge') [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.25, 0.14, 'triangle'));
            else if (name === 'end') [784, 659, 523].forEach((f, i) => tone(f, i * 0.14, 0.35, 0.16, 'triangle'));
            else if (name === 'tick') tone(1200, 0, 0.06, 0.08, 'square');
        },
    };
    return api;
};
