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
- **Parar todo**: `docker compose down` (añade `-v` para borrar también la base de datos).

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

### 12.4 Edge Functions (`tfs-pat-vault`)

| Síntoma | Causa | Solución |
|---------|-------|----------|
| `500 Internal Server Error` al desplegar/arrancar | `deno.lock` incompatible o import remoto caído (esm.sh). | Elimina `deno.lock` y reinicia (`docker compose restart functions`). Prefiere imports `npm:` sobre `https://esm.sh`. |
| `Missing ADO_PAT_ENC_KEY` en logs | La variable no se propagó al contenedor `functions`. | Confirma que está en `docker/.env` y relanza con `docker compose up -d functions`. |
| `Invalid key length` al cifrar/descifrar PATs | `ADO_PAT_ENC_KEY` no mide 32 bytes (64 chars hex). | Regenera con `openssl rand -hex 32`. **Aviso:** cualquier PAT ya cifrado con la clave antigua queda irrecuperable — vuelve a introducirlo desde Settings. |
| `401 Unauthorized` al llamar a la función desde la SPA | La petición no lleva el JWT del usuario (`Authorization: Bearer ...`) y `VERIFY_JWT=true`. | Usa `supabase.functions.invoke(...)` (adjunta el token automáticamente) o pon la cabecera manualmente. |
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

Si tras seguir la tabla el problema persiste, comparte el bloque de `docker compose logs` del servicio afectado y la petición/respuesta (URL, método, status y payload) para diagnosticar más a fondo.
