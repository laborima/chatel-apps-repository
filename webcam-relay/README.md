# Webcam relay

The Châtelaillon harbour webcam only streams 4K H.264 (HLS, ~5 Mbit/s), which a watch cannot
decode. This container turns it into small JPEG frames:

- ffmpeg decodes key frames only (one every 2 s), read at native speed, scaled to 480 px wide:
  ~15 % of one core on the 2-core ARM VM;
- the stream is only pulled while someone watches: ffmpeg starts on the first request and stops
  45 s after the last one.

| Endpoint | |
|---|---|
| `GET /webcam-relay/frame.jpg` | latest frame (~10 KB), waits for the first one when starting |
| `GET /webcam-relay/live.mjpg` | MJPEG stream for browsers |
| `GET /webcam-relay/status` | `{ running, frameAgeMs, mjpegClients }` |

Used by `chatel-watch` (webcam page and tile).

## Deployment

Copy `Dockerfile` and `server.js` to `webcam-relay/` next to the SignalK `docker-compose.yml`,
then `docker compose up -d --build webcam-relay`. It is routed like SignalK: free on the LAN,
client certificate required from outside (see `signalk-access/`).

```yaml
  webcam-relay:
    build: ./webcam-relay
    image: webcam-relay:local
    restart: unless-stopped
    read_only: true
    security_opt:
      - no-new-privileges:true
    networks:
      - backend
    labels:
      - "traefik.enable=true"
      - "traefik.http.services.webcam-relay.loadbalancer.server.port=8080"
      - "traefik.http.routers.webcam-lan.rule=Host(`signalk.example.org`) && ClientIP(`192.168.1.0/24`) && PathPrefix(`/webcam-relay/`)"
      - "traefik.http.routers.webcam-lan.priority=2000"
      - "traefik.http.routers.webcam-lan.tls.options=client-cert-optional@file"
      - "traefik.http.routers.webcam-https.rule=Host(`signalk.example.org`) && PathPrefix(`/webcam-relay/`)"
      - "traefik.http.routers.webcam-https.priority=1500"
      - "traefik.http.routers.webcam-https.tls.options=client-cert-optional@file"
      - "traefik.http.routers.webcam-https.middlewares=require-client-cert@file"
```

Both routers also need `entrypoints=websecure`, `tls=true`, `tls.certresolver` and
`service=webcam-relay`.
