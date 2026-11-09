#!/bin/bash
#
# Issue a client certificate for remote SignalK access (mutual TLS).
#
# Usage: issue-client-cert.sh <name> [days]
#   <name>  lowercase letters, digits and dashes (e.g. matthieu-watch). It becomes the
#           certificate CN, which the cert-check allowlist matches.
#   [days]  validity, 825 by default (iOS rejects longer client certificates in profiles).
#
# The CA is created on first run. Everything is written under $SIGNALK_PKI_DIR
# (default ~/signalk-pki), never inside this repository:
#   ca/ca.key, ca/ca.pem             CA key (keep offline) and the certificate Traefik trusts
#   clients/<name>.p12               bundle to install on the device
#   clients/<name>.password          its import password

set -euo pipefail

NAME="${1:-}"
DAYS="${2:-825}"
PKI_DIR="${SIGNALK_PKI_DIR:-$HOME/signalk-pki}"

if [[ ! "$NAME" =~ ^[a-z0-9][a-z0-9-]{1,40}$ ]]; then
    echo "Usage: $0 <name> [days]   (name: lowercase letters, digits and dashes)" >&2
    exit 1
fi

umask 077
mkdir -p "$PKI_DIR/ca" "$PKI_DIR/clients"

CA_KEY="$PKI_DIR/ca/ca.key"
CA_PEM="$PKI_DIR/ca/ca.pem"

if [ ! -f "$CA_KEY" ]; then
    echo "Creating the client CA in $PKI_DIR/ca"
    openssl ecparam -name prime256v1 -genkey -noout -out "$CA_KEY"
    openssl req -x509 -new -key "$CA_KEY" -sha256 -days 3650 \
        -subj "/O=leslaborie/CN=SignalK Client CA" \
        -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
        -addext "keyUsage=critical,keyCertSign,cRLSign" \
        -out "$CA_PEM"
    chmod 644 "$CA_PEM"
fi

KEY="$PKI_DIR/clients/$NAME.key"
CSR="$PKI_DIR/clients/$NAME.csr"
PEM="$PKI_DIR/clients/$NAME.pem"
P12="$PKI_DIR/clients/$NAME.p12"
PASS_FILE="$PKI_DIR/clients/$NAME.password"

if [ -f "$P12" ]; then
    echo "$P12 already exists: remove it first to reissue" >&2
    exit 1
fi

openssl ecparam -name prime256v1 -genkey -noout -out "$KEY"
openssl req -new -key "$KEY" -subj "/O=leslaborie/CN=$NAME" -out "$CSR"

EXT_FILE="$(mktemp)"
trap 'rm -f "$EXT_FILE"' EXIT
cat > "$EXT_FILE" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=clientAuth
EOF

openssl x509 -req -in "$CSR" -CA "$CA_PEM" -CAkey "$CA_KEY" -CAcreateserial \
    -sha256 -days "$DAYS" -extfile "$EXT_FILE" -out "$PEM"
rm -f "$CSR"

openssl rand -base64 18 | tr -d '/+=' > "$PASS_FILE"

# Legacy PBE/MAC algorithms: Android KeyChain, Wear OS and iOS profiles all import them
openssl pkcs12 -export -inkey "$KEY" -in "$PEM" -certfile "$CA_PEM" \
    -name "$NAME" -passout "file:$PASS_FILE" \
    -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 \
    -out "$P12"

echo "Issued $NAME (valid $DAYS days)"
echo "  bundle:   $P12"
echo "  password: $PASS_FILE"
echo "Add '$NAME' to allowed-clients.map on the server to let it in."
