# Deployment Guide — Instalación local

Esta guía describe cómo desplegar **ROSEN CUSW Team Flow** en una infraestructura local (on‑premise o self‑hosted), reemplazando **Lovable Cloud** por servicios equivalentes que puedas operar tú mismo.

La aplicación es un SPA React + Vite que hoy usa Lovable Cloud (Supabase gestionado) para autenticación, base de datos, Edge Functions y secrets. Para correr todo local necesitas replicar esos cuatro bloques.

---

## 1. Arquitectura objetivo

```text
┌────────────────────────┐        ┌──────────────────────────┐
│  Navegador (SPA React) │──HTTPS▶│  Reverse proxy (nginx)   │
└────────────────────────┘        │  - / → dist/ estático    │
                                  │  - /api → backend        │
                                  │  - /functions → edge fns │
                                  └────────────┬─────────────┘
                                               │
                     ┌─────────────────────────┼─────────────────────────┐
                     ▼                         ▼                         ▼
             ┌───────────────┐        ┌────────────────┐        ┌────────────────┐
             │  PostgreSQL   │        │  GoTrue (auth) │        │  Deno / Node   │
             │  + PostgREST  │        │                │        │  Edge Function │
             └───────────────┘        └────────────────┘        │  (tfs-pat-vault│
                                                                │   + TFS proxy) │
                                                                └────────────────┘
```

Componentes a proveer localmente:

| Capa | Lovable Cloud | Alternativa local recomendada | Alternativas |
|------|---------------|-------------------------------|--------------|
| Base de datos | Postgres gestionado | **Supabase self‑hosted** (Docker) | Postgres puro + PostgREST |
| Auth | Supabase Auth (GoTrue) | **GoTrue** del stack self‑hosted | Keycloak, Authelia, Auth0 self‑hosted |
| Edge Functions | Deno Deploy gestionado | **`supabase functions serve`** o Deno standalone | Node/Express, Cloudflare Workers on‑prem |
| Secrets | Panel Lovable Cloud | Variables de entorno + `.env` cifrado / Vault | HashiCorp Vault, Doppler self‑hosted |
| Storage (si se usa) | Supabase Storage | `storage-api` self‑hosted | MinIO, S3 compatible |
| Hosting SPA | CDN Lovable | nginx / Caddy / IIS con SPA fallback | Apache, Traefik |

Se recomienda **Supabase self‑hosted** porque conserva 1:1 el esquema, RLS, migraciones (`supabase/migrations/*.sql`) y la Edge Function ya escrita (`supabase/functions/tfs-pat-vault`) sin reescribir código de cliente.

---

## 2. Requisitos previos

- Linux (Ubuntu 22.04+ / RHEL 9+) o Windows Server 2022 con WSL2.
- Docker 24+ y Docker Compose v2.
- Node.js 20 LTS y `npm`/`bun` para compilar el frontend.
- Certificados TLS (Let's Encrypt interno, ADCS o self‑signed para intranet).
- Acceso de red al TFS/Azure DevOps on‑premise desde el servidor donde correrán las Edge Functions.
- Puertos abiertos: `443` (SPA + API), `54321` (Supabase Kong, si se expone), `5432` (Postgres, sólo interno).

---

## 3. Base de datos y Auth — Supabase self‑hosted

### 3.1 Levantar el stack

```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
# Editar .env: cambiar POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY,
# SERVICE_ROLE_KEY, SITE_URL, API_EXTERNAL_URL, SMTP_*
docker compose up -d
```

Verifica en `http://<host>:8000` (Studio) que Postgres, Auth (GoTrue), PostgREST y Storage están arriba.

### 3.2 Aplicar migraciones del proyecto

Todas las migraciones necesarias están versionadas en `supabase/migrations/`. Aplícalas en orden:

```bash
# Opción A: Supabase CLI (recomendada)
npm i -g supabase
supabase link --project-ref <local-project-ref>   # o usar db push directo
supabase db push --db-url postgres://postgres:<pwd>@<host>:5432/postgres

# Opción B: psql directo
for f in supabase/migrations/*.sql; do
  psql "postgres://postgres:<pwd>@<host>:5432/postgres" -f "$f"
done
```

Las migraciones incluyen:
- Tablas: `teams`, `members`, `absences`, `handovers`, `work_topics`, `azure_devops_settings`, `user_roles`.
- Enum `app_role` y función `has_role`.
- Políticas RLS y `GRANT` para roles `authenticated` / `anon` / `service_role`.
- Triggers `update_updated_at_column` y validaciones (`validate_bugs_query_id`, `validate_epics_query_id`).

### 3.3 Configurar Auth

En `.env` de Supabase Docker:
- `GOTRUE_MAILER_AUTOCONFIRM=true` (evita confirmación por email en intranet) — o configura SMTP corporativo.
- `GOTRUE_DISABLE_SIGNUP=false` mientras registras usuarios; luego cambia a `true`.
- Crea el primer usuario admin desde Studio y añade la fila en `public.user_roles` con `role = 'admin'`.

Alternativa sin Supabase Auth: **Keycloak**. Requiere reescribir `src/context/AuthContext.tsx` y `src/integrations/supabase/client.ts` para usar `keycloak-js` + tokens JWT propios delante de PostgREST. Es un esfuerzo mayor y **no** se recomienda salvo obligación corporativa.

---

## 4. Edge Function `tfs-pat-vault` y proxy TFS

La función `supabase/functions/tfs-pat-vault/index.ts` cifra/descifra PATs de Azure DevOps con AES‑GCM y valida el JWT del llamador.

### 4.1 Desplegar con Supabase self‑hosted

```bash
# Desde la raíz del repo
supabase functions deploy tfs-pat-vault \
  --project-ref <local-project-ref> \
  --no-verify-jwt
# Secret obligatorio (mínimo 32 caracteres):
supabase secrets set ADO_PAT_ENC_KEY="$(openssl rand -base64 48)"
```

Guarda `ADO_PAT_ENC_KEY` de forma segura: **si se pierde, todos los PATs cifrados serán irrecuperables** y los usuarios tendrán que volver a introducirlos.

### 4.2 Alternativa sin Supabase Functions

Si no usas el runtime de Supabase, puedes correr la función como un servicio Deno standalone:

```bash
deno run --allow-net --allow-env \
  supabase/functions/tfs-pat-vault/index.ts
```

O portar el archivo a **Node.js + Express** (sustituir `Deno.env` por `process.env`, `Deno.serve` por `app.listen`, e importar `@supabase/supabase-js` desde npm). Publica el servicio detrás del reverse proxy en `/functions/v1/tfs-pat-vault`.

### 4.3 Proxy TFS (opcional pero recomendado)

Si el navegador no puede alcanzar el TFS directamente (fuera de oficina, CORS, red segmentada), añade una Edge Function proxy `tfs-proxy` que reenvíe llamadas server‑side. El repo ya expone helpers en `src/services/tfs.ts` preparados para esta ruta.

---

## 5. Frontend (SPA)

### 5.1 Variables de entorno

Crea `.env.production` con los valores locales:

```env
VITE_SUPABASE_URL="https://supabase.intranet.local"
VITE_SUPABASE_PUBLISHABLE_KEY="<ANON_KEY del stack self-hosted>"
VITE_SUPABASE_PROJECT_ID="local"
```

Estas variables son **públicas** (van al bundle). La `SERVICE_ROLE_KEY` no debe aparecer nunca en el frontend.

### 5.2 Build

```bash
npm ci
npm run build     # genera dist/
```

### 5.3 Servir con SPA fallback

**nginx**:

```nginx
server {
  listen 443 ssl http2;
  server_name teamflow.intranet.local;

  root /var/www/teamflow/dist;
  index index.html;

  location / {
    try_files $uri /index.html;   # SPA fallback (React Router)
  }

  # Proxy hacia Supabase self-hosted
  location /rest/       { proxy_pass http://supabase-kong:8000/rest/; }
  location /auth/       { proxy_pass http://supabase-kong:8000/auth/; }
  location /functions/  { proxy_pass http://supabase-kong:8000/functions/; }
  location /realtime/   { proxy_pass http://supabase-kong:8000/realtime/; }
}
```

**IIS** (Windows Server): habilita URL Rewrite con la regla estándar SPA (`<match url=".*" />` → `/index.html` cuando no es archivo/directorio existente).

**Caddy**:

```caddy
teamflow.intranet.local {
  root * /var/www/teamflow/dist
  try_files {path} /index.html
  file_server
  reverse_proxy /rest/*      supabase-kong:8000
  reverse_proxy /auth/*      supabase-kong:8000
  reverse_proxy /functions/* supabase-kong:8000
}
```

---

## 6. Datos iniciales y roles

1. Registra el primer usuario desde `/auth`.
2. En Studio (o vía SQL): inserta el rol admin.

```sql
insert into public.user_roles (user_id, role)
values ('<uuid del usuario>', 'admin');
```

3. Importa datos existentes con **Data backup → Import JSON** desde la propia app.

---

## 7. Configuración de Azure DevOps / TFS

- Entra como admin en `/settings/azure-devops`.
- Rellena Server URL, Collection, Project, Team y PAT (se cifra con `ADO_PAT_ENC_KEY`).
- Si el TFS está detrás de CORS restrictivo, consulta la guía integrada (`TfsCorsGuideDialog`) o usa el proxy `tfs-proxy` de la sección 4.3.

---

## 8. Alternativas resumidas para uso local

| Necesidad | Alternativa 1 (recomendada) | Alternativa 2 | Alternativa 3 |
|-----------|-----------------------------|----------------|----------------|
| Backend completo | Supabase self‑hosted (Docker) | Postgres + PostgREST + GoTrue manual | Firebase Emulator (limitado) |
| Auth | GoTrue self‑hosted | Keycloak (SAML/OIDC) | Authelia + LDAP corporativo |
| Cifrado de PATs | Edge Function con `ADO_PAT_ENC_KEY` | HashiCorp Vault Transit API | Azure Key Vault on‑premise (HSM) |
| Hosting SPA | nginx | Caddy (TLS auto) | IIS (Windows Server) |
| Emails (reset password) | SMTP corporativo (Exchange) | Postfix relay | Mailhog para dev |
| Backups DB | `pg_dump` diario + rsync | pgBackRest | Barman |
| Observabilidad | Supabase Studio + `docker logs` | Grafana + Loki + Prometheus | ELK stack |

---

## 9. Backups y mantenimiento

```bash
# Backup diario
pg_dump -Fc "postgres://postgres:<pwd>@db:5432/postgres" \
  -f /backups/teamflow_$(date +%F).dump

# Restore
pg_restore -d "postgres://postgres:<pwd>@db:5432/postgres" \
  --clean --if-exists /backups/teamflow_YYYY-MM-DD.dump
```

Programa con `cron` o Task Scheduler. Guarda copias offsite y rota mínimo 30 días.

Actualizaciones:
1. `git pull` del repo.
2. Nuevas migraciones → `supabase db push`.
3. `npm ci && npm run build` y recarga nginx.
4. Redeploy de Edge Functions si cambian.

---

## 10. Checklist final

- [ ] Postgres + Supabase self‑hosted arriba y accesible sólo desde la red interna.
- [ ] Migraciones aplicadas sin errores (`supabase/migrations/*.sql`).
- [ ] `ADO_PAT_ENC_KEY` generada, guardada en gestor de secretos y respaldada.
- [ ] `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` apuntan al stack local.
- [ ] SPA servida con fallback a `index.html`.
- [ ] TLS válido en el reverse proxy.
- [ ] Primer usuario admin creado en `user_roles`.
- [ ] Backup automatizado y probado con un restore de prueba.
- [ ] Conectividad SPA ↔ Supabase ↔ TFS verificada end‑to‑end.
