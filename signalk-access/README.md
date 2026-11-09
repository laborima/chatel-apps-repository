# SignalK remote access with client certificates

The SignalK server sits behind Traefik on the home LAN. Access rules:

| From | Requirement |
|---|---|
| LAN `192.168.1.0/24`, including the public host name (the Freebox NAT loopback presents LAN clients as `192.168.1.254`) | none, SignalK login for admin and writes |
| Anywhere else | a client certificate issued by the private CA **and** listed in `allowed-clients.map` |

How it works:

1. Traefik asks for a client certificate on the TLS handshake but does not require one
   (`client-cert-optional`, `VerifyClientCertIfGiven`): TLS options are chosen per host
   before routing, so the LAN and remote routers must share them.
2. The `signalk-lan` router (`ClientIP(192.168.1.0/24)`, high priority) goes straight to SignalK.
3. Every other request goes through `require-client-cert`: client-sent certificate headers are
   dropped, Traefik adds the verified certificate CN, and the `cert-check` nginx container
   (internal network only) answers 204 for an allowlisted CN, 403 otherwise.
4. The `websecure` entry point deletes headers with aliasing names (`aliasHeadersStrategy=delete`)
   so `X_Forwarded_Tls_Client_Cert_Info` cannot impersonate the real header in nginx.

## Files

| Repository | Server (compose folder) |
|---|---|
| `traefik/dynamic.yml` | `traefik/dynamic/dynamic.yml` (file provider, watched) |
| CA certificate from the PKI | `traefik/client-ca.pem` |
| `cert-check/nginx.conf` | `cert-check/nginx.conf` |
| `cert-check/allowed-clients.map.sample` | `cert-check/allowed-clients.map` |

The `cert-check` folder is mounted as a directory: edit files in place, a single-file bind mount
would keep serving the old inode.

The `docker-compose.yml` changes on the server:

```yaml
  traefik:
    command:
      - "--entrypoints.websecure.http.aliasHeadersStrategy=delete"
      - "--providers.file.directory=/etc/traefik/dynamic"
      - "--providers.file.watch=true"
    volumes:
      - ./traefik/dynamic:/etc/traefik/dynamic:ro
      - ./traefik/client-ca.pem:/etc/traefik/client-ca.pem:ro

  cert-check:
    image: nginx:1.30.6-alpine-slim
    read_only: true
    user: "101:101"
    tmpfs:
      - /tmp
    volumes:
      - ./cert-check:/etc/nginx/cert-check:ro
    command: ["nginx", "-c", "/etc/nginx/cert-check/nginx.conf", "-g", "daemon off;"]

  signalk:
    labels:
      - "traefik.http.routers.signalk-https.tls.options=client-cert-optional@file"
      - "traefik.http.routers.signalk-https.middlewares=require-client-cert@file"
      - "traefik.http.routers.signalk-lan.rule=Host(`signalk.example.org`) && ClientIP(`192.168.1.0/24`)"
      - "traefik.http.routers.signalk-lan.priority=1000"
      - "traefik.http.routers.signalk-lan.tls.options=client-cert-optional@file"
```

## Devices

Issue a certificate (the PKI lives in `~/signalk-pki`, outside the repository; keep `ca/ca.key` offline):

```bash
signalk-access/pki/issue-client-cert.sh matthieu-tablet
```

Then add `"~CN%3Dmatthieu-tablet%22" 1;` to `allowed-clients.map` on the server and reload:
`docker exec cert-check nginx -s reload -c /etc/nginx/cert-check/nginx.conf`.
Removing the line revokes the device.

- **Android phone**: copy the `.p12`, then Settings → Security → Encryption & credentials →
  Install a certificate → VPN & app user certificate. Chrome asks once which certificate to use.
- **iPhone**: AirDrop or mail the `.p12`, then Settings → Profile Downloaded → Install. Safari uses it;
  other apps and in-app web views usually do not.
- **Wear OS watch (`chatel-watch`)**: set `signalk.clientCert` and `signalk.clientCertPassword` in
  `chatel-watch/local.properties`; the build bundles the `.p12` and OkHttp presents it.

## Checks

From outside the LAN (or over IPv6, which the LAN rule does not match):

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://signalk.example.org/signalk            # 403
curl -s -o /dev/null -w '%{http_code}\n' --cert dev.pem --key dev.key https://signalk.example.org/signalk  # 200
```
