#!/usr/bin/env bash
# =============================================================================
# scripts/local-up.sh
# -----------------------------------------------------------------------------
# One-shot: levanta el stack local (Docker Compose) y aplica migraciones + seed.
#
# Uso:
#   ./scripts/local-up.sh              # arranque normal
#   ./scripts/local-up.sh --reset      # borra el volumen de la DB antes
#   ./scripts/local-up.sh --no-seed    # migra pero no ejecuta el seed
#
# También disponible como:  npm run local:up
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="docker/docker-compose.yml"
ENV_FILE="docker/.env"
ENV_EXAMPLE="docker/.env.example"
MIGRATIONS_DIR="supabase/migrations"
SEED_FILE="supabase/seed.sql"

RESET=false
RUN_SEED=true
for arg in "$@"; do
  case "$arg" in
    --reset)    RESET=true ;;
    --no-seed)  RUN_SEED=false ;;
    -h|--help)  sed -n '1,15p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $arg"; exit 1 ;;
  esac
done

log() { printf "\033[36m→\033[0m %s\n" "$*"; }
ok()  { printf "\033[32m✔\033[0m %s\n" "$*"; }
warn(){ printf "\033[33m⚠\033[0m %s\n" "$*"; }
err() { printf "\033[31m✘\033[0m %s\n" "$*" >&2; }

# --- Requisitos --------------------------------------------------------------
command -v docker >/dev/null || { err "docker no está instalado"; exit 1; }
docker compose version >/dev/null 2>&1 || { err "Necesitas Docker Compose v2"; exit 1; }

# --- .env --------------------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_EXAMPLE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    warn "$ENV_FILE creado desde $ENV_EXAMPLE — edítalo antes de exponer el stack."
  else
    err "Falta $ENV_EXAMPLE"; exit 1
  fi
fi

if grep -q "CAMBIAR" "$ENV_FILE"; then
  warn "$ENV_FILE aún contiene marcadores 'CAMBIAR'. Está bien para localhost,"
  warn "pero rota los secretos antes de exponerlo en red."
fi

COMPOSE="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"
DB_EXEC="$COMPOSE exec -T db psql -U postgres -d postgres"

# --- Reset opcional ----------------------------------------------------------
if $RESET; then
  warn "Reset solicitado: borrando volúmenes en 3s (Ctrl+C para cancelar)..."
  sleep 3
  $COMPOSE down -v
fi

# --- Arranque ----------------------------------------------------------------
log "docker compose up -d --build"
$COMPOSE up -d --build

log "Esperando a que Postgres esté listo..."
for i in $(seq 1 60); do
  if $DB_EXEC -c 'select 1' >/dev/null 2>&1; then
    ok "Postgres listo (${i}s)"
    break
  fi
  sleep 1
  if [ "$i" = "60" ]; then err "Postgres no responde tras 60s"; exit 1; fi
done

# --- Migraciones -------------------------------------------------------------
if [ -d "$MIGRATIONS_DIR" ] && compgen -G "$MIGRATIONS_DIR/*.sql" > /dev/null; then
  log "Aplicando migraciones desde $MIGRATIONS_DIR"
  for f in "$MIGRATIONS_DIR"/*.sql; do
    printf "  · %s\n" "$(basename "$f")"
    $DB_EXEC < "$f"
  done
  ok "Migraciones aplicadas"
else
  warn "No se encontraron migraciones en $MIGRATIONS_DIR"
fi

# --- Seed --------------------------------------------------------------------
if $RUN_SEED && [ -f "$SEED_FILE" ]; then
  log "Cargando seed: $SEED_FILE"
  $DB_EXEC < "$SEED_FILE"
  ok "Seed cargado"
elif ! $RUN_SEED; then
  log "Seed omitido (--no-seed)"
else
  warn "Sin $SEED_FILE, se omite el seed."
fi

# --- Resumen -----------------------------------------------------------------
echo
ok "Stack local arriba:"
printf "    SPA     → \033[36mhttp://localhost:8080\033[0m\n"
printf "    API     → \033[36mhttp://localhost:8000\033[0m\n"
printf "    Studio  → \033[36mhttp://localhost:3001\033[0m\n"
echo
log "Logs:      docker compose -f $COMPOSE_FILE logs -f <servicio>"
log "Parar:     docker compose -f $COMPOSE_FILE down"
