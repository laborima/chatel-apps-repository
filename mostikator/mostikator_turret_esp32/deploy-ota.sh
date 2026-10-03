#!/usr/bin/env bash
# Build the turret firmware and flash it over WiFi (ArduinoOTA), no USB cable needed.
#   ./deploy-ota.sh                 # host mostikator-turret.local
#   ./deploy-ota.sh 192.168.1.131   # or an explicit IP
#   ./deploy-ota.sh --usb           # first flash / recovery over /dev/ttyUSB0
# The OTA password is read from config.h (OTA_PASSWORD).
set -euo pipefail

cd "$(dirname "$0")"
CLI="${ARDUINO_CLI:-$HOME/arduino-ide_2.3.7_Linux_64bit/resources/app/lib/backend/resources/arduino-cli}"
command -v "$CLI" >/dev/null 2>&1 || CLI=arduino-cli
FQBN="esp32:esp32:esp32:PartitionScheme=no_fs,UploadSpeed=921600"
BUILD="${BUILD_DIR:-/tmp/mostikator-turret-build}"

# esp-ps5 1.3.3 never retries after a failed outbound connect (controller off at boot): patch it in place
PS5_LIB="${PS5_LIB:-$HOME/Arduino/libraries/esp-ps5}"
for p in patches/*.patch; do
    if patch -d "$PS5_LIB" -p1 -N --dry-run --silent < "$p" >/dev/null 2>&1; then
        echo "Applying $p to $PS5_LIB"
        patch -d "$PS5_LIB" -p1 -N --silent < "$p"
    elif ! patch -d "$PS5_LIB" -p1 -R --dry-run --silent < "$p" >/dev/null 2>&1; then
        echo "WARNING: $p does not apply to $PS5_LIB (library updated?) – check it by hand" >&2
    fi
done

"$CLI" compile --fqbn "$FQBN" --build-path "$BUILD" .

# Keep the ELF of every build: a crash dump read later with "crash raw" / "crash" only decodes
# against the exact binary that crashed (esp-coredump checks its SHA256)
ARCHIVE="${ELF_ARCHIVE:-$HOME/.mostikator-builds}"
mkdir -p "$ARCHIVE"
cp "$BUILD/mostikator_turret_esp32.ino.elf" "$ARCHIVE/mostikator_turret_esp32-$(date +%Y%m%d-%H%M%S).elf"

if [ "${1:-}" = "--usb" ]; then
    "$CLI" upload --fqbn "$FQBN" --build-path "$BUILD" -p "${PORT:-/dev/ttyUSB0}" .
    exit 0
fi

HOST="${1:-mostikator-turret.local}"
PASS=$(sed -n 's/^#define OTA_PASSWORD *"\(.*\)".*/\1/p' config.h)
PORT_OTA=$(sed -n 's/^#define OTA_PORT *\([0-9]*\).*/\1/p' config.h)
ESPOTA=$(ls -d "$HOME"/.arduino15/packages/esp32/hardware/esp32/*/tools/espota.py | sort -V | tail -1)

echo "OTA -> $HOST:${PORT_OTA:-3232}"
python3 "$ESPOTA" -i "$HOST" -p "${PORT_OTA:-3232}" -a "$PASS" -f "$BUILD/mostikator_turret_esp32.ino.bin" -r
