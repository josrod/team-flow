# =============================================================================
# ROSEN CUSW Team Flow — automatización de tareas locales
# =============================================================================
# Uso:  make <target>            (o desde npm:  npm run <target>)
# Ayuda: make help
#
# Requiere: docker, docker compose, bun (o npm), openssl, psql opcional.
# =============================================================================

SHELL           := /bin/bash
COMPOSE         := docker compose -f docker/docker-compose.yml --env-file docker/.env
DB_EXEC         := $(COMPOSE) exec -T db psql -U postgres -d postgres
MIGRATIONS_DIR  := supabase/migrations
SEED_FILE       := supabase/seed.sql

.DEFAULT_GOAL := help
.PHONY: help setup env keys install dev build test lint \
        up down restart ps logs \
        db-migrate db-seed db-reset db-shell db-backup db-restore \
        functions-logs bootstrap clean

## ---------------------------------------------------------------------------
## Ayuda
## ---------------------------------------------------------------------------
help: ## Muestra esta ayuda
	@awk 'BEGIN {FS = ":.*##"; printf "\nTargets disponibles:\n"} \
	  /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

## ---------------------------------------------------------------------------
## Setup inicial
## ---------------------------------------------------------------------------
setup: env keys install ## Setup completo: .env + claves + dependencias
	@echo "✔ Setup listo. Siguiente: 'make bootstrap' para levantar todo."

env: ## Crea .env y docker/.env desde las plantillas si no existen
	@[ -f .env ] || cp .env.example .env && echo "· .env creado (revísalo)"
	@[ -f docker/.env ] || cp docker/.env.example docker/.env && echo "· docker/.env creado (revísalo)"

keys: ## Genera secretos aleatorios (JWT_SECRET, ADO_PAT_ENC_KEY, ...)
	@echo "POSTGRES_PASSWORD=$$(openssl rand -hex 24)"
	@echo "JWT_SECRET=$$(openssl rand -hex 32)"
	@echo "REALTIME_SECRET_KEY_BASE=$$(openssl rand -hex 64)"
	@echo "ADO_PAT_ENC_KEY=$$(openssl rand -hex 32)"
	@echo ""
	@echo "→ Copia estos valores a docker/.env y genera ANON_KEY/SERVICE_ROLE_KEY"
	@echo "  siguiendo: https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys"

install: ## Instala dependencias del frontend (bun preferido, npm de fallback)
	@command -v bun >/dev/null 2>&1 && bun install || npm install

## ---------------------------------------------------------------------------
## Frontend
## ---------------------------------------------------------------------------
dev: ## Arranca Vite en modo dev (localhost:8080)
	@command -v bun >/dev/null 2>&1 && bun run dev || npm run dev

build: ## Compila la SPA a dist/
	@command -v bun >/dev/null 2>&1 && bun run build || npm run build

test: ## Ejecuta la suite de vitest
	@command -v bun >/dev/null 2>&1 && bun run test || npm test

lint: ## Ejecuta eslint
	@command -v bun >/dev/null 2>&1 && bun run lint || npm run lint

## ---------------------------------------------------------------------------
## Docker stack (self-hosted)
## ---------------------------------------------------------------------------
up: ## Levanta el stack completo en background
	$(COMPOSE) up -d --build

down: ## Detiene el stack (conserva volúmenes)
	$(COMPOSE) down

restart: ## Reinicia todos los servicios
	$(COMPOSE) restart

ps: ## Estado de los contenedores
	$(COMPOSE) ps

logs: ## Sigue logs (uso: make logs S=auth)
	$(COMPOSE) logs -f $(S)

## ---------------------------------------------------------------------------
## Base de datos
## ---------------------------------------------------------------------------
db-migrate: ## Aplica todas las migraciones de supabase/migrations
	@echo "→ Aplicando migraciones desde $(MIGRATIONS_DIR)"
	@for f in $(MIGRATIONS_DIR)/*.sql; do \
	  echo "  · $$f"; \
	  $(DB_EXEC) < "$$f" || exit 1; \
	done
	@echo "✔ Migraciones aplicadas"

db-seed: ## Carga datos de ejemplo (supabase/seed.sql)
	@[ -f $(SEED_FILE) ] || (echo "✘ Falta $(SEED_FILE)"; exit 1)
	$(DB_EXEC) < $(SEED_FILE)
	@echo "✔ Seed cargado"

db-reset: ## Borra el volumen de la DB y vuelve a migrar + seed
	@echo "⚠  Esto BORRA todos los datos. Ctrl+C para cancelar."
	@sleep 3
	$(COMPOSE) down -v
	$(COMPOSE) up -d db
	@until $(DB_EXEC) -c 'select 1' >/dev/null 2>&1; do sleep 1; done
	$(MAKE) db-migrate
	$(MAKE) db-seed

db-shell: ## Abre psql interactivo en la DB
	$(COMPOSE) exec db psql -U postgres -d postgres

db-backup: ## Vuelca la DB a backups/backup_<fecha>.sql
	@mkdir -p backups
	@f=backups/backup_$$(date +%Y%m%d_%H%M%S).sql; \
	  $(COMPOSE) exec -T db pg_dump -U postgres postgres > $$f && \
	  echo "✔ Backup: $$f"

db-restore: ## Restaura un backup (uso: make db-restore F=backups/xxx.sql)
	@[ -n "$(F)" ] || (echo "Uso: make db-restore F=backups/archivo.sql"; exit 1)
	$(DB_EXEC) < $(F)
	@echo "✔ Restaurado desde $(F)"

## ---------------------------------------------------------------------------
## Edge Functions
## ---------------------------------------------------------------------------
functions-logs: ## Logs de la Edge Function tfs-pat-vault
	$(COMPOSE) logs -f functions

## ---------------------------------------------------------------------------
## One-shot
## ---------------------------------------------------------------------------
bootstrap: up ## Setup end-to-end: up + espera + migraciones + seed
	@echo "→ Esperando a que Postgres esté listo..."
	@until $(DB_EXEC) -c 'select 1' >/dev/null 2>&1; do sleep 1; done
	$(MAKE) db-migrate
	@[ -f $(SEED_FILE) ] && $(MAKE) db-seed || echo "· sin seed (opcional)"
	@echo ""
	@echo "✔ Todo arriba:"
	@echo "    SPA     → http://localhost:8080"
	@echo "    API     → http://localhost:8000"
	@echo "    Studio  → http://localhost:3001"

clean: ## Borra dist/, node_modules y backups locales
	rm -rf dist node_modules backups
