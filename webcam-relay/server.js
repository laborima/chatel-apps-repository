'use strict';

/*
 * Webcam relay: turns the 4K HLS stream of the Châtelaillon harbour webcam into small
 * JPEG frames a watch can show.
 *
 * ffmpeg decodes key frames only (one every 2 s on this stream), so a 2-core ARM VM
 * keeps up. The stream (~5 Mbit/s) is only pulled while someone watches: ffmpeg starts
 * on the first request and stops after IDLE_MS without requests.
 *
 *   GET /webcam-relay/frame.jpg   latest frame (waits for the first one when starting)
 *   GET /webcam-relay/live.mjpg   multipart MJPEG stream for browsers
 *   GET /webcam-relay/status      JSON state, for monitoring
 */

const http = require('http');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || 8080);
const BASE_PATH = process.env.BASE_PATH || '/webcam-relay';
const SOURCE_ID = process.env.WEBCAM_SOURCE_ID || '61701253-3b92-4587-3334-3630-6d61-63-aa4f-03743e306fd3d';
const PLATFORMS = (process.env.QUANTEEC_PLATFORMS ||
    'https://platforms6.joada.net,https://platforms7.joada.net,https://platforms8.joada.net').split(',');
const FALLBACK_URL = `https://ds2-cache.quanteec.com/contents/encodings/live/${SOURCE_ID}/master.m3u8`;
const WIDTH = Number(process.env.FRAME_WIDTH || 480);
const IDLE_MS = Number(process.env.IDLE_MS || 45000);
const FIRST_FRAME_TIMEOUT_MS = 30000;

let ffmpeg = null;
let lastRequestAt = 0;
let frame = null;
let frameAt = 0;
let waiters = [];
const mjpegClients = new Set();

function log(message) {
    console.log(`${new Date().toISOString()} ${message}`);
}

async function resolveStreamUrl() {
    for (const platform of PLATFORMS) {
        try {
            const res = await fetch(`${platform}/api/videos/manifest/${SOURCE_ID}`, {
                signal: AbortSignal.timeout(5000)
            });
            if (!res.ok) continue;
            const json = await res.json();
            if (json.m3u8) return json.m3u8;
        } catch (e) {
            // Try the next platform
        }
    }
    return FALLBACK_URL;
}

function publishFrame(jpeg) {
    frame = jpeg;
    frameAt = Date.now();
    waiters.forEach(resolve => resolve(jpeg));
    waiters = [];
    for (const res of mjpegClients) {
        res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
        res.write(jpeg);
        res.write('\r\n');
    }
}

async function startFfmpeg() {
    if (ffmpeg) return;
    // Placeholder so concurrent requests do not start a second process
    ffmpeg = { starting: true };
    const url = await resolveStreamUrl();
    log(`starting ffmpeg on ${url}`);

    const proc = spawn('ffmpeg', [
        '-hide_banner', '-loglevel', 'error',
        '-skip_frame', 'nokey',
        // Read at native speed: frames come every 2 s instead of in bursts per segment
        '-re',
        '-live_start_index', '-1',
        '-i', url,
        '-an',
        '-fps_mode', 'passthrough',
        '-vf', `scale=${WIDTH}:-2`,
        '-q:v', '6',
        '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    ffmpeg = proc;

    // Split the MJPEG byte stream on JPEG start (FFD8) / end (FFD9) markers
    let buffer = Buffer.alloc(0);
    proc.stdout.on('data', chunk => {
        buffer = Buffer.concat([buffer, chunk]);
        for (;;) {
            const start = buffer.indexOf(Buffer.from([0xff, 0xd8]));
            if (start < 0) { buffer = Buffer.alloc(0); return; }
            const end = buffer.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
            if (end < 0) { buffer = buffer.subarray(start); return; }
            publishFrame(Buffer.from(buffer.subarray(start, end + 2)));
            buffer = buffer.subarray(end + 2);
        }
    });
    proc.stderr.on('data', data => log(`ffmpeg: ${data.toString().trim()}`));
    proc.on('exit', code => {
        log(`ffmpeg exited (${code})`);
        if (ffmpeg === proc) ffmpeg = null;
    });
}

function stopFfmpeg() {
    if (ffmpeg && ffmpeg.kill) {
        log('no viewer, stopping ffmpeg');
        ffmpeg.kill('SIGTERM');
    }
    ffmpeg = null;
}

setInterval(() => {
    if (ffmpeg && mjpegClients.size === 0 && Date.now() - lastRequestAt > IDLE_MS) stopFfmpeg();
}, 5000);

function touch() {
    lastRequestAt = Date.now();
    startFfmpeg().catch(e => {
        log(`cannot start ffmpeg: ${e.message}`);
        ffmpeg = null;
    });
}

function nextFrame(timeoutMs) {
    return new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), timeoutMs);
        waiters.push(jpeg => { clearTimeout(timer); resolve(jpeg); });
    });
}

const server = http.createServer(async (req, res) => {
    const path = req.url.split('?')[0];
    if (req.method !== 'GET') {
        res.writeHead(405).end();
        return;
    }

    if (path === `${BASE_PATH}/frame.jpg`) {
        touch();
        // A frame older than the idle window comes from a stopped stream: wait for a new one
        const current = frame && Date.now() - frameAt < IDLE_MS ? frame : await nextFrame(FIRST_FRAME_TIMEOUT_MS);
        if (!current) {
            res.writeHead(503, { 'Retry-After': '5' }).end('Webcam stream starting');
            return;
        }
        res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Content-Length': current.length,
            'Cache-Control': 'no-store',
            'X-Frame-Age-Ms': String(Date.now() - frameAt)
        });
        res.end(current);
        return;
    }

    if (path === `${BASE_PATH}/live.mjpg`) {
        touch();
        res.writeHead(200, {
            'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
            'Cache-Control': 'no-store'
        });
        mjpegClients.add(res);
        req.on('close', () => mjpegClients.delete(res));
        return;
    }

    if (path === `${BASE_PATH}/status`) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({
            running: Boolean(ffmpeg),
            frameAgeMs: frame ? Date.now() - frameAt : null,
            mjpegClients: mjpegClients.size
        }));
        return;
    }

    res.writeHead(404).end();
});

server.listen(PORT, () => log(`webcam relay listening on ${PORT}${BASE_PATH}`));
process.on('SIGTERM', () => { stopFfmpeg(); process.exit(0); });
