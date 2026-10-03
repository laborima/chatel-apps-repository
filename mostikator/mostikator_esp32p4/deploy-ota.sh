#!/usr/bin/env bash
# Build the detection node firmware and flash it over WiFi (ArduinoOTA), no USB cable needed.
#   ./deploy-ota.sh                   # host mostikator-p4-01.local
#   ./deploy-ota.sh 192.168.1.31      # or an explicit IP
#   ./deploy-ota.sh --usb             # first flash / recovery over /dev/ttyACM0 (CH343 "UART" port)
# The webapp (LittleFS) is deployed separately: signalk-mostikator/deploy-esp.sh --ota
# The OTA password is read from config.h (OTA_PASSWORD).
set -euo pipefail

cd "$(dirname "$0")"
CLI="${ARDUINO_CLI:-$HOME/arduino-ide_2.3.7_Linux_64bit/resources/app/lib/backend/resources/arduino-cli}"
command -v "$CLI" >/dev/null 2>&1 || CLI=arduino-cli
# ChipVariant=prev3: the Waveshare board is an esp32p4-eco2, postv3 crashes the bootloader in a loop
FQBN="esp32:esp32:esp32p4:PSRAM=enabled,FlashSize=32M,PartitionScheme=custom,ChipVariant=prev3,CDCOnBoot=default"
BUILD="${BUILD_DIR:-/tmp/mostikator-p4-build}"

"$CLI" compile --fqbn "$FQBN" --build-path "$BUILD" .

# Keep the ELF of every build: a crash dump read later with "crash raw" / "crash" only decodes
# against the exact binary that crashed (esp-coredump checks its SHA256)
ARCHIVE="${ELF_ARCHIVE:-$HOME/.mostikator-builds}"
mkdir -p "$ARCHIVE"
cp "$BUILD/mostikator_esp32p4.ino.elf" "$ARCHIVE/mostikator_esp32p4-$(date +%Y%m%d-%H%M%S).elf"

if [ "${1:-}" = "--usb" ]; then
    "$CLI" upload --fqbn "$FQBN" --build-path "$BUILD" -p "${PORT:-/dev/ttyACM0}" .
    exit 0
fi

HOST="${1:-$(sed -n 's/^#define DEVICE_NAME *"\(.*\)".*/\1/p' config.h).local}"
PASS=$(sed -n 's/^#define OTA_PASSWORD *"\(.*\)".*/\1/p' config.h)
PORT_OTA=$(sed -n 's/^#define OTA_PORT *\([0-9]*\).*/\1/p' config.h)
ESPOTA=$(ls -d "$HOME"/.arduino15/packages/esp32/hardware/esp32/*/tools/espota.py | sort -V | tail -1)

echo "OTA -> $HOST:${PORT_OTA:-3232}"
python3 "$ESPOTA" -i "$HOST" -p "${PORT_OTA:-3232}" -a "$PASS" -f "$BUILD/mostikator_esp32p4.ino.bin" -r
