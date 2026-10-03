const http = require('http');

/**
 * SignalK plugin for Mostikator.
 *
 * 1. Reverse proxy to the ESP32-P4 detection node so the dashboard served
 *    over HTTPS (signalk.example.org) can reach the device without
 *    mixed-content errors:
 *
 *      /signalk-mostikator/device/<route>  ->  http://ESP_IP:ESP_PORT/api/<route>
 *
 *    Routes: status, auth, targets, stats, config, arm, disarm, shot, sound, capture, stream, log
 *    Commands need the device control password (X-Mostikator-Key header), forwarded as is.
 *
 * 2. Metadata for the SignalK paths published by the device through the
 *    MQTT bridge (environment.mostikator.*).
 *
 * Same pattern as signalk-poi-lab (Pi camera proxy).
 */
module.exports = function (app) {
    const plugin = {};

    plugin.id = 'signalk-mostikator';
    plugin.name = 'Mostikator';
    plugin.description = 'Mosquito detection dashboard with ESP32-P4 device proxy';

    plugin.schema = {
        type: 'object',
        title: 'Mostikator Settings',
        properties: {
            deviceHost: {
                type: 'string',
                title: 'ESP32-P4 Host',
                description: 'IP or hostname of the detection node. Only a fallback: the device publishes its own address on environment.mostikator.device.ip and the proxy follows it (no DHCP reservation needed)',
                default: 'mostikator-p4-01.local'
            },
            devicePort: {
                type: 'number',
                title: 'ESP32-P4 HTTP Port',
                description: 'HTTP port of the device REST API (default 80)',
                default: 80
            }
        }
    };

    let configuredHost = 'mostikator-p4-01.local';
    let devicePort = 80;
    let lastHost = null;

    const PROXY_PATH = '/signalk-mostikator/device';
    let running = false;
    let routeInstalled = false;

    plugin.start = function (options) {
        configuredHost = options.deviceHost || 'mostikator-p4-01.local';
        devicePort = options.devicePort || 80;
        running = true;

        /* Express cannot remove a middleware: install it once, and let it pass through while the
         * plugin is stopped instead of stacking one more proxy at every restart */
        if (!routeInstalled) {
            routeInstalled = true;
            app.use(PROXY_PATH, (req, res, next) => {
                if (!running) return next();
                const url = req.url || '/';
                /* Only the device REST API: no "..", no absolute URL smuggled into the request line */
                if (!url.startsWith('/') || url.includes('..') || url.includes('\\')) {
                    res.status(400).json({ error: 'Bad device path' });
                    return;
                }
                proxyRequest(req, res, '/api' + url);
            });
        }

        publishMeta();

        app.debug(`Mostikator proxy started: ${PROXY_PATH}/* -> http://${deviceHost()}:${devicePort}/api/*`);
    };

    plugin.stop = function () {
        running = false;
        app.debug('Mostikator proxy stopped');
    };

    /**
     * Address of the device: the one it last published over MQTT (follows DHCP and the switch between
     * the two WiFi networks), else the configured host.
     */
    function deviceHost() {
        let host = configuredHost;
        try {
            const published = app.getSelfPath('environment.mostikator.device.ip');
            const ip = published && published.value;
            if (typeof ip === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && ip !== '0.0.0.0') host = ip;
        } catch (err) {
            app.debug(`device.ip lookup failed: ${err.message}`);
        }
        if (host !== lastHost) {
            lastHost = host;
            app.debug(`Mostikator device at ${host}:${devicePort}`);
        }
        return host;
    }

    /**
     * Declares units / descriptions for the paths the device publishes.
     */
    function publishMeta() {
        const base = 'environment.mostikator.';
        const meta = [
            { path: base + 'detector.state', value: { description: 'Detector state: disarmed | learning | armed' } },
            { path: base + 'detector.fps', value: { units: 'Hz', description: 'Detector frames per second' } },
            { path: base + 'detector.activeTargets', value: { description: 'Number of confirmed targets' } },
            { path: base + 'camera.fps', value: { units: 'Hz', description: 'Camera capture rate' } },
            { path: base + 'target', value: { description: 'Primary target (normalised x/y, pan/tilt in degrees, prediction)' } },
            { path: base + 'event', value: { description: 'Last event: acquired | updated | lost | shot' } },
            { path: base + 'stats.seen', value: { description: 'Mosquitoes seen' } },
            { path: base + 'stats.shots', value: { description: 'Shots fired' } },
            { path: base + 'stats.hits', value: { description: 'Mosquitoes hit' } },
            { path: base + 'stats.misses', value: { description: 'Missed shots' } },
            { path: base + 'device.rssi', value: { units: 'dBm', description: 'WiFi signal of the ESP32-P4' } },
            { path: base + 'device.uptime', value: { units: 's', description: 'Device uptime' } },
            { path: base + 'device.ip', value: { description: 'IP address of the ESP32-P4 (followed by the proxy)' } }
        ];
        try {
            app.handleMessage(plugin.id, {
                updates: [{ meta }]
            });
        } catch (err) {
            app.debug(`Meta publish failed: ${err.message}`);
        }
    }

    /**
     * Proxies an HTTP request to the ESP32-P4.
     *
     * @param {object} req        Express request
     * @param {object} res        Express response
     * @param {string} targetPath Path on the device
     */
    function proxyRequest(req, res, targetPath) {
        if (req.method === 'OPTIONS') {
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.set('Access-Control-Allow-Headers', 'Content-Type, X-Mostikator-Key');
            res.sendStatus(204);
            return;
        }

        // The MJPEG stream and the snapshot wait for camera frames
        const isSlow = targetPath.startsWith('/api/stream') || targetPath.startsWith('/api/capture');

        /* SignalK mounts a body parser ahead of the plugins, so on a POST the body is already
         * consumed and req.pipe() below would send nothing while Content-Length still promised
         * bytes - the device then waits for a body that never comes, until our own timeout.
         * When the body has been parsed, re-serialise it and send it ourselves. */
        const parsedBody = (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0)
            ? new URLSearchParams(req.body).toString()
            : null;

        const host = deviceHost();
        const headers = { 'Host': `${host}:${devicePort}` };
        /* Control password checked by the device itself (arm, sound, settings...) */
        if (req.headers['x-mostikator-key']) headers['X-Mostikator-Key'] = req.headers['x-mostikator-key'];
        if (parsedBody !== null) {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            headers['Content-Length'] = Buffer.byteLength(parsedBody);
        } else {
            if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
            if (req.headers['content-length']) headers['Content-Length'] = req.headers['content-length'];
        }

        const options = {
            hostname: host,
            port: devicePort,
            path: targetPath,
            method: req.method,
            headers,
            timeout: isSlow ? 45000 : 8000
        };

        const proxyReq = http.request(options, (proxyRes) => {
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.set('Access-Control-Allow-Headers', 'Content-Type, X-Mostikator-Key');
            if (isSlow) res.set('X-Accel-Buffering', 'no'); // keep nginx from buffering the MJPEG stream
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res, { end: true });
        });

        proxyReq.on('error', (err) => {
            app.debug(`Proxy error: ${err.message}`);
            if (!res.headersSent) {
                res.status(502).json({
                    error: 'Mostikator device unreachable',
                    message: err.message,
                    target: `${host}:${devicePort}${targetPath}`
                });
            } else {
                res.destroy(err);   /* failed mid-body: never leave the browser hanging */
            }
        });

        /* Browser gone (stream stopped, tab closed): release the ESP socket at once. It only has
         * 4 MJPEG slots and would otherwise hold each one until its own write timeout. */
        res.on('close', () => {
            if (!res.writableEnded) proxyReq.destroy();
        });

        proxyReq.on('socket', (socket) => {
            socket.setNoDelay(true);
        });

        proxyReq.on('timeout', () => {
            if (!res.headersSent) res.status(504).json({ error: 'Device timeout' });
            proxyReq.destroy(new Error('Device timeout'));
        });

        if (parsedBody !== null) {
            proxyReq.end(parsedBody);
        } else {
            req.pipe(proxyReq, { end: true });
        }
    }

    return plugin;
};
