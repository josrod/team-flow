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
             ┌───────────────┐        ┌────────────────┐        ┌──────────────────────┐
             │  PostgreSQL   │        │  GoTrue (auth) │        │  Deno Edge Runtime   │
             │  + PostgREST  │        │                │        │  - tfs-pat-vault     │
             └───────────────┘        └────────────────┘        │  - ado-public-       │
                                                                │    connection        │
                                                                └──────────────────────┘
```

El navegador consulta el TFS/Azure DevOps **directamente** (no hay proxy): la Edge Function `ado-public-connection` entrega la configuración compartida del admin y, sólo con scope `data`, el PAT descifrado. La SPA cachea los resultados en `sessionStorage` (TTL de 15 min y refresco en segundo plano cuando quedan menos de 3 min) mediante `src/services/tfsResultCache.ts`.


Componentes a proveer localmente:

| Capa | Lovable Cloud | Alternativa local recomendada | Alternativas |
|------|---------------|-------------------------------|--------------|
| Base de datos | Postgres gestionado | **Supabase self‑hosted** (Docker) | Postgres puro + PostgREST |
| Auth | Supabase Auth (GoTrue) | **GoTrue** del stack self‑hosted | Keycloak, Authelia, Auth0 self‑hosted |
| Edge Functions | Deno Deploy gestionado | **`supabase functions serve`** o Deno standalone | Node/Express, Cloudflare Workers on‑prem |
| Secrets | Panel Lovable Cloud | Variables de entorno + `.env` cifrado / Vault | HashiCorp Vault, Doppler self‑hosted |
| Storage (si se usa) | Supabase Storage | `storage-api` self‑hosted | MinIO, S3 compatible |
| Hosting SPA | CDN Lovable | nginx / Caddy / IIS con SPA fallback | Apache, Traefik |

Se recomienda **Supabase self‑hosted** porque conserva 1:1 el esquema, RLS, migraciones (`supabase/migrations/*.sql`) y las Edge Functions ya escritas (`supabase/functions/tfs-pat-vault`, `supabase/functions/ado-public-connection` y el helper compartido `supabase/functions/_shared/requireUser.ts`) sin reescribir código de cliente.

---

## 2. Requisitos previos

- Linux (Ubuntu 22.04+ / RHEL 9+) o Windows Server 2022 con WSL2.
- Docker 24+ y Docker Compose v2.
- Node.js 20 LTS y `npm`/`bun` para compilar el frontend.
- Certificados TLS (Let's Encrypt interno, ADCS o self‑signed para intranet).
- Acceso de red al TFS/Azure DevOps on‑premise desde el servidor donde correrán las Edge Functions.
- Puertos abiertos: `443` (SPA + API), `54321` (Supabase Kong, si se expone), `5432` (Postgres, sólo interno).

> 📄 **Variables de entorno**: usa [`.env.example`](./.env.example) en la raíz como referencia única de todas las variables necesarias (SPA + backend + Edge Function). Para el stack Docker de la sección 11, usa además [`docker/.env.example`](./docker/.env.example).

> ⚡ **Automatización**: el [`Makefile`](./Makefile) de la raíz encapsula setup, migraciones, seed y arranque. Empieza con `make help` (o `npm run setup` + `npm run stack:bootstrap`). Ver detalle en la sección 13.





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

Todas las migraciones están versionadas en `supabase/migrations/` con el patrón
`<AAAAMMDDHHMMSS>_<uuid>.sql`. **El orden alfabético es el orden cronológico**, así que
basta con aplicarlas de la primera a la última; cada una es idempotente respecto a las
anteriores pero **no** se debe reordenar ni editar una migración ya aplicada.

```bash
# Opción A: Supabase CLI (recomendada)
npm i -g supabase
supabase db push --db-url postgres://postgres:<pwd>@<host>:5432/postgres

# Opción B: psql directo, en orden
for f in $(ls supabase/migrations/*.sql | sort); do
  echo "→ $f"
  psql "postgres://postgres:<pwd>@<host>:5432/postgres" -v ON_ERROR_STOP=1 -f "$f" || break
done

# Opción C: stack Docker de este repo (aplica todas + seed)
make db-migrate        # o: npm run local:up
```

#### Qué crean las migraciones

| Objeto | Contenido |
| --- | --- |
| `teams`, `members` | Equipos y personas (ids de texto, `login_name` para el match con Azure DevOps) |
| `absences`, `handovers` | Ausencias y traspasos (`topic_ids` como array de texto) |
| `work_topics` | Temas de trabajo por miembro |
| `task_handover_notes` | Notas y checklist por tarea (`kind`, `done`, `author_id`) |
| `azure_devops_settings` | Conexión TFS por admin: PAT cifrado (`pat_encrypted`, `pat_iv`), queries de bugs y épicas, área/iteración |
| `epic_versions` | Catálogo de versiones de entrega (`name`, `color_key`, `sort_order`) |
| `epic_version_assignments` | Relación épica de Azure DevOps ↔ versión (única por épica) |
| `user_roles` + enum `app_role` | Roles de usuario, con la función `has_role(uuid, app_role)` `SECURITY DEFINER` |

Cada tabla incluye en la misma migración: `GRANT` a `authenticated` / `service_role`,
`ENABLE ROW LEVEL SECURITY`, políticas (lectura para usuarios autenticados, escritura solo
para admin vía `has_role`) y trigger `update_updated_at_column`. Las validaciones de
`bugs_query_id` / `epics_query_id` se aplican con los triggers
`validate_bugs_query_id` y `validate_epics_query_id`.

#### Verificar que la migración fue correcta

```bash
psql "$DB_URL" -c "\dt public.*"
psql "$DB_URL" -c "select tablename, rowsecurity from pg_tables where schemaname='public';"
# Todas deben tener rowsecurity = t
psql "$DB_URL" -c "select tablename, count(*) from pg_policies where schemaname='public' group by 1;"
psql "$DB_URL" -c "select proname from pg_proc where pronamespace='public'::regnamespace;"
```

Si una consulta desde la SPA devuelve `permission denied for table X`, falta el `GRANT`:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<tabla> TO authenticated;
GRANT ALL ON public.<tabla> TO service_role;
```

#### Añadir una tabla nueva

Crea un fichero nuevo (no edites los existentes) con el mismo patrón de nombre y este orden
obligatorio de sentencias:

```sql
-- supabase/migrations/20260807090000_add_release_notes.sql
CREATE TABLE public.release_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.epic_versions(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.release_notes TO authenticated;
GRANT ALL ON public.release_notes TO service_role;

ALTER TABLE public.release_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read release notes"
  ON public.release_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can write release notes"
  ON public.release_notes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER release_notes_updated_at
  BEFORE UPDATE ON public.release_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

Después regenera los tipos del cliente:

```bash
supabase gen types typescript --db-url "$DB_URL" > src/integrations/supabase/types.ts
```

#### Scripts de base de datos disponibles

```bash
make db-migrate               # aplica supabase/migrations/*.sql en orden
make db-seed                  # carga supabase/seed.sql (equipos, miembros y ausencia de ejemplo)
make db-reset                 # ⚠ borra el volumen, migra y siembra de nuevo
make db-shell                 # psql interactivo
make db-backup                # backups/backup_<fecha>.sql
make db-restore F=backups/x.sql
./scripts/local-up.sh --reset # reset + up + migraciones + seed
./scripts/local-up.sh --no-seed
```

`supabase/seed.sql` es idempotente (`ON CONFLICT DO NOTHING`) y **no** crea usuarios: tras
registrarte, promuévete a admin con
`INSERT INTO public.user_roles (user_id, role) VALUES ('<tu-uuid>', 'admin');`.

Rollback: no hay migraciones inversas. Para volver atrás, restaura el último backup
(`make db-restore`) o ejecuta `make db-reset` si los datos son descartables.


### 3.3 Configurar Auth

En `.env` de Supabase Docker:
- `GOTRUE_MAILER_AUTOCONFIRM=true` (evita confirmación por email en intranet) — o configura SMTP corporativo.
- `GOTRUE_DISABLE_SIGNUP=false` mientras registras usuarios; luego cambia a `true`.
- Crea el primer usuario admin desde Studio y añade la fila en `public.user_roles` con `role = 'admin'`.

Alternativa sin Supabase Auth: **Keycloak**. Requiere reescribir `src/context/AuthContext.tsx` y `src/integrations/supabase/client.ts` para usar `keycloak-js` + tokens JWT propios delante de PostgREST. Es un esfuerzo mayor y **no** se recomienda salvo obligación corporativa.

---

## 4. Edge Functions (`tfs-pat-vault`, `ado-public-connection`)

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

### 4.3 Conexión compartida `ado-public-connection`

El proxy TFS se retiró: no funcionaba de forma fiable contra un TFS on‑premise segmentado. En su lugar, la función `supabase/functions/ado-public-connection/index.ts` publica la configuración de Azure DevOps del admin para que **cualquier visitante** (con o sin sesión) vea los mismos datos, consultando el TFS desde el navegador:

- Scope `links` → devuelve sólo la metadata necesaria para construir enlaces "abrir en Azure DevOps". **No** entrega el PAT.
- Scope `data` → devuelve además el PAT descifrado con `ADO_PAT_ENC_KEY` para ejecutar consultas de lectura.
- Cualquier otro valor de `scope` se rechaza con `400 Unsupported scope`.

Despliegue y requisitos:

```bash
supabase functions deploy ado-public-connection \
  --project-ref <local-project-ref> \
  --no-verify-jwt
```

Requiere `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `ADO_PAT_ENC_KEY` en el entorno de la función. En el stack Docker esto ya viene resuelto (`VERIFY_JWT: "false"` + router `supabase/functions/main/index.ts`).

Endurecimiento recomendado:

- Usa un PAT con **permisos mínimos** (sólo lectura de Work Items) y caducidad corta; rótalo periódicamente.
- El cliente (`src/services/tfs.ts`) aplica una allowlist de sólo lectura: `GET` a endpoints verificados y `POST` únicamente para consultas WIQL.
- La caché (`src/services/tfsResultCache.ts`) reduce la carga sobre el TFS; los botones de refresco fuerzan datos frescos y guardar los ajustes invalida la caché.

---

## 5. Frontend (SPA)

### 5.1 Variables de entorno

Crea `.env.production` con los valores locales, o ejecuta el script de setup automatizado
para generar `.env` (SPA) y `docker/.env` (stack self-hosted) con los secretos mínimos
necesarios:

```bash
bash scripts/setup-env.sh
# o
npm run setup:env
# o
make env
```

Este script copia `.env.example` → `.env` y `docker/.env.example` → `docker/.env`, y
genera automáticamente: `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`,
`REALTIME_SECRET_KEY_BASE`, `POSTGRES_PASSWORD` y `ADO_PAT_ENC_KEY`. Si los archivos ya
existen, sólo reemplaza los valores que siguen siendo placeholders (`CAMBIAR_*`),
conservando las personalizaciones del usuario.

Para un build manual, crea `.env.production` con:

```env
VITE_SUPABASE_URL="https://supabase.intranet.local"
VITE_SUPABASE_PUBLISHABLE_KEY="<ANON_KEY del stack self-hosted>"
VITE_SUPABASE_PROJECT_ID="local"
```

Estas variables son **públicas** (van al bundle). La `SERVICE_ROLE_KEY` no debe aparecer nunca en el frontend.

### 5.2 Bloques de variables de `.env.example`

El archivo `.env.example` de la raíz es la plantilla única de variables para desarrollo del SPA y, copiado a `docker/.env`, para el stack self-hosted. A continuación se describe qué hace cada bloque y en qué escenarios se usa.

| Bloque | Variables | Qué hacen | ¿Cuándo se usan? |
|---|---|---|---|
| 1. Frontend (Vite) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | Conectan el SPA con el backend. Son públicas por diseño (van al bundle del navegador). | Siempre que se hace build del frontend (dev y prod). |
| 2. Postgres | `POSTGRES_PASSWORD`, `DB_URL` | Credenciales del superusuario de Postgres y cadena de conexión para los scripts de base de datos (`make db-*`). | Solo self-hosted. No se usan en el bundle de Vite. |
| 3. JWT compartido | `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `REALTIME_SECRET_KEY_BASE` | Firma y validación de tokens entre GoTrue, PostgREST, Realtime y Edge Functions. `JWT_SECRET` debe ser idéntico en todos los servicios. | Solo self-hosted. `ANON_KEY` es público; `SERVICE_ROLE_KEY` es secreto de backend. |
| 4. URLs y Auth | `SITE_URL`, `PUBLIC_SUPABASE_URL`, `API_EXTERNAL_URL`, `GOTRUE_DISABLE_SIGNUP`, `GOTRUE_MAILER_AUTOCONFIRM`, `GOTRUE_SMTP_*` | Redirecciones de autenticación, URL pública del API gateway, control de registro y confirmación de email. | Solo self-hosted. Ajustar `SITE_URL` al dominio real desde el que se accede a la SPA. |
| 5. Edge Functions | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADO_PAT_ENC_KEY`, `VERIFY_JWT` | Inyectadas por el runtime de Supabase en producción gestionada; en self-hosted se definen en `docker/.env`. `ADO_PAT_ENC_KEY` cifra PATs de Azure DevOps. | `ADO_PAT_ENC_KEY` siempre (backend); `VERIFY_JWT=false` en local para permitir `ado-public-connection` pública. |
| 6. Azure DevOps / TFS | `TFS_BASE_URL`, `PROXY_RATE_LIMIT_MAX_REQUESTS`, `PROXY_RATE_LIMIT_WINDOW_SECONDS` | Documentan el entorno TFS y límites de peticiones sobre la conexión compartida. La conexión real se guarda cifrada en la base de datos. | Opcional: variables de documentación/caché; no reemplazan la configuración en `/settings/azure-devops`. |

#### Escenarios

- **Desarrollo del SPA contra backend existente (p. ej. Lovable Cloud):** solo necesitas el bloque 1. Copia `.env.example` a `.env` y rellena `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Stack self-hosted completo (Docker):** copia `.env.example` a `docker/.env` y rellena los bloques 1 a 6. El bloque 1 se reinyecta al build del contenedor `web`.
- **Producción interna:** rota todos los secretos de los bloques 2, 3, 5 y SMTP (4); `VITE_*` apuntan al dominio del API gateway.

#### Variables críticas a proteger

- **Nunca** en el frontend: `SERVICE_ROLE_KEY`, `JWT_SECRET`, `ADO_PAT_ENC_KEY`.
- **Respaldar en gestor de secretos**: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ADO_PAT_ENC_KEY` (sin esta última los PATs cifrados son irrecuperables y hay que volver a introducirlos desde `/settings`).
- **Públicas por diseño**: `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (la seguridad viene de RLS, no de ocultar estas URLs).

### 5.3 Build

```bash
npm ci
npm run build     # genera dist/
```

### 5.4 Servir con SPA fallback

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

- Entra como admin en `/settings/azure-devops` (la ruta está restringida a admin mediante `AdminRoute`).
- Rellena Server URL, Collection, Project, Team y PAT (se cifra con `ADO_PAT_ENC_KEY`). Usa un PAT de sólo lectura de Work Items.
- Configura los IDs de query: tareas, bugs (últimos 10 días, incluye estados `Resolved` y `Closed`) y épicas.
- Si el TFS está detrás de CORS restrictivo, consulta la guía integrada (`TfsCorsGuideDialog`). El acceso es directo desde el navegador, así que el equipo necesita conectividad al TFS (VPN corporativa).
- Guardar los ajustes invalida la caché de resultados TFS de la SPA.

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
- [ ] Conectividad SPA ↔ Supabase ↔ TFS verificada end‑to‑end (con y sin sesión).
- [ ] `ado-public-connection` responde a los scopes `links` y `data`, y rechaza otros valores.
- [ ] Vistas Tasks, Bugs, Épicas y Waiting cargan datos y la caché de 15 min funciona.
- [ ] `/settings` sólo accesible para el usuario admin.

---

## 11. Instalación completa con Docker Compose (todo‑en‑uno)

En la carpeta [`docker/`](./docker) hay un stack listo para levantar la SPA + Supabase self‑hosted + Edge Functions con un solo comando.

### 11.1 Contenido

| Archivo | Descripción |
|---------|-------------|
| `docker/docker-compose.yml` | Orquesta Postgres, GoTrue (Auth), PostgREST, Realtime, Kong (API gateway), Edge Runtime, Studio y el SPA. |
| `docker/.env.example` | Plantilla con todas las variables (contraseñas, JWT, claves API, `ADO_PAT_ENC_KEY`, URLs públicas). |
| `docker/kong.yml` | Rutas del API gateway (`/auth/v1`, `/rest/v1`, `/realtime/v1`, `/functions/v1`). |
| `docker/Dockerfile` | Build multi‑stage del SPA (Bun + Vite → nginx). |
| `docker/nginx.conf` | Config de nginx con fallback SPA y cabeceras de seguridad. |

### 11.2 Requisitos

- Docker Engine ≥ 24 y Docker Compose v2.
- 4 GB RAM y 5 GB de disco libres.
- `openssl` (para generar secretos) y `bash`.

### 11.3 Paso a paso

1. **Clona el repo** y sitúate en la raíz del proyecto.
2. **Prepara el `.env`**:
   ```bash
   cd docker
   cp .env.example .env
   ```
3. **Genera los secretos** y pégalos en `.env`:
   ```bash
   openssl rand -hex 32   # POSTGRES_PASSWORD
   openssl rand -hex 32   # JWT_SECRET
   openssl rand -hex 64   # REALTIME_SECRET_KEY_BASE
   openssl rand -hex 32   # ADO_PAT_ENC_KEY
   ```
4. **Genera `ANON_KEY` y `SERVICE_ROLE_KEY`** (JWT firmados con `JWT_SECRET`) siguiendo la guía oficial: <https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys>. Pega ambos en `.env`.
5. **Levanta el stack**:
   ```bash
   docker compose --env-file .env up -d --build
   ```
   La primera build de la SPA tarda 2‑3 min. Verifica con `docker compose ps` que todos los servicios están `healthy`.
6. **Aplica las migraciones** (una vez, en orden alfabético):
   ```bash
   for f in ../supabase/migrations/*.sql; do
     docker compose exec -T db psql -U postgres -d postgres < "$f"
   done
   ```
7. **Crea el primer usuario admin**:
   - Regístrate en <http://localhost:8080> (Auth con autoconfirm activado en el `.env.example`).
   - En Studio (<http://localhost:3001>) o vía `psql`, inserta el rol:
     ```sql
     INSERT INTO public.user_roles (user_id, role)
     VALUES ('<uuid_del_usuario>', 'admin');
     ```
8. **Configura Azure DevOps** desde la propia app (Settings → PAT + alcances RODAT / Software).

### 11.4 Endpoints locales

| Servicio | URL |
|----------|-----|
| SPA | http://localhost:8080 |
| API gateway (Supabase) | http://localhost:8000 |
| Studio (admin DB) | http://localhost:3001 |
| Postgres | localhost:5432 (usuario `postgres`) |

### 11.5 Operación

- **Logs**: `docker compose logs -f <servicio>` (ej. `functions`, `auth`).
- **Backup DB**: `docker compose exec db pg_dump -U postgres postgres > backup_$(date +%F).sql`.
- **Restore**: `cat backup.sql | docker compose exec -T db psql -U postgres -d postgres`.
- **Actualizar la SPA**: `docker compose up -d --build web`.
- **Parar todo**: `npm run local:down` (detiene contenedores y limpia redes; usa `npm run local:down:reset` para borrar volúmenes incluyendo la base de datos).
- **Estado del stack**: `npm run local:status` muestra una tabla con los contenedores y ejecuta health checks contra Postgres, Kong, Auth (GoTrue), PostgREST, Realtime, Edge Runtime y Studio.
  - `npm run local:status:wait` bloquea hasta 60s esperando a que Postgres y PostgREST estén listos — pensado para encadenar con migraciones (`local:up` ya lo usa internamente).
  - `npm run local:status:json` devuelve salida estructurada para scripting/CI.
  - Códigos de salida: `0` = Postgres + Kong + Auth + PostgREST listos (puedes migrar); `1` = falta algún servicio crítico → revisa la sección **Troubleshooting** y `docker compose logs <servicio>`.

### 11.6 Producción interna

Para exponer el stack más allá de `localhost`:

1. Publica la SPA y Kong detrás de un reverse proxy con TLS (Caddy/Traefik/nginx).
2. Cambia `SITE_URL` y `PUBLIC_SUPABASE_URL` en `.env` al dominio real (ej. `https://team-flow.tuempresa.local`).
3. Rebuild sólo el SPA para reinyectar las variables: `docker compose up -d --build web`.
4. Restringe el puerto `5432` a la red interna (o elimina el mapeo `ports:` del servicio `db`).
5. Rota `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` y `ADO_PAT_ENC_KEY` antes del primer uso real.

---

## 12. Troubleshooting

Errores frecuentes al desplegar en local, agrupados por capa. Antes de bucear en cada uno, mira siempre primero:

```bash
docker compose ps                      # ¿todo healthy?
docker compose logs -f <servicio>      # auth | rest | realtime | functions | kong | db | web
```

### 12.1 Auth (GoTrue)

| Síntoma | Causa habitual | Solución |
|---------|----------------|----------|
| `Invalid login credentials` inmediato tras registrarse | `GOTRUE_MAILER_AUTOCONFIRM=false` y el correo no se confirma (no hay SMTP local). | Deja `GOTRUE_MAILER_AUTOCONFIRM=true` en `.env` para instalación interna, o configura SMTP (`GOTRUE_SMTP_*`). |
| `redirect_to is not allowed` al iniciar sesión | `SITE_URL` / `GOTRUE_URI_ALLOW_LIST` no incluyen el dominio real desde el que abres la SPA. | Actualiza `SITE_URL` en `.env`, `docker compose up -d auth` y rebuild del `web`. |
| `Unsupported provider: google` | Sólo hay email/password configurado. | Añade el proveedor en la config de GoTrue o quita el botón de Google del login. |
| `JWSError` / `signature verification failed` en `rest`/`realtime` | `JWT_SECRET` distinto entre servicios. | El **mismo** `JWT_SECRET` debe estar en `auth`, `rest`, `realtime` y en los JWT de `ANON_KEY` / `SERVICE_ROLE_KEY`. Regenera claves si dudas. |
| `over_email_send_rate_limit` (429) | Límite horario de emails de auth. | Sube el límite temporalmente o espera 1 h; en local suele venir de bucles de test. |

### 12.2 RLS y Data API (PostgREST)

| Síntoma | Causa | Solución |
|---------|-------|----------|
| `permission denied for table <x>` desde el cliente, pero `psql` como `postgres` funciona | Falta `GRANT` para `anon` / `authenticated` sobre la tabla `public.<x>`. | Ejecuta los `GRANT` explícitos: `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<x> TO authenticated; GRANT ALL ON public.<x> TO service_role;` y sólo `GRANT SELECT ... TO anon` si la política lo permite. |
| Consultas devuelven **array vacío** sin error | RLS activa pero ninguna policy coincide con `auth.uid()`. | Revisa policies con `SELECT * FROM pg_policies WHERE tablename='<x>';`. Verifica que el JWT lleva el `sub` correcto (inspecciona en <https://jwt.io>). |
| `new row violates row-level security policy` al insertar | La fila no cumple `WITH CHECK`. Muy típico: falta enviar `user_id = auth.uid()`. | Añade `user_id` en el `insert` desde el cliente o marca la columna como `default auth.uid()` y `NOT NULL`. |
| El primer admin no ve nada en `/settings` | No hay fila en `public.user_roles` con `role='admin'` para su `user_id`. | `INSERT INTO public.user_roles (user_id, role) VALUES ('<uuid>', 'admin');` |
| Cambios en policies no surten efecto | PostgREST cachea el esquema. | `docker compose restart rest` o `NOTIFY pgrst, 'reload schema';` desde `psql`. |

### 12.3 CORS

| Síntoma | Causa | Solución |
|---------|-------|----------|
| `CORS policy: No 'Access-Control-Allow-Origin' header` al llamar a `/functions/v1/...` | Falta el handler `OPTIONS` o `corsHeaders` en la respuesta de la Edge Function. | Añade en la función: responde a `req.method === 'OPTIONS'` con `corsHeaders` y espárcelos en **todas** las respuestas (incluidos errores). |
| Preflight OK pero la petición real falla con CORS | `Access-Control-Allow-Headers` no incluye alguna cabecera enviada (`authorization`, `content-type`, `apikey`, `x-client-info`). | Amplía `Access-Control-Allow-Headers` en la función para cubrir todas las cabeceras del cliente. |
| CORS falla sólo tras poner un reverse proxy con dominio nuevo | El proxy elimina cabeceras o el dominio no está en la lista. | Configura el proxy para preservar cabeceras `Authorization`/`apikey` y usa `Access-Control-Allow-Origin: *` sólo si no envías cookies. |

### 12.4 Edge Functions (`tfs-pat-vault`, `ado-public-connection`)

| Síntoma | Causa | Solución |
|---------|-------|----------|
| `500 Internal Server Error` al desplegar/arrancar | `deno.lock` incompatible o import remoto caído (esm.sh). | Elimina `deno.lock` y reinicia (`docker compose restart functions`). Prefiere imports `npm:` sobre `https://esm.sh`. |
| `Missing ADO_PAT_ENC_KEY` en logs | La variable no se propagó al contenedor `functions`. | Confirma que está en `docker/.env` y relanza con `docker compose up -d functions`. |
| `Invalid key length` al cifrar/descifrar PATs | `ADO_PAT_ENC_KEY` no mide 32 bytes (64 chars hex). | Regenera con `openssl rand -hex 32`. **Aviso:** cualquier PAT ya cifrado con la clave antigua queda irrecuperable — vuelve a introducirlo desde Settings. |
| `401 Unauthorized` al llamar a la función desde la SPA | La petición no lleva el JWT del usuario (`Authorization: Bearer ...`) y `VERIFY_JWT=true`. | El stack local usa `VERIFY_JWT: "false"` a propósito: cada función valida la sesión en su propio código y `ado-public-connection` es pública para que los visitantes vean los datos sin login. Si lo pones en `true`, los visitantes sin sesión verán un error de conexión con TFS. |
| Error de conexión con TFS sin iniciar sesión | El contenedor `functions` no sirve `ado-public-connection` (falta el enrutador `supabase/functions/main`), o `VERIFY_JWT` está en `true`. | Asegúrate de tener `supabase/functions/main/index.ts` y `VERIFY_JWT: "false"`, y relanza `docker compose up -d functions`. |
| Datos vacíos o `permission denied` sin iniciar sesión | Faltan migraciones: la última añade lectura anónima a equipos, miembros, ausencias, handovers, temas, notas y versiones de épicas. | Aplica **todas** las migraciones de `supabase/migrations/` en orden. |
| Error de TFS solo para visitantes (el admin sí ve datos) | `ADO_PAT_ENC_KEY` en `docker/.env` no es la misma clave con la que se cifró el PAT, así que el descifrado falla. | Usa exactamente la misma clave, o vuelve a guardar el PAT desde Ajustes con la clave actual. |
| Función no aparece en Kong (`404 no Route matched`) | El nombre en `supabase/functions/<name>` no coincide con la ruta llamada. | Verifica ruta `/functions/v1/<name>` y reinicia `functions` + `kong`. |

### 12.5 Red y TFS on‑premise

| Síntoma | Causa | Solución |
|---------|-------|----------|
| "TFS network unreachable (is the ROSEN VPN on?)" en la UI | El navegador (o el contenedor `functions` si haces proxy) no llega al TFS interno. | Activa la VPN corporativa. Si quieres exponer la SPA sin VPN, mete un proxy inverso hacia TFS en la misma red del contenedor. |
| Certificado TFS self‑signed rechazado por la Edge Function | Deno no confía en la CA interna. | Monta la CA en el contenedor `functions` y arranca con `DENO_CERT=/path/ca.pem`. |

### 12.6 Frontend (Vite + nginx)

| Síntoma | Causa | Solución |
|---------|-------|----------|
| Página en blanco tras `docker compose up`, consola: `Cannot read properties of undefined (reading 'auth')` | El build se hizo sin `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`. | Confirma que las variables están en `docker/.env` y rebuild: `docker compose up -d --build web`. |
| `404 Not Found` al refrescar una ruta profunda (ej. `/tasks`) | Falta fallback SPA en nginx. | Ya incluido en `docker/nginx.conf` (`try_files $uri /index.html;`). Si usas otro proxy, replica esta regla. |
| CSS/JS con hash devuelve 304 pero la app queda desactualizada tras deploy | Cache agresiva en el navegador o proxy intermedio. | Ya usamos hashes en `assets/`. Fuerza `Ctrl+Shift+R` una vez y verifica que el proxy no cachea `index.html`. |

### 12.7 Base de datos

| Síntoma | Causa | Solución |
|---------|-------|----------|
| `role "authenticator" does not exist` al arrancar `rest` | Se levantó `rest` contra una DB vacía sin las migraciones/roles de Supabase. | Usa la imagen `supabase/postgres` (ya trae los roles) o aplica el bootstrap de Supabase antes de las migraciones del proyecto. |
| Migraciones fallan con `permission denied for schema public` | Ejecutas como usuario no privilegiado. | Corre las migraciones como `postgres`: `docker compose exec -T db psql -U postgres -d postgres < <archivo>`. |
| Datos perdidos tras `docker compose down` | Añadiste `-v` y borraste el volumen. | Restaura con `pg_dump` previo. Automatiza backups (sección 11.5). |

### 12.8 Setup inicial y variables de entorno

Errores comunes mientras se ejecuta `make setup`, `make env` o el primer `make dev-up`.

| Síntoma | Causa habitual | Solución |
|---------|----------------|----------|
| `make env` no genera `ANON_KEY` / `SERVICE_ROLE_KEY` | Falta `node` o `openssl` en PATH, o `JWT_SECRET` no se generó. | Instala Node.js 20+ y openssl. Revisa que `scripts/setup-env.sh` no devuelva errores rojos. |
| `JWTSecretInvalid` / `invalid token` / `JWSError` en el navegador o en `rest` | `ANON_KEY` y `SERVICE_ROLE_KEY` no fueron firmados con el mismo `JWT_SECRET` que usa GoTrue/PostgREST. | Ejecuta `make env` de nuevo para regenerar el trío (`JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`) o verifica que `docker/.env` tenga el mismo `JWT_SECRET` en `auth`, `rest`, `realtime` y en los JWT. |
| `Cannot read properties of undefined (reading 'auth')` al abrir la SPA | `VITE_SUPABASE_URL` o `VITE_SUPABASE_PUBLISHABLE_KEY` no están en el bundle. | Asegúrate de que `docker/.env` tenga `VITE_SUPABASE_PUBLISHABLE_KEY` igual al `ANON_KEY` local, y reconstruye el contenedor `web`: `make dev-down && make dev-up` o `make dev-restart-svc S=web`. |
| `Failed to connect to postgres` / `connection refused` al arrancar | Postgres aún no está listo o el puerto `5432` está ocupado por otro servicio. | Espera 10-20 s; si persiste, revisa `make ps`. Si hay otro Postgres local, cámbialo o cambia el mapeo de puertos en `docker/docker-compose.yml`. |
| `bind: address already in use` para `8000`, `8080` o `3001` | Otro proceso ocupa el puerto. | Identifica el proceso con `lsof -i :8000` (o `netstat -ano` en Windows) y deténlo, o cambia los puertos en `docker/.env` (`KONG_HTTP_PORT`, `STUDIO_PORT`, y el mapeo del servicio `web`). |
| `authentication failed for user "postgres"` | `POSTGRES_PASSWORD` en `docker/.env` no coincide con la contraseña ya inicializada en el volumen. | Si los datos son descartables, ejecuta `make dev-down` y borra el volumen: `docker compose -f docker/docker-compose.yml --env-file docker/.env down -v`, luego `make dev-up`. Si no, restablece la contraseña en el contenedor. |
| `Missing ADO_PAT_ENC_KEY` en los logs de `functions` | `ADO_PAT_ENC_KEY` no está definida o no tiene 64 caracteres hex. | Ejecuta `make env` o genera una con `openssl rand -hex 32`. Luego `make dev-restart-svc S=functions`. |
| El setup automático sobrescribe mis valores de producción | `scripts/setup-env.sh` solo reemplaza placeholders `CAMBIAR_*`, pero si los valores reales coinciden con el patrón se cambiarían. | Revisa `.env` y `docker/.env` antes de ejecutar el script en producción. En producción, edita las variables a mano en lugar de usar `make env`. |
| `docker compose` no reconoce el comando | Docker Compose v1 (`docker-compose`) en lugar de v2 (`docker compose`). | Actualiza Docker Desktop o Docker Engine a 24+ con Compose plugin. En Linux alternativamente crea un alias: `alias docker-compose='docker compose'`. |
| `docker/.env` no existe y `make dev-up` falla | No se ejecutó `make env` previamente. | Corre `make env` primero para copiar `docker/.env.example` → `docker/.env` y generar secretos. |

Si tras seguir la tabla el problema persiste, comparte el bloque de `docker compose logs` del servicio afectado y la petición/respuesta (URL, método, status y payload) para diagnosticar más a fondo.

---

## 13. Automatización con Make / npm

El [`Makefile`](./Makefile) de la raíz agrupa todas las tareas locales. Cada target tiene también su alias en `package.json` para quien prefiera `npm run …`.

### 13.1 Ver todos los targets

```bash
make help
```

### 13.2 Ciclo típico end‑to‑end

```bash
make setup              # copia .env.example → .env  + docker/.env  + instala deps
make keys               # imprime valores aleatorios para pegar en docker/.env
# … edita docker/.env (POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY,
#   REALTIME_SECRET_KEY_BASE, ADO_PAT_ENC_KEY) …
make bootstrap          # up -d --build + espera DB + migraciones + seed
```

Al acabar verás:

```text
SPA     → http://localhost:8080
API     → http://localhost:8000
Studio  → http://localhost:3001
```

### 13.3 Targets disponibles

| Categoría | `make …` | `npm run …` | Qué hace |
|-----------|----------|-------------|----------|
| Setup | `setup` | `setup` | `.env` + `docker/.env` + `bun install` |
| Setup | `keys` | `keys` | Genera secretos aleatorios con `openssl` |
| Frontend | `dev` | `dev` | Vite dev server |
| Frontend | `build` / `test` / `lint` | `build` / `test` / `lint` | Build, tests y lint |
| Stack | `up` / `down` / `restart` / `ps` | `stack:up` / `stack:down` | Control del `docker-compose` |
| Stack | `logs S=<svc>` | `stack:logs` | Sigue logs de un servicio (`auth`, `functions`…) |
| Stack | `bootstrap` | `stack:bootstrap` | One‑shot: up + migraciones + seed |
| Dev Docker | `dev-up` | `dev:up` | Levanta el entorno de desarrollo en background (`docker compose up -d --build`) |
| Dev Docker | `dev-down` | `dev:down` | Detiene el entorno de desarrollo |
| Dev Docker | `dev-restart` | `dev:restart` | Reinicia todos los servicios del entorno |
| Dev Docker | `dev-restart-svc S=<svc>` | `dev:restart:svc` | Reinicia un servicio específico (ej. `auth`, `functions`) |
| Dev Docker | `dev-logs` | `dev:logs` | Sigue logs de **todos** los servicios |
| Dev Docker | `dev-logs-svc S=<svc>` | `dev:logs:svc` | Sigue logs de un servicio específico |
| DB | `db-migrate` | `db:migrate` | Aplica `supabase/migrations/*.sql` en orden |
| DB | `db-seed` | `db:seed` | Carga `supabase/seed.sql` (2 equipos + 3 miembros + 1 ausencia) |
| DB | `db-reset` | `db:reset` | ⚠ Borra el volumen y rehace todo |
| DB | `db-shell` | `db:shell` | `psql` interactivo |
| DB | `db-backup` | `db:backup` | Vuelca a `backups/backup_<fecha>.sql` |
| DB | `db-restore F=…` | — | Restaura un backup concreto |
| Functions | `functions-logs` | — | Logs del Edge Runtime (`tfs-pat-vault`, `ado-public-connection`) |

### 13.4 Seed de datos

`supabase/seed.sql` es idempotente (`ON CONFLICT DO NOTHING`) — puedes reejecutarlo sin duplicar. **No** crea usuarios de Auth; regístrate en la SPA y luego promuévete a admin:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('<uuid_del_usuario_recien_registrado>', 'admin');
```

Amplía el seed con datos propios (más equipos, handovers, work topics) manteniendo la estructura `ON CONFLICT` para que siga siendo replicable.

### 13.5 Reiniciar servicios y ver logs del entorno de desarrollo

Durante el desarrollo local es normal tener que reiniciar un servicio o inspeccionar logs. El `Makefile` expone comandos específicos para ambas tareas sin tener que recordar la ruta del `docker-compose.yml` ni el `--env-file`.

#### Levantar el entorno de desarrollo

El primer arranque —o tras cambiar imágenes/Dockerfile— debe incluir build:

```bash
make dev-up       # docker compose up -d --build
# o
npm run dev:up
```

Esto levanta **todos** los servicios del `docker/docker-compose.yml` en background. Si solo quieres ver el estado:

```bash
make ps           # o: docker compose -f docker/docker-compose.yml --env-file docker/.env ps
```

#### Reiniciar servicios

- **Todos los servicios** (útil tras cambiar variables en `docker/.env` o imágenes base):

  ```bash
  make dev-restart
  # o
  npm run dev:restart
  ```

- **Un solo servicio** (más rápido y selectivo). Ejemplos comunes:

  ```bash
  make dev-restart-svc S=auth       # GoTrue / autenticación
  make dev-restart-svc S=functions  # Edge Runtime
  make dev-restart-svc S=rest       # PostgREST
  make dev-restart-svc S=db         # Postgres (⚠ corta conexiones activas)
  make dev-restart-svc S=kong       # API gateway
  ```

  Alias con npm:

  ```bash
  npm run dev:restart:svc -- auth
  ```

> Nota: si modificas `docker/.env`, un `restart` no es suficiente para algunos servicios que leen la variable en tiempo de arranque. En ese caso usa `make dev-down && make dev-up` o `make dev-restart-svc S=<svc>` para el contenedor afectado.

#### Ver logs

- **Todos los servicios a la vez** (útil en el primer arranque o para detectar qué contenedor falla):

  ```bash
  make dev-logs
  # o
  npm run dev:logs
  ```

- **Un solo servicio** (recomendado una vez identificado el área):

  ```bash
  make dev-logs-svc S=auth
  make dev-logs-svc S=functions
  make dev-logs-svc S=rest
  make dev-logs-svc S=db
  make dev-logs-svc S=web
  ```

  Alias con npm:

  ```bash
  npm run dev:logs:svc -- functions
  ```

Para salir de los logs, pulsa `Ctrl+C`. El flag `-f` (follow) sigue la salida en tiempo real; si prefieres ver las últimas líneas sin seguir, usa `docker compose -f docker/docker-compose.yml --env-file docker/.env logs --tail=100 <servicio>`.

#### Flujo típico de debugging

```bash
# 1. Comprobar que todo está corriendo
make ps

# 2. Si algo no responde, ver logs de todos
make dev-logs

# 3. Identificar el servicio problemático (p. ej. auth) y reiniciarlo
make dev-restart-svc S=auth
make dev-logs-svc S=auth

# 4. Si cambió una variable de entorno, bajar y volver a subir
make dev-down && make dev-up
```

---

## 14. Integración continua (CI) antes de desplegar

El pipeline vive en `.github/workflows/ci.yml` y se ejecuta en cada push y pull
request contra `main`, además de manualmente (`workflow_dispatch`).

### 14.1 Jobs

| Job | Comando | Bloquea el deploy |
|-----|---------|-------------------|
| `lint` | `bun run lint` (ESLint) | Sí |
| `typecheck` | `bunx tsc --noEmit -p tsconfig.app.json` | Sí |
| `test` | `bunx vitest run` (29 suites) | Sí |
| `build` | `bun run build` + sube el artefacto `dist` | Sí |
| `audit` | `bun audit --audit-level=high` | No (informativo) |
| `deploy` | Descarga `dist`, verifica y publica | — |

`lint`, `typecheck`, `test` y `build` corren en paralelo. El job `deploy`
declara `needs: [lint, typecheck, test, build]`, así que solo arranca si los
cuatro terminan en verde, y además exige `push` sobre `main` (los pull requests
nunca despliegan).

### 14.2 Variables y secretos del repositorio

El build de Vite necesita las variables `VITE_*` presentes. El workflow usa
valores de ejemplo por defecto y los sobrescribe con secrets si existen:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Configúralos en *Settings → Secrets and variables → Actions*. Para el paso de
publicación añade también las credenciales de tu destino (por ejemplo
`SSH_PRIVATE_KEY`, `DEPLOY_HOST`). Nunca pongas `SERVICE_ROLE_KEY` ni
`ADO_PAT_ENC_KEY` en el workflow del frontend: son secretos de backend.

El job `deploy` usa `environment: production`, de modo que puedes exigir
aprobación manual en *Settings → Environments → production*.

### 14.3 Adaptar el paso de despliegue

El último paso es un placeholder. Sustitúyelo por tu destino real, por ejemplo:

```yaml
- name: Publish to internal server
  run: rsync -az --delete dist/ deploy@teamflow.intranet.rosen.local:/var/www/teamflow/
```

Recuerda que los cambios de base de datos no van en este workflow: aplica las
migraciones (sección 5) antes de publicar un frontend que dependa de tablas
nuevas.

### 14.4 Reproducir el CI en local

```bash
bun install --frozen-lockfile
bun run lint
bunx tsc --noEmit -p tsconfig.app.json
bunx vitest run
bun run build
```

Si estos cinco comandos pasan en tu máquina, el pipeline pasará también.
