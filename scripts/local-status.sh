#!/usr/bin/env bash
# =============================================================================
# scripts/local-status.sh
# -----------------------------------------------------------------------------
# Muestra el estado de cada contenedor del stack local y verifica que Postgres
# + los servicios core de Supabase están listos antes de migrar.
#
# Uso:
#   ./scripts/local-status.sh              # snapshot
#   ./scripts/local-status.sh --wait       # espera hasta 60s a que estén listos
#   ./scripts/local-status.sh --json       # salida estructurada
#
# También disponible como:  npm run local:status  |  npm run local:status:wait
#
# Códigos de salida:
#   0 → Postgres + Kong + Auth + PostgREST OK (listo para migrar)
#   1 → algún servicio crítico no está listo
# =============================================================================

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="docker/docker-compose.yml"
ENV_FILE="docker/.env"

WAIT=false
JSON=false
for arg in "$@"; do
  case "$arg" in
    --wait) WAIT=true ;;
    --json) JSON=true ;;
    -h|--help) sed -n '1,20p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $arg" >&2; exit 1 ;;
  esac
done

log()  { $JSON || printf "\033[36m→\033[0m %s\n" "$*"; }
ok()   { $JSON || printf "  \033[32m✔\033[0m %-14s %s\n" "$1" "${2:-}"; }
fail() { $JSON || printf "  \033[31m✘\033[0m %-14s %s\n" "$1" "${2:-}"; }
warn() { $JSON || printf "\033[33m⚠\033[0m %s\n" "$*"; }
err()  { printf "\033[31m✘\033[0m %s\n" "$*" >&2; }

# --- Requisitos --------------------------------------------------------------
command -v docker >/dev/null || { err "docker no está instalado"; exit 1; }
docker compose version >/dev/null 2>&1 || { err "Necesitas Docker Compose v2"; exit 1; }

if [ ! -f "$ENV_FILE" ]; then
  warn "No existe $ENV_FILE — ejecuta 'npm run local:up' para inicializarlo."
fi

COMPOSE_ARGS=(-f "$COMPOSE_FILE")
[ -f "$ENV_FILE" ] && COMPOSE_ARGS+=(--env-file "$ENV_FILE")

ANON_KEY=""
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  ANON_KEY="$(grep -E '^ANON_KEY=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi

# --- Probes ------------------------------------------------------------------
check_pg() {
  docker compose "${COMPOSE_ARGS[@]}" exec -T db pg_isready -U postgres >/dev/null 2>&1
}

http_code() {
  # $1 url, $2 optional header
  local url="$1"; shift || true
  curl -sS -o /dev/null -w "%{http_code}" --max-time 4 "$@" "$url" 2>/dev/null || echo "000"
}

check_http_ok() {
  # OK if code in 200-499 (service responded); 000/5xx = fail
  local code
  code="$(http_code "$@")"
  [[ "$code" =~ ^[2-4][0-9][0-9]$ ]]
}

run_checks() {
  declare -gA STATUS
  STATUS[postgres]=$(check_pg && echo ok || echo fail)
  STATUS[kong]=$(check_http_ok "http://localhost:8000/" && echo ok || echo fail)
  STATUS[auth]=$(check_http_ok "http://localhost:8000/auth/v1/health" && echo ok || echo fail)
  local rest_args=()
  [ -n "$ANON_KEY" ] && rest_args=(-H "apikey: $ANON_KEY")
  STATUS[rest]=$(check_http_ok "http://localhost:8000/rest/v1/" "${rest_args[@]}" && echo ok || echo fail)
  STATUS[realtime]=$(check_http_ok "http://localhost:8000/realtime/v1/api/tenants/realtime-dev/health" && echo ok || echo fail)
  STATUS[functions]=$(check_http_ok "http://localhost:8000/functions/v1/" && echo ok || echo fail)
  STATUS[studio]=$(check_http_ok "http://localhost:3001/" && echo ok || echo fail)
}

critical_ready() {
  [ "${STATUS[postgres]:-fail}" = "ok" ] \
    && [ "${STATUS[kong]:-fail}" = "ok" ] \
    && [ "${STATUS[auth]:-fail}" = "ok" ] \
    && [ "${STATUS[rest]:-fail}" = "ok" ]
}

# --- Wait mode ---------------------------------------------------------------
if $WAIT; then
  log "Esperando a Postgres + PostgREST (máx 60s)..."
  for i in $(seq 1 30); do
    run_checks
    if [ "${STATUS[postgres]}" = "ok" ] && [ "${STATUS[rest]}" = "ok" ]; then
      $JSON || ok "ready" "Postgres y PostgREST listos (${i}x2s)"
      break
    fi
    sleep 2
    if [ "$i" = "30" ]; then
      err "Timeout: Postgres o PostgREST no respondieron en 60s"
      run_checks
      break
    fi
  done
else
  run_checks
fi

# --- Tabla de contenedores ---------------------------------------------------
if ! $JSON; then
  echo
  log "Contenedores (docker compose ps):"
  docker compose "${COMPOSE_ARGS[@]}" ps \
    --format 'table {{.Name}}\t{{.State}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
  echo
  log "Health checks:"
  for svc in postgres kong auth rest realtime functions studio; do
    if [ "${STATUS[$svc]}" = "ok" ]; then
      ok "$svc"
    else
      fail "$svc" "no responde"
    fi
  done
  echo
fi

# --- Salida JSON -------------------------------------------------------------
if $JSON; then
  printf '{\n'
  first=true
  for svc in postgres kong auth rest realtime functions studio; do
    $first || printf ',\n'
    printf '  "%s": "%s"' "$svc" "${STATUS[$svc]}"
    first=false
  done
  printf '\n}\n'
fi

# --- Resultado ---------------------------------------------------------------
if critical_ready; then
  $JSON || ok "READY" "Postgres + Kong + Auth + PostgREST listos → puedes migrar"
  exit 0
else
  $JSON || fail "NOT READY" "Faltan servicios críticos. Revisa 'docker compose logs' y la sección Troubleshooting de DEPLOYMENT.md"
  exit 1
fi
