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
 *    Routes: status, targets, stats, config, arm, disarm, shot, capture, stream
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
                description: 'IP or hostname of the detection node (e.g. 192.168.1.90)',
                default: '192.168.1.90'
            },
            devicePort: {
                type: 'number',
                title: 'ESP32-P4 HTTP Port',
                description: 'HTTP port of the device REST API (default 80)',
                default: 80
            }
        }
    };

    let deviceHost = '192.168.1.90';
    let devicePort = 80;

    const PROXY_PATH = '/signalk-mostikator/device';

    plugin.start = function (options) {
        deviceHost = options.deviceHost || '192.168.1.90';
        devicePort = options.devicePort || 80;

        app.use(PROXY_PATH, (req, res) => {
            proxyRequest(req, res, '/api' + (req.url || '/'));
        });

        publishMeta();

        app.debug(`Mostikator proxy started: ${PROXY_PATH}/* -> http://${deviceHost}:${devicePort}/api/*`);
    };

    plugin.stop = function () {
        app.debug('Mostikator proxy stopped');
    };

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
            { path: base + 'device.uptime', value: { units: 's', description: 'Device uptime' } }
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
            res.set('Access-Control-Allow-Headers', 'Content-Type');
            res.sendStatus(204);
            return;
        }

        // The MJPEG stream and the snapshot wait for camera frames
        const isSlow = targetPath.startsWith('/api/stream') || targetPath.startsWith('/api/capture');

        const headers = { 'Host': `${deviceHost}:${devicePort}` };
        if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
        if (req.headers['content-length']) headers['Content-Length'] = req.headers['content-length'];

        const options = {
            hostname: deviceHost,
            port: devicePort,
            path: targetPath,
            method: req.method,
            headers,
            timeout: isSlow ? 45000 : 8000
        };

        const proxyReq = http.request(options, (proxyRes) => {
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.set('Access-Control-Allow-Headers', 'Content-Type');
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
                    target: `${deviceHost}:${devicePort}${targetPath}`
                });
            }
        });

        proxyReq.on('socket', (socket) => {
            socket.setNoDelay(true);
        });

        proxyReq.on('timeout', () => {
            proxyReq.destroy();
            if (!res.headersSent) {
                res.status(504).json({ error: 'Device timeout' });
            }
        });

        req.pipe(proxyReq, { end: true });
    }

    return plugin;
};
