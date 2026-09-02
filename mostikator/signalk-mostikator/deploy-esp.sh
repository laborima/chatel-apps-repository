#!/bin/bash
#
# Builds the webapp for the ESP32-P4 target and flashes it to the LittleFS
# partition of the Mostikator board (see mostikator_esp32p4/partitions.csv).
#
#   ./deploy-esp.sh                 build + image + flash on /dev/ttyACM0
#   ./deploy-esp.sh --port /dev/ttyUSB0
#   ./deploy-esp.sh --no-flash      build + image only (mostikator.littlefs.bin)
#   ./deploy-esp.sh --image-only    skip the Next.js build, rebuild the image from out-esp/
#
# The firmware itself is flashed with the Arduino IDE (or arduino-cli); this
# script only updates the "spiffs" data partition mounted as LittleFS.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FIRMWARE_DIR="${SCRIPT_DIR}/../mostikator_esp32p4"
BUILD_DIR="${SCRIPT_DIR}/out-esp"
IMAGE="${SCRIPT_DIR}/mostikator.littlefs.bin"

PORT="/dev/ttyACM0"
DO_BUILD=true
DO_FLASH=true
BAUD=921600

# Tool locations (Arduino IDE / arduino-cli install)
ESP32_TOOLS="${ESP32_TOOLS:-$HOME/.arduino15/packages/esp32/tools}"
MKLITTLEFS="$(ls -d ${ESP32_TOOLS}/mklittlefs/*/mklittlefs 2>/dev/null | sort -V | tail -1)"
ESPTOOL="$(ls -d ${ESP32_TOOLS}/esptool_py/*/esptool 2>/dev/null | sort -V | tail -1)"
[ -z "${ESPTOOL}" ] && ESPTOOL="$(command -v esptool.py || command -v esptool || true)"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

while [[ $# -gt 0 ]]; do
    case $1 in
        --port)       PORT="$2"; shift 2 ;;
        --baud)       BAUD="$2"; shift 2 ;;
        --no-flash)   DO_FLASH=false; shift ;;
        --image-only) DO_BUILD=false; shift ;;
        --help)
            sed -n '2,14p' "$0"; exit 0 ;;
        *) log_error "Unknown option: $1"; exit 1 ;;
    esac
done

# Partition geometry from partitions.csv (spiffs line)
PART_LINE="$(grep -E '^spiffs,' "${FIRMWARE_DIR}/partitions.csv" | head -1)"
if [ -z "${PART_LINE}" ]; then
    log_error "No spiffs partition in ${FIRMWARE_DIR}/partitions.csv"
    exit 1
fi
PART_OFFSET="$(echo "${PART_LINE}" | awk -F',' '{gsub(/ /,"",$4); print $4}')"
PART_SIZE="$(echo "${PART_LINE}" | awk -F',' '{gsub(/ /,"",$5); print $5}')"
log_info "LittleFS partition: offset ${PART_OFFSET}, size ${PART_SIZE}"

if [ "${DO_BUILD}" = true ]; then
    log_info "Building webapp for the ESP32 target..."
    cd "${SCRIPT_DIR}"
    NODE_ENV=production npm run build:esp
    rm -rf "${BUILD_DIR}"
    mv out "${BUILD_DIR}"

    # Pre-compress text assets: the firmware serves <file>.gz with Content-Encoding: gzip
    log_info "Compressing text assets..."
    find "${BUILD_DIR}" -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.json' \
        -o -name '*.svg' -o -name '*.txt' -o -name '*.webmanifest' \) -print0 | while IFS= read -r -d '' f; do
        gzip -9 -f "$f"
    done
    # Next.js RSC payloads (*.txt) are not needed by the static export
    find "${BUILD_DIR}" \( -name '__next.*' -o -name 'index.txt' -o -name 'index.txt.gz' \) -delete
fi

if [ ! -d "${BUILD_DIR}" ]; then
    log_error "Build directory not found: ${BUILD_DIR}"
    exit 1
fi

if [ -z "${MKLITTLEFS}" ]; then
    log_error "mklittlefs not found under ${ESP32_TOOLS}/mklittlefs (install the esp32 core in the Arduino IDE)"
    exit 1
fi

log_info "Creating LittleFS image with $(du -sh "${BUILD_DIR}" | cut -f1) of files..."
"${MKLITTLEFS}" -c "${BUILD_DIR}" -b 4096 -p 256 -s "${PART_SIZE}" "${IMAGE}"
log_info "Image: ${IMAGE} ($(du -h "${IMAGE}" | cut -f1))"

if [ "${DO_FLASH}" = true ]; then
    if [ -z "${ESPTOOL}" ]; then
        log_error "esptool not found – flash manually: esptool --chip esp32p4 --port ${PORT} write_flash ${PART_OFFSET} ${IMAGE}"
        exit 1
    fi
    log_info "Flashing ${IMAGE} to ${PORT} at ${PART_OFFSET}..."
    "${ESPTOOL}" --chip esp32p4 --port "${PORT}" --baud "${BAUD}" write_flash "${PART_OFFSET}" "${IMAGE}"
    log_info "Done – reboot the board, the webapp is served at http://<esp-ip>/"
else
    log_warn "Flash skipped. To flash: ${ESPTOOL:-esptool} --chip esp32p4 --port ${PORT} write_flash ${PART_OFFSET} ${IMAGE}"
fi
