#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# ROSEN CUSW Team Flow — setup automático de variables de entorno
# =============================================================================
# Crea/actualiza .env (desarrollo SPA) y docker/.env (stack self-hosted) a partir
# de las plantillas, generando los secretos mínimos necesarios para ejecutar el
# proyecto localmente.
#
# Uso:
#   bash scripts/setup-env.sh
#   # o desde npm:
#   npm run setup:env
# =============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Genera un string hex aleatorio. Argumento: bytes.
rand_hex() {
  openssl rand -hex "$1"
}

# Genera un JWT firmado con HS256 usando Node.js (crypto nativo, sin dependencias).
# Uso: generate_jwt <role> <secret>
generate_jwt() {
  local role="$1"
  local secret="$2"
  node -e "
    const crypto = require('crypto');
    const role = '${role}';
    const secret = '${secret}';
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
      iss: 'supabase',
      sub: role,
      role: role,
      iat: now,
      exp: now + 10 * 365 * 24 * 60 * 60
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(header + '.' + payload).digest('base64url');
    console.log(header + '.' + payload + '.' + signature);
  "
}

# Actualiza una variable en un archivo .env si su valor actual es el placeholder.
# Uso: set_env_value <file> <key> <value> <placeholder-prefix>
set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local placeholder="${4:-CAMBIAR}"

  if ! grep -q "^${key}=" "$file" 2>/dev/null; then
    # Si la variable no existe, la añade al final (descomentada si estaba comentada).
    echo "${key}=${value}" >> "$file"
    return
  fi

  if grep -q "^${key}=${placeholder}" "$file" || grep -q "^${key}=CAMBIAR" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  fi
}

# Actualiza una variable en un archivo .env sin importar el valor actual.
# Uso: force_env_value <file> <key> <value>
force_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"

  if ! grep -q "^${key}=" "$file" 2>/dev/null; then
    echo "${key}=${value}" >> "$file"
  else
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  fi
}

echo "🛠️  Configurando entornos locales..."

# ---------------------------------------------------------------------------
# 1. .env (desarrollo SPA)
# ---------------------------------------------------------------------------
if [ -f .env ]; then
  echo -e "${YELLOW}· .env ya existe. Se conservan los valores no-placeholder.${NC}"
else
  echo "· Creando .env desde .env.example..."
  cp .env.example .env
fi

# Valores mínimos para desarrollo local SPA (solo si aún son placeholders).
set_env_value .env VITE_SUPABASE_URL "http://localhost:8000"
set_env_value .env VITE_SUPABASE_PROJECT_ID "local"

# ---------------------------------------------------------------------------
# 2. docker/.env (stack self-hosted completo)
# ---------------------------------------------------------------------------
if [ ! -f docker/.env.example ]; then
  echo -e "${RED}✘ No se encontró docker/.env.example. Abortando.${NC}"
  exit 1
fi

if [ -f docker/.env ]; then
  echo -e "${YELLOW}· docker/.env ya existe. Se conservan los valores no-placeholder.${NC}"
else
  echo "· Creando docker/.env desde docker/.env.example..."
  cp docker/.env.example docker/.env
fi

# Genera secretos mínimos para el stack local.
JWT_SECRET="$(rand_hex 32)"
ADO_PAT_ENC_KEY="$(rand_hex 32)"
POSTGRES_PASSWORD="$(rand_hex 24)"
REALTIME_SECRET_KEY_BASE="$(rand_hex 64)"
ANON_KEY="$(generate_jwt "anon" "$JWT_SECRET")"
SERVICE_ROLE_KEY="$(generate_jwt "service_role" "$JWT_SECRET")"

# Actualiza docker/.env sólo si los valores son placeholders.
set_env_value docker/.env JWT_SECRET "$JWT_SECRET"
set_env_value docker/.env ADO_PAT_ENC_KEY "$ADO_PAT_ENC_KEY"
set_env_value docker/.env POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
set_env_value docker/.env REALTIME_SECRET_KEY_BASE "$REALTIME_SECRET_KEY_BASE"
set_env_value docker/.env ANON_KEY "$ANON_KEY"
set_env_value docker/.env SERVICE_ROLE_KEY "$SERVICE_ROLE_KEY"

# URLs por defecto para desarrollo local.
force_env_value docker/.env SITE_URL "http://localhost:8080"
force_env_value docker/.env PUBLIC_SUPABASE_URL "http://localhost:8000"

# Sincroniza la clave pública del frontend con el ANON_KEY generado.
force_env_value .env VITE_SUPABASE_PUBLISHABLE_KEY "$ANON_KEY"

# ---------------------------------------------------------------------------
# Resumen
# ---------------------------------------------------------------------------
echo -e "${GREEN}✔ Entornos configurados:${NC}"
echo "    .env         → SPA dev (VITE_*)"
echo "    docker/.env  → stack self-hosted (Postgres, JWT, Edge Functions)"
echo ""
echo "  Se generaron/actualizaron los siguientes secretos mínimos:"
echo "    JWT_SECRET, ADO_PAT_ENC_KEY, POSTGRES_PASSWORD, REALTIME_SECRET_KEY_BASE"
echo "    ANON_KEY, SERVICE_ROLE_KEY"
echo ""
echo "  Próximos pasos:"
echo "    1. Revisa .env y docker/.env si tenías valores personalizados."
echo "    2. 'make bootstrap' o 'npm run stack:bootstrap' para levantar todo."
