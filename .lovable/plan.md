## Objetivo
Añadir `npm run local:status` para inspeccionar el estado del stack Docker local y confirmar que Postgres y los servicios core de Supabase están listos antes de migrar.

## Cambios

### 1. Nuevo script `scripts/local-status.sh`
Script Bash con salida coloreada que:

- Valida que Docker y `docker compose` están disponibles y que existe `docker/.env` (avisa si falta).
- Ejecuta `docker compose -f docker/docker-compose.yml ps` para mostrar tabla `NAME | STATE | HEALTH | PORTS`.
- Chequeo dirigido por servicio clave:
  - **Postgres**: `docker compose exec -T db pg_isready -U postgres`.
  - **Kong (gateway)**: `curl -fsS http://localhost:8000/`.
  - **Auth (GoTrue)**: `curl -fsS http://localhost:8000/auth/v1/health`.
  - **PostgREST**: `curl -fsS -H "apikey: $ANON_KEY" http://localhost:8000/rest/v1/`.
  - **Realtime**: `curl -fsS http://localhost:8000/realtime/v1/api/tenants/health` (o endpoint equivalente).
  - **Edge Runtime**: `curl -fsS -o /dev/null -w "%{http_code}" http://localhost:8000/functions/v1/` (acepta 200/401/404, rechaza 000/5xx).
  - **Studio**: `curl -fsS http://localhost:3000/`.
- Resumen final `OK/FAIL` por servicio.
- Códigos de salida:
  - `0` si Postgres + Kong + Auth + PostgREST están sanos (listo para migrar).
  - `1` en caso contrario, indicando qué falta.
- Flags:
  - `--wait` — reintenta hasta 60 s (poll cada 2 s) hasta que Postgres y PostgREST estén listos. Encadenable con migraciones.
  - `--json` — salida estructurada para scripting.

### 2. `package.json`
Añadir:
```json
"local:status": "bash scripts/local-status.sh",
"local:status:wait": "bash scripts/local-status.sh --wait"
```

### 3. Integración con `scripts/local-up.sh`
Sustituir la espera actual a Postgres por `bash scripts/local-status.sh --wait` antes de aplicar migraciones y seed, para reutilizar la misma lógica de readiness.

### 4. `DEPLOYMENT.md`
Actualizar la sección de comandos automatizados (Sección 13) documentando:
- `npm run local:status` — snapshot del stack.
- `npm run local:status:wait` — bloquea hasta que Postgres/PostgREST estén listos.
- Interpretación de códigos de salida y referencia a la sección Troubleshooting cuando un servicio aparezca `FAIL`.

## Fuera de alcance
- No se modifica `docker-compose.yml` ni se añaden healthchecks nuevos: se usan los existentes + probes HTTP.
- No se toca la app ni las migraciones.
