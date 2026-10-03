#!/bin/bash

# Deploy SignalK plugins to remote server
# Builds and deploys:
# - chatel-signalk-weatherprovider (this plugin)
# - chatel-meteo-planner (webapp)
# - signalk-tides (plugin)
# - signalk-poi-lab (pond camera + sensor webapp)
# - signalk-mostikator (webapp + ESP32-P4 proxy plugin)

set -e

# Load configuration from .env file
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "${SCRIPT_DIR}/.env" ]; then
    source "${SCRIPT_DIR}/.env"
fi

# Defaults (overridden by .env or CLI args)
REMOTE_USER="${REMOTE_USER:-user}"
REMOTE_HOST="${REMOTE_HOST:-localhost}"
SSH_PORT="${SSH_PORT:-22}"

# Docker configuration
DOCKER_CONTAINER="signalk"
SIGNALK_DATA_DIR="/home/node/.signalk"
SIGNALK_PLUGINS_DIR="${SIGNALK_DATA_DIR}/node_modules"
SIGNALK_LOCAL_PLUGINS_DIR="${SIGNALK_DATA_DIR}/local-plugins"

# Temporary staging directory on remote host
STAGING_DIR="/tmp/signalk-deploy"

# Paths (relative to ocearo workspace)
OCEARO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEATHER_PROVIDER_DIR="${OCEARO_DIR}/chatel-signalk-weatherprovider"
METEO_PLANNER_DIR="${OCEARO_DIR}/../chatel-apps-repository/chatel-meteo-planner"
TIDES_DIR="$(cd "$(dirname "$0")/../../ocearo/signalk-tides" && pwd)"
LOCAL_TIDE_DATA_DIR="$(cd "$(dirname "$0")/../../ocearo/cirrus/tides" && pwd)"
POI_LAB_DIR="$(cd "$(dirname "$0")/../signalk-esp-pond-sensor/signalk-poi-lab" && pwd)"
MOSTIKATOR_DIR="$(cd "$(dirname "$0")/../mostikator/signalk-mostikator" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check SSH connection
check_ssh() {
    log_info "Checking SSH connection to ${REMOTE_USER}@${REMOTE_HOST}..."
    if ! ssh -p ${SSH_PORT} -o ConnectTimeout=5 ${REMOTE_USER}@${REMOTE_HOST} "echo 'SSH OK'" > /dev/null 2>&1; then
        log_error "Cannot connect to ${REMOTE_USER}@${REMOTE_HOST}"
        exit 1
    fi
    log_info "SSH connection OK"
}

# Deploy chatel-signalk-weatherprovider
deploy_weather_provider() {
    log_info "Deploying chatel-signalk-weatherprovider..."
    
    if [ ! -d "${WEATHER_PROVIDER_DIR}" ]; then
        log_error "Weather provider directory not found: ${WEATHER_PROVIDER_DIR}"
        return 1
    fi
    
    local PLUGIN_NAME="signalk-meteolarochelle-provider"
    local STAGING="${STAGING_DIR}/${PLUGIN_NAME}"
    local CONTAINER_DIR="${SIGNALK_LOCAL_PLUGINS_DIR}/${PLUGIN_NAME}"
    
    # Create staging directory on remote
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${STAGING}"
    
    # Copy files to staging
    scp -P ${SSH_PORT} -r \
        "${WEATHER_PROVIDER_DIR}/index.js" \
        "${WEATHER_PROVIDER_DIR}/package.json" \
        "${WEATHER_PROVIDER_DIR}/CHANGELOG.md" \
        ${REMOTE_USER}@${REMOTE_HOST}:${STAGING}/
    
    # Clean and copy to Docker container
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec ${DOCKER_CONTAINER} rm -rf ${CONTAINER_DIR}"
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec ${DOCKER_CONTAINER} mkdir -p ${SIGNALK_LOCAL_PLUGINS_DIR}"
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec ${DOCKER_CONTAINER} mkdir -p ${CONTAINER_DIR}"
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker cp ${STAGING}/. ${DOCKER_CONTAINER}:${CONTAINER_DIR}/"
    
    # Install dependencies inside container
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec -w ${CONTAINER_DIR} ${DOCKER_CONTAINER} npm install --production"

    # Register plugin in SignalK config (prevents npm from pruning it on future Appstore installs)
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec -w ${SIGNALK_DATA_DIR} ${DOCKER_CONTAINER} npm install --omit=dev --ignore-scripts file:${CONTAINER_DIR}"
    
    # Cleanup staging
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "rm -rf ${STAGING}"
    
    log_info "Weather provider deployed successfully"
}

# Deploy chatel-meteo-planner
deploy_meteo_planner() {
    log_info "Deploying chatel-meteo-planner..."
    
    if [ ! -d "${METEO_PLANNER_DIR}" ]; then
        log_error "Meteo planner directory not found: ${METEO_PLANNER_DIR}"
        return 1
    fi
    
    local PLUGIN_NAME="chatel-meteo-planner"
    local STAGING="${STAGING_DIR}/${PLUGIN_NAME}"
    local CONTAINER_DIR="${SIGNALK_LOCAL_PLUGINS_DIR}/${PLUGIN_NAME}"
    local BUILD_DIR="${METEO_PLANNER_DIR}/out"
    
    # Build the Next.js project
    log_info "Building Next.js project..."
    cd "${METEO_PLANNER_DIR}"
    NODE_ENV=production npm run build
    
    if [ $? -ne 0 ]; then
        log_error "Build failed!"
        return 1
    fi
    
    # Create staging directory on remote
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${STAGING}/public/icons"
    
    # Copy built files to staging
    log_info "Transferring files..."
    scp -P ${SSH_PORT} -r ${BUILD_DIR}/* ${REMOTE_USER}@${REMOTE_HOST}:${STAGING}/public/
    
    # Copy package.json for SignalK webapp registration
    scp -P ${SSH_PORT} "${METEO_PLANNER_DIR}/package.json" ${REMOTE_USER}@${REMOTE_HOST}:${STAGING}/

    # Clean and copy to Docker container
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec ${DOCKER_CONTAINER} rm -rf ${CONTAINER_DIR}"
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec ${DOCKER_CONTAINER} mkdir -p ${SIGNALK_LOCAL_PLUGINS_DIR}"
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec ${DOCKER_CONTAINER} mkdir -p ${CONTAINER_DIR}"
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker cp ${STAGING}/. ${DOCKER_CONTAINER}:${CONTAINER_DIR}/"

    # Register webapp in SignalK config (prevents npm from pruning it on future Appstore installs)
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec -w ${SIGNALK_DATA_DIR} ${DOCKER_CONTAINER} npm install --omit=dev --ignore-scripts file:${CONTAINER_DIR}"
    
    # Cleanup staging
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "rm -rf ${STAGING}"
    
    log_info "Meteo planner deployed successfully"
}

# Deploy local tide data files
deploy_tide_data() {
    log_info "Deploying local tide data files..."
    
    local TIDE_DATA_DIR="${LOCAL_TIDE_DATA_DIR}"
    local STAGING="${STAGING_DIR}/tides"
    local CONTAINER_DIR="${SIGNALK_DATA_DIR}/tides"
    
    if [ ! -d "${TIDE_DATA_DIR}" ]; then
        log_error "Tide data directory not found: ${TIDE_DATA_DIR}"
        return 1
    fi
    
    # Create staging directory on remote
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${STAGING}"
    
    # Copy tide data files to staging (excluding .gitignore and scripts)
    log_info "Transferring tide data files..."
    scp -P ${SSH_PORT} -r ${TIDE_DATA_DIR}/* ${REMOTE_USER}@${REMOTE_HOST}:${STAGING}/
    
    # Remove non-data files from staging
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "find ${STAGING} -name '.gitignore' -delete; find ${STAGING} -name '*.sh' -delete"
    
    # Clean and copy to Docker container (keep existing subdirs, just update files)
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec ${DOCKER_CONTAINER} mkdir -p ${CONTAINER_DIR}"
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker cp ${STAGING}/. ${DOCKER_CONTAINER}:${CONTAINER_DIR}/"
    
    # Cleanup staging
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "rm -rf ${STAGING}"
    
    log_info "Tide data deployed to ${CONTAINER_DIR}"
}

# Deploy signalk-tides
deploy_tides() {
    log_info "Deploying signalk-tides..."
    
    if [ ! -d "${TIDES_DIR}" ]; then
        log_error "Tides directory not found: ${TIDES_DIR}"
        return 1
    fi
    
    local PLUGIN_NAME="signalk-tides"
    local STAGING="${STAGING_DIR}/${PLUGIN_NAME}"
    local CONTAINER_DIR="${SIGNALK_LOCAL_PLUGINS_DIR}/${PLUGIN_NAME}"
    
    # Build the project
    log_info "Building signalk-tides..."
    cd "${TIDES_DIR}"
    npm run build
    
    if [ $? -ne 0 ]; then
        log_error "Build failed!"
        return 1
    fi
    
    # Create staging directory on remote
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${STAGING}"
    
    # Copy built files to staging
    log_info "Transferring files..."
    scp -P ${SSH_PORT} -r \
        "${TIDES_DIR}/dist" \
        "${TIDES_DIR}/public" \
        "${TIDES_DIR}/package.json" \
        ${REMOTE_USER}@${REMOTE_HOST}:${STAGING}/
    
    # Clean and copy to Docker container
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec ${DOCKER_CONTAINER} rm -rf ${CONTAINER_DIR}"
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec ${DOCKER_CONTAINER} mkdir -p ${CONTAINER_DIR}"
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker cp ${STAGING}/. ${DOCKER_CONTAINER}:${CONTAINER_DIR}/"
    
    # Install dependencies inside container (skip prepare script to avoid rebuild)
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec -w ${CONTAINER_DIR} ${DOCKER_CONTAINER} npm install --production --ignore-scripts"

    # Register plugin in SignalK config (prevents npm from pruning it on future Appstore installs)
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec -w ${SIGNALK_DATA_DIR} ${DOCKER_CONTAINER} npm install --omit=dev --ignore-scripts file:local-plugins/${PLUGIN_NAME}"
    
    # Cleanup staging
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "rm -rf ${STAGING}"
    
    log_info "Tides plugin deployed successfully"
}

# Deploy signalk-poi-lab
deploy_poi_lab() {
    log_info "Deploying signalk-poi-lab..."
    
    if [ ! -d "${POI_LAB_DIR}" ]; then
        log_error "POI Lab directory not found: ${POI_LAB_DIR}"
        return 1
    fi
    
    local PLUGIN_NAME="signalk-poi-lab"
    local STAGING="${STAGING_DIR}/${PLUGIN_NAME}"
    local CONTAINER_DIR="${SIGNALK_LOCAL_PLUGINS_DIR}/${PLUGIN_NAME}"
    local BUILD_DIR="${POI_LAB_DIR}/out"
    
    # Build the Next.js project
    log_info "Building POI Lab Next.js project..."
    cd "${POI_LAB_DIR}"
    NODE_ENV=production npm run build
    
    if [ $? -ne 0 ]; then
        log_error "Build failed!"
        return 1
    fi
    
    # Create staging directory on remote
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${STAGING}/public"
    
    # Copy built files to staging
    log_info "Transferring files..."
    scp -P ${SSH_PORT} -r ${BUILD_DIR}/* ${REMOTE_USER}@${REMOTE_HOST}:${STAGING}/public/
    
    # Copy package.json and plugin index.js for SignalK webapp + plugin registration
    scp -P ${SSH_PORT} "${POI_LAB_DIR}/package.json" "${POI_LAB_DIR}/index.js" ${REMOTE_USER}@${REMOTE_HOST}:${STAGING}/
    
    # Copy icon
    scp -P ${SSH_PORT} "${POI_LAB_DIR}/public/fish.svg" ${REMOTE_USER}@${REMOTE_HOST}:${STAGING}/public/
    
    # Clean and copy to Docker container
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec ${DOCKER_CONTAINER} rm -rf ${CONTAINER_DIR}"
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec ${DOCKER_CONTAINER} mkdir -p ${SIGNALK_LOCAL_PLUGINS_DIR}"
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec ${DOCKER_CONTAINER} mkdir -p ${CONTAINER_DIR}"
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker cp ${STAGING}/. ${DOCKER_CONTAINER}:${CONTAINER_DIR}/"

    # Register webapp in SignalK config
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec -w ${SIGNALK_DATA_DIR} ${DOCKER_CONTAINER} npm install --omit=dev --ignore-scripts file:${CONTAINER_DIR}"
    
    # Cleanup staging
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "rm -rf ${STAGING}"
    
    log_info "POI Lab deployed successfully"
}

# Deploy signalk-mostikator (webapp + plugin proxy to the ESP32-P4)
deploy_mostikator() {
    log_info "Deploying signalk-mostikator..."

    if [ ! -d "${MOSTIKATOR_DIR}" ]; then
        log_error "Mostikator directory not found: ${MOSTIKATOR_DIR}"
        return 1
    fi

    local PLUGIN_NAME="signalk-mostikator"
    local STAGING="${STAGING_DIR}/${PLUGIN_NAME}"
    local CONTAINER_DIR="${SIGNALK_LOCAL_PLUGINS_DIR}/${PLUGIN_NAME}"
    local BUILD_DIR="${MOSTIKATOR_DIR}/out"

    # Build the Next.js project for the SignalK target (basePath /signalk-mostikator)
    log_info "Building Mostikator Next.js project..."
    cd "${MOSTIKATOR_DIR}"
    NODE_ENV=production npm run build:signalk

    if [ $? -ne 0 ]; then
        log_error "Build failed!"
        return 1
    fi

    # Create staging directory on remote
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${STAGING}/public"

    # Copy built files to staging
    log_info "Transferring files..."
    scp -P ${SSH_PORT} -r ${BUILD_DIR}/* ${REMOTE_USER}@${REMOTE_HOST}:${STAGING}/public/

    # Copy package.json and plugin index.js for SignalK webapp + plugin registration
    scp -P ${SSH_PORT} "${MOSTIKATOR_DIR}/package.json" "${MOSTIKATOR_DIR}/index.js" ${REMOTE_USER}@${REMOTE_HOST}:${STAGING}/

    # Clean and copy to Docker container
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec ${DOCKER_CONTAINER} rm -rf ${CONTAINER_DIR}"
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec ${DOCKER_CONTAINER} mkdir -p ${SIGNALK_LOCAL_PLUGINS_DIR}"
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec ${DOCKER_CONTAINER} mkdir -p ${CONTAINER_DIR}"
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker cp ${STAGING}/. ${DOCKER_CONTAINER}:${CONTAINER_DIR}/"

    # Register webapp + plugin in SignalK config
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker exec -w ${SIGNALK_DATA_DIR} ${DOCKER_CONTAINER} npm install --omit=dev --ignore-scripts file:${CONTAINER_DIR}"

    # Cleanup staging
    ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "rm -rf ${STAGING}"

    log_info "Mostikator deployed successfully"
}

# Restart SignalK server
restart_signalk() {
    log_info "Restarting SignalK server..."
    
    # Try docker restart first, then systemctl
    if ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "docker restart ${DOCKER_CONTAINER} 2>/dev/null"; then
        log_info "SignalK container restarted"
    elif ssh -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST} "sudo systemctl restart signalk 2>/dev/null"; then
        log_info "SignalK service restarted"
    else
        log_warn "Could not restart SignalK automatically. Please restart manually."
    fi
}

# Main
main() {
    echo "=========================================="
    echo "  SignalK Plugins Deployment Script"
    echo "=========================================="
    echo ""
    
    # Parse arguments
    DEPLOY_ALL=true
    DEPLOY_WEATHER=false
    DEPLOY_PLANNER=false
    DEPLOY_TIDES=false
    DEPLOY_TIDE_DATA=false
    DEPLOY_POI_LAB=false
    DEPLOY_MOSTIKATOR=false
    SKIP_RESTART=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --weather)
                DEPLOY_ALL=false
                DEPLOY_WEATHER=true
                shift
                ;;
            --planner)
                DEPLOY_ALL=false
                DEPLOY_PLANNER=true
                shift
                ;;
            --tides)
                DEPLOY_ALL=false
                DEPLOY_TIDES=true
                shift
                ;;
            --tide-data)
                DEPLOY_ALL=false
                DEPLOY_TIDE_DATA=true
                shift
                ;;
            --poi-lab)
                DEPLOY_ALL=false
                DEPLOY_POI_LAB=true
                shift
                ;;
            --mostikator)
                DEPLOY_ALL=false
                DEPLOY_MOSTIKATOR=true
                shift
                ;;
            --no-restart)
                SKIP_RESTART=true
                shift
                ;;
            --host)
                REMOTE_HOST="$2"
                shift 2
                ;;
            --user)
                REMOTE_USER="$2"
                shift 2
                ;;
            --help)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --weather      Deploy only weather provider"
                echo "  --planner      Deploy only meteo planner"
                echo "  --tides        Deploy only tides plugin"
                echo "  --tide-data    Deploy only local tide data files"
                echo "  --poi-lab      Deploy only POI Laboratory webapp"
                echo "  --mostikator   Deploy only Mostikator webapp + plugin"
                echo "  --no-restart   Skip SignalK restart"
                echo "  --host HOST    Remote host (from .env or CLI)"
                echo "  --user USER    Remote user (from .env or CLI)"
                echo "  --help         Show this help"
                echo ""
                echo "Without options, all plugins are deployed."
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    check_ssh
    
    if [ "$DEPLOY_ALL" = true ] || [ "$DEPLOY_WEATHER" = true ]; then
        deploy_weather_provider
    fi
    
    if [ "$DEPLOY_ALL" = true ] || [ "$DEPLOY_PLANNER" = true ]; then
        deploy_meteo_planner
    fi
    
    if [ "$DEPLOY_ALL" = true ] || [ "$DEPLOY_TIDES" = true ]; then
        deploy_tides
    fi
    
    if [ "$DEPLOY_ALL" = true ] || [ "$DEPLOY_TIDE_DATA" = true ]; then
        deploy_tide_data
    fi
    
    if [ "$DEPLOY_ALL" = true ] || [ "$DEPLOY_POI_LAB" = true ]; then
        deploy_poi_lab
    fi

    if [ "$DEPLOY_ALL" = true ] || [ "$DEPLOY_MOSTIKATOR" = true ]; then
        deploy_mostikator
    fi
    
    if [ "$SKIP_RESTART" = false ]; then
        restart_signalk
    fi
    
    echo ""
    log_info "Deployment complete!"
}

main "$@"
