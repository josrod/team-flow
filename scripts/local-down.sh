#!/usr/bin/env bash
# =============================================================================
# scripts/local-down.sh
# -----------------------------------------------------------------------------
# Detiene el stack local levantado con local-up.sh y elimina contenedores y
# redes del entorno local.
#
# Uso:
#   ./scripts/local-down.sh              # down normal
#   ./scripts/local-down.sh --volumes    # down + borra volúmenes (pierde datos)
#   ./scripts/local-down.sh --clean      # down + volúmenes + imágenes creadas
#
# También disponible como:  npm run local:down
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="docker/docker-compose.yml"
ENV_FILE="docker/.env"

DOWN_FLAGS=()
RESET_VOLUMES=false
CLEAN_IMAGES=false
for arg in "$@"; do
  case "$arg" in
    --volumes)       DOWN_FLAGS+=("--volumes"); RESET_VOLUMES=true ;;
    --clean)         DOWN_FLAGS+=("--volumes" "--rmi" "local"); RESET_VOLUMES=true; CLEAN_IMAGES=true ;;
    -h|--help)       sed -n '1,15p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $arg"; exit 1 ;;
  esac
done

log() { printf "\033[36m→\033[0m %s\n" "$*"; }
ok()  { printf "\033[32m✔\033[0m %s\n" "$*"; }
warn(){ printf "\033[33m⚠\033[0m %s\n" "$*"; }
err() { printf "\033[31m✘\033[0m %s\n" "$*" >&2; }

command -v docker >/dev/null || { err "docker no está instalado"; exit 1; }
docker compose version >/dev/null 2>&1 || { err "Necesitas Docker Compose v2"; exit 1; }

if [ ! -f "$ENV_FILE" ]; then
  warn "No existe $ENV_FILE; se usa el compose por defecto."
  ENV_FILE=""
fi

if $RESET_VOLUMES; then
  warn "Se borrarán los volúmenes de Docker (incluyendo la base de datos)."
  warn "Continuando en 3s (Ctrl+C para cancelar)..."
  sleep 3
fi

if $CLEAN_IMAGES; then
  warn "También se eliminarán las imágenes construidas localmente."
fi

if [ -n "$ENV_FILE" ]; then
  COMPOSE="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"
else
  COMPOSE="docker compose -f $COMPOSE_FILE"
fi

log "Parando stack local..."
$COMPOSE down "${DOWN_FLAGS[@]}"

ok "Stack local detenido."
if $RESET_VOLUMES; then
  warn "Los volúmenes de Postgres han sido eliminados."
fi
