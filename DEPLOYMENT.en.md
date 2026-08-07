# Deployment Guide — Local installation

This guide describes how to deploy **ROSEN CUSW Team Flow** on a local infrastructure (on-premise or self-hosted), replacing **Lovable Cloud** with equivalent services that you can operate yourself.

The application is a React + Vite SPA that today uses Lovable Cloud (managed Supabase) for authentication, database, Edge Functions and secrets. To run everything locally you need to replicate those four blocks.

---

## 1. Target architecture

```text
┌────────────────────────┐        ┌──────────────────────────┐
│  Browser (React SPA)   │──HTTPS▶│  Reverse proxy (nginx)   │
└────────────────────────┘        │  - / → static dist/     │
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

The browser queries the TFS/Azure DevOps **directly** (there is no proxy): the `ado-public-connection` Edge Function delivers the admin's shared configuration and, only with `data` scope, the decrypted PAT. The SPA caches the results in `sessionStorage` (15 min TTL and background refresh when less than 3 min remain) via `src/services/tfsResultCache.ts`.


Components to provide locally:

| Layer | Lovable Cloud | Recommended local alternative | Alternatives |
|------|---------------|-------------------------------|--------------|
| Database | Managed Postgres | **Supabase self-hosted** (Docker) | Plain Postgres + PostgREST |
| Auth | Supabase Auth (GoTrue) | **GoTrue** from the self-hosted stack | Keycloak, Authelia, self-hosted Auth0 |
| Edge Functions | Managed Deno Deploy | **`supabase functions serve`** or standalone Deno | Node/Express, on-prem Cloudflare Workers |
| Secrets | Lovable Cloud panel | Environment variables + encrypted `.env` / Vault | HashiCorp Vault, self-hosted Doppler |
| Storage (if used) | Supabase Storage | Self-hosted `storage-api` | MinIO, S3 compatible |
| SPA Hosting | Lovable CDN | nginx / Caddy / IIS with SPA fallback | Apache, Traefik |

**Supabase self-hosted** is recommended because it preserves 1:1 the schema, RLS, migrations (`supabase/migrations/*.sql`) and the already-written Edge Functions (`supabase/functions/tfs-pat-vault`, `supabase/functions/ado-public-connection` and the shared helper `supabase/functions/_shared/requireUser.ts`) without rewriting client code.

---

## 2. Prerequisites

- Linux (Ubuntu 22.04+ / RHEL 9+) or Windows Server 2022 with WSL2.
- Docker 24+ and Docker Compose v2.
- Node.js 20 LTS and `npm`/`bun` to build the frontend.
- TLS certificates (internal Let's Encrypt, ADCS, or self-signed for intranet).
- Network access to the on-premise TFS/Azure DevOps from the server where the Edge Functions will run.
- Open ports: `443` (SPA + API), `54321` (Supabase Kong, if exposed), `5432` (Postgres, internal only).

> 📄 **Environment variables**: use [`.env.example`](./.env.example) at the root as the single reference for all necessary variables (SPA + backend + Edge Function). For the Docker stack in section 11, also use [`docker/.env.example`](./docker/.env.example).

> ⚡ **Automation**: the root [`Makefile`](./Makefile) encapsulates setup, migrations, seed and startup. Start with `make help` (or `npm run setup` + `npm run stack:bootstrap`). See detail in section 13.




---

## 3. Database and Auth — Supabase self-hosted

### 3.1 Bring up the stack

```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
# Edit .env: change POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY,
# SERVICE_ROLE_KEY, SITE_URL, API_EXTERNAL_URL, SMTP_*
docker compose up -d
```

Verify at `http://<host>:8000` (Studio) that Postgres, Auth (GoTrue), PostgREST and Storage are up.

### 3.2 Apply project migrations

All migrations are versioned in `supabase/migrations/` with the pattern
`<YYYYMMDDHHMMSS>_<uuid>.sql`. **Alphabetical order is chronological order**, so it
suffices to apply them from first to last; each one is idempotent with respect to the
previous ones but **must not** be reordered or an already-applied migration edited.

```bash
# Option A: Supabase CLI (recommended)
npm i -g supabase
supabase db push --db-url postgres://postgres:<pwd>@<host>:5432/postgres

# Option B: direct psql, in order
for f in $(ls supabase/migrations/*.sql | sort); do
  echo "→ $f"
  psql "postgres://postgres:<pwd>@<host>:5432/postgres" -v ON_ERROR_STOP=1 -f "$f" || break
done

# Option C: this repo's Docker stack (applies all + seed)
make db-migrate        # or: npm run local:up
```

#### What the migrations create

| Object | Content |
| --- | --- |
| `teams`, `members` | Teams and people (text ids, `login_name` for matching with Azure DevOps) |
| `absences`, `handovers` | Absences and handovers (`topic_ids` as a text array) |
| `work_topics` | Work topics per member |
| `task_handover_notes` | Notes and checklist per task (`kind`, `done`, `author_id`) |
| `azure_devops_settings` | TFS connection per admin: encrypted PAT (`pat_encrypted`, `pat_iv`), bug and epic queries, area/iteration |
| `epic_versions` | Delivery version catalog (`name`, `color_key`, `sort_order`) |
| `epic_version_assignments` | Azure DevOps epic ↔ version relationship (unique per epic) |
| `user_roles` + `app_role` enum | User roles, with the `SECURITY DEFINER` function `has_role(uuid, app_role)` |

Each table includes in the same migration: `GRANT` to `authenticated` / `service_role`,
`ENABLE ROW LEVEL SECURITY`, policies (read access for authenticated users, write access
only for admin via `has_role`) and the `update_updated_at_column` trigger. The
`bugs_query_id` / `epics_query_id` validations are applied with the
`validate_bugs_query_id` and `validate_epics_query_id` triggers.

#### Verify that the migration was correct

```bash
psql "$DB_URL" -c "\dt public.*"
psql "$DB_URL" -c "select tablename, rowsecurity from pg_tables where schemaname='public';"
# All should have rowsecurity = t
psql "$DB_URL" -c "select tablename, count(*) from pg_policies where schemaname='public' group by 1;"
psql "$DB_URL" -c "select proname from pg_proc where pronamespace='public'::regnamespace;"
```

If a query from the SPA returns `permission denied for table X`, the `GRANT` is missing:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;
GRANT ALL ON public.<table> TO service_role;
```

#### Adding a new table

Create a new file (do not edit existing ones) with the same naming pattern and this
mandatory statement order:

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

Then regenerate the client types:

```bash
supabase gen types typescript --db-url "$DB_URL" > src/integrations/supabase/types.ts
```

#### Available database scripts

```bash
make db-migrate               # applies supabase/migrations/*.sql in order
make db-seed                  # loads supabase/seed.sql (teams, members and sample absence)
make db-reset                 # ⚠ deletes the volume, migrates and seeds again
make db-shell                 # interactive psql
make db-backup                # backups/backup_<date>.sql
make db-restore F=backups/x.sql
./scripts/local-up.sh --reset # reset + up + migrations + seed
./scripts/local-up.sh --no-seed
```

`supabase/seed.sql` is idempotent (`ON CONFLICT DO NOTHING`) and **does not** create users: after
registering, promote yourself to admin with
`INSERT INTO public.user_roles (user_id, role) VALUES ('<your-uuid>', 'admin');`.

Rollback: there are no reverse migrations. To roll back, restore the latest backup
(`make db-restore`) or run `make db-reset` if the data is disposable.


### 3.3 Configuring Auth

In Supabase Docker's `.env`:
- `GOTRUE_MAILER_AUTOCONFIRM=true` (avoids email confirmation on intranet) — or configure corporate SMTP.
- `GOTRUE_DISABLE_SIGNUP=false` while registering users; then switch to `true`.
- Create the first admin user from Studio and add the row in `public.user_roles` with `role = 'admin'`.

Alternative without Supabase Auth: **Keycloak**. Requires rewriting `src/context/AuthContext.tsx` and `src/integrations/supabase/client.ts` to use `keycloak-js` + custom JWT tokens in front of PostgREST. This is a major effort and is **not** recommended unless corporate policy requires it.

---

## 4. Edge Functions (`tfs-pat-vault`, `ado-public-connection`)

The `supabase/functions/tfs-pat-vault/index.ts` function encrypts/decrypts Azure DevOps PATs with AES-GCM and validates the caller's JWT.

### 4.1 Deploy with Supabase self-hosted

```bash
# From the repo root
supabase functions deploy tfs-pat-vault \
  --project-ref <local-project-ref> \
  --no-verify-jwt
# Mandatory secret (at least 32 characters):
supabase secrets set ADO_PAT_ENC_KEY="$(openssl rand -base64 48)"
```

Keep `ADO_PAT_ENC_KEY` safe: **if it is lost, all encrypted PATs will be unrecoverable** and users will have to re-enter them.

### 4.2 Alternative without Supabase Functions

If you're not using the Supabase runtime, you can run the function as a standalone Deno service:

```bash
deno run --allow-net --allow-env \
  supabase/functions/tfs-pat-vault/index.ts
```

Or port the file to **Node.js + Express** (replace `Deno.env` with `process.env`, `Deno.serve` with `app.listen`, and import `@supabase/supabase-js` from npm). Publish the service behind the reverse proxy at `/functions/v1/tfs-pat-vault`.

### 4.3 Shared connection `ado-public-connection`

The TFS proxy was removed: it did not work reliably against a segmented on-premise TFS. Instead, the `supabase/functions/ado-public-connection/index.ts` function publishes the admin's Azure DevOps configuration so that **any visitor** (with or without a session) sees the same data, querying TFS from the browser:

- `links` scope → returns only the metadata needed to build "open in Azure DevOps" links. It does **not** deliver the PAT.
- `data` scope → additionally returns the PAT decrypted with `ADO_PAT_ENC_KEY` to run read queries.
- Any other `scope` value is rejected with `400 Unsupported scope`.

Deployment and requirements:

```bash
supabase functions deploy ado-public-connection \
  --project-ref <local-project-ref> \
  --no-verify-jwt
```

Requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `ADO_PAT_ENC_KEY` in the function's environment. In the Docker stack this is already resolved (`VERIFY_JWT: "false"` + router `supabase/functions/main/index.ts`).

Recommended hardening:

- Use a PAT with **minimal permissions** (read-only for Work Items) and a short expiration; rotate it periodically.
- The client (`src/services/tfs.ts`) applies a read-only allowlist: `GET` to verified endpoints and `POST` only for WIQL queries.
- The cache (`src/services/tfsResultCache.ts`) reduces load on TFS; the refresh buttons force fresh data and saving settings invalidates the cache.

---

## 5. Frontend (SPA)

### 5.1 Environment variables

Create `.env.production` with the local values, or run the automated setup script
to generate `.env` (SPA) and `docker/.env` (self-hosted stack) with the minimum
necessary secrets:

```bash
bash scripts/setup-env.sh
# or
npm run setup:env
# or
make env
```

This script copies `.env.example` → `.env` and `docker/.env.example` → `docker/.env`, and
automatically generates: `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`,
`REALTIME_SECRET_KEY_BASE`, `POSTGRES_PASSWORD` and `ADO_PAT_ENC_KEY`. If the files
already exist, it only replaces the values that are still placeholders (`CAMBIAR_*`),
preserving the user's customizations.

For a manual build, create `.env.production` with:

```env
VITE_SUPABASE_URL="https://supabase.intranet.local"
VITE_SUPABASE_PUBLISHABLE_KEY="<ANON_KEY of the self-hosted stack>"
VITE_SUPABASE_PROJECT_ID="local"
```

These variables are **public** (they go into the bundle). The `SERVICE_ROLE_KEY` must never appear in the frontend.

### 5.2 Variable blocks in `.env.example`

The root `.env.example` file is the single template of variables for SPA development and, copied to `docker/.env`, for the self-hosted stack. Below is a description of what each block does and in which scenarios it is used.

| Block | Variables | What they do | When are they used? |
|---|---|---|---|
| 1. Frontend (Vite) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | Connect the SPA to the backend. They are public by design (they go into the browser bundle). | Whenever the frontend is built (dev and prod). |
| 2. Postgres | `POSTGRES_PASSWORD`, `DB_URL` | Postgres superuser credentials and connection string for the database scripts (`make db-*`). | Self-hosted only. Not used in the Vite bundle. |
| 3. Shared JWT | `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `REALTIME_SECRET_KEY_BASE` | Signing and validation of tokens between GoTrue, PostgREST, Realtime and Edge Functions. `JWT_SECRET` must be identical across all services. | Self-hosted only. `ANON_KEY` is public; `SERVICE_ROLE_KEY` is a backend secret. |
| 4. URLs and Auth | `SITE_URL`, `PUBLIC_SUPABASE_URL`, `API_EXTERNAL_URL`, `GOTRUE_DISABLE_SIGNUP`, `GOTRUE_MAILER_AUTOCONFIRM`, `GOTRUE_SMTP_*` | Authentication redirects, public URL of the API gateway, sign-up and email confirmation control. | Self-hosted only. Adjust `SITE_URL` to the actual domain from which the SPA is accessed. |
| 5. Edge Functions | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADO_PAT_ENC_KEY`, `VERIFY_JWT` | Injected by the Supabase runtime in managed production; in self-hosted they are defined in `docker/.env`. `ADO_PAT_ENC_KEY` encrypts Azure DevOps PATs. | `ADO_PAT_ENC_KEY` always (backend); `VERIFY_JWT=false` locally to allow the public `ado-public-connection`. |
| 6. Azure DevOps / TFS | `TFS_BASE_URL`, `PROXY_RATE_LIMIT_MAX_REQUESTS`, `PROXY_RATE_LIMIT_WINDOW_SECONDS` | Document the TFS environment and request limits on the shared connection. The actual connection is saved encrypted in the database. | Optional: documentation/cache variables; they do not replace the configuration at `/settings/azure-devops`. |

#### Scenarios

- **SPA development against an existing backend (e.g. Lovable Cloud):** you only need block 1. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Full self-hosted stack (Docker):** copy `.env.example` to `docker/.env` and fill in blocks 1 through 6. Block 1 is re-injected at build time into the `web` container.
- **Internal production:** rotate all secrets from blocks 2, 3, 5 and SMTP (4); `VITE_*` point to the API gateway domain.

#### Critical variables to protect

- **Never** in the frontend: `SERVICE_ROLE_KEY`, `JWT_SECRET`, `ADO_PAT_ENC_KEY`.
- **Back up in a secrets manager**: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ADO_PAT_ENC_KEY` (without the latter, encrypted PATs are unrecoverable and must be re-entered from `/settings`).
- **Public by design**: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (security comes from RLS, not from hiding these URLs).

### 5.3 Build

```bash
npm ci
npm run build     # generates dist/
```

### 5.4 Serve with SPA fallback

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

  # Proxy to Supabase self-hosted
  location /rest/       { proxy_pass http://supabase-kong:8000/rest/; }
  location /auth/       { proxy_pass http://supabase-kong:8000/auth/; }
  location /functions/  { proxy_pass http://supabase-kong:8000/functions/; }
  location /realtime/   { proxy_pass http://supabase-kong:8000/realtime/; }
}
```

**IIS** (Windows Server): enable URL Rewrite with the standard SPA rule (`<match url=".*" />` → `/index.html` when it's not an existing file/directory).

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

### 5.5 Quick verification checklist after setup

After running `make setup` + `make bootstrap` (or `npm run local:up`), confirm these points before considering the environment ready.

| # | Verification | Command / action | Expected result |
|---|---|---|---|
| 1 | **Containers up** | `make ps` or `npm run local:status` | All services `running`/`healthy`; none in `Restarting`. |
| 2 | **Connection to Postgres** | `docker compose --env-file docker/.env -f docker/docker-compose.yml exec -T db psql -U postgres -d postgres -c "select version();"` | Returns the PostgreSQL version without authentication errors. |
| 3 | **Migrations applied** | `docker compose --env-file docker/.env -f docker/docker-compose.yml exec -T db psql -U postgres -d postgres -c "\dt public.*"` | `absences`, `azure_devops_settings`, `epic_version_assignments`, `epic_versions`, `handovers`, `members`, `task_handover_notes`, `teams`, `user_roles`, `work_topics` exist. |
| 4 | **RLS active** | `docker compose --env-file docker/.env -f docker/docker-compose.yml exec -T db psql -U postgres -d postgres -c "select tablename, rowsecurity from pg_tables where schemaname='public' order by 1;"` | All public tables have `rowsecurity = t`. |
| 5 | **Policies present** | `docker compose --env-file docker/.env -f docker/docker-compose.yml exec -T db psql -U postgres -d postgres -c "select tablename, count(*) from pg_policies where schemaname='public' group by 1 order by 1;"` | Each public table has at least one policy. |
| 6 | **Auth roles** | `docker compose --env-file docker/.env -f docker/docker-compose.yml exec -T db psql -U postgres -d postgres -c "select rolname from pg_roles where rolname in ('anon','authenticated','service_role');"` | `anon`, `authenticated` and `service_role` exist. |
| 7 | **JWT coherent** | Try to register at `http://localhost:8080` | Sign-up/sign-in works without `JWSError` or `signature verification failed`. |
| 8 | **SPA loads** | Open `http://localhost:8080` | The app renders without `VITE_SUPABASE_URL` errors in the console. |
| 9 | **Edge Functions respond** | `curl -s -X POST http://localhost:8000/functions/v1/ado-public-connection -H "Content-Type: application/json" -d '{"scope":"links"}' \| head -c 200` | Responds with JSON (may be empty, but not `404`/`401`). |
| 10 | **TFS data visible** | Set the PAT at `/settings/azure-devops` and open `/tasks`, `/bugs`, `/epics`, `/waiting` | The views load items without network errors. |

If any step fails, check **section 12 (Troubleshooting)** for the matching symptom.

---

## 6. Initial data and roles

1. Register the first user from `/auth`.
2. In Studio (or via SQL): insert the admin role.

```sql
insert into public.user_roles (user_id, role)
values ('<user uuid>', 'admin');
```

3. Import existing data with **Data backup → Import JSON** from within the app.

---

## 7. Azure DevOps / TFS configuration

- Log in as admin at `/settings/azure-devops` (the route is restricted to admin via `AdminRoute`).
- Fill in Server URL, Collection, Project, Team and PAT (it is encrypted with `ADO_PAT_ENC_KEY`). Use a read-only Work Items PAT.
- Configure the query IDs: tasks, bugs (last 10 days, includes `Resolved` and `Closed` states) and epics.
- If the TFS is behind restrictive CORS, check the built-in guide (`TfsCorsGuideDialog`). Access is direct from the browser, so the team needs connectivity to the TFS (corporate VPN).
- Saving the settings invalidates the SPA's TFS results cache.

---

## 8. Summarized alternatives for local use

| Need | Alternative 1 (recommended) | Alternative 2 | Alternative 3 |
|-----------|-----------------------------|----------------|----------------|
| Full backend | Supabase self‑hosted (Docker) | Manual Postgres + PostgREST + GoTrue | Firebase Emulator (limited) |
| Auth | GoTrue self‑hosted | Keycloak (SAML/OIDC) | Authelia + corporate LDAP |
| PAT encryption | Edge Function with `ADO_PAT_ENC_KEY` | HashiCorp Vault Transit API | On-premise Azure Key Vault (HSM) |
| SPA hosting | nginx | Caddy (auto TLS) | IIS (Windows Server) |
| Emails (reset password) | Corporate SMTP (Exchange) | Postfix relay | Mailhog for dev |
| DB backups | Daily `pg_dump` + rsync | pgBackRest | Barman |
| Observability | Supabase Studio + `docker logs` | Grafana + Loki + Prometheus | ELK stack |

---

## 9. Backups and maintenance

```bash
# Daily backup
pg_dump -Fc "postgres://postgres:<pwd>@db:5432/postgres" \
  -f /backups/teamflow_$(date +%F).dump

# Restore
pg_restore -d "postgres://postgres:<pwd>@db:5432/postgres" \
  --clean --if-exists /backups/teamflow_YYYY-MM-DD.dump
```

Schedule with `cron` or Task Scheduler. Keep offsite copies and rotate at least 30 days.

Updates:
1. `git pull` the repo.
2. New migrations → `supabase db push`.
3. `npm ci && npm run build` and reload nginx.
4. Redeploy Edge Functions if they change.

---

## 10. Final checklist

- [ ] Postgres + Supabase self‑hosted up and accessible only from the internal network.
- [ ] Migrations applied without errors (`supabase/migrations/*.sql`).
- [ ] `ADO_PAT_ENC_KEY` generated, stored in a secrets manager and backed up.
- [ ] `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` point to the local stack.
- [ ] SPA served with fallback to `index.html`.
- [ ] Valid TLS on the reverse proxy.
- [ ] First admin user created in `user_roles`.
- [ ] Automated backup tested with a trial restore.
- [ ] SPA ↔ Supabase ↔ TFS connectivity verified end‑to‑end (with and without session).
- [ ] `ado-public-connection` responds to the `links` and `data` scopes, and rejects other values.
- [ ] Tasks, Bugs, Epics and Waiting views load data and the 15-minute cache works.
- [ ] `/settings` accessible only to the admin user.

---

## 11. Complete installation with Docker Compose (all‑in‑one)

In the [`docker/`](./docker) folder there is a ready-made stack to bring up the SPA + Supabase self‑hosted + Edge Functions with a single command.

### 11.1 Contents

| File | Description |
|---------|-------------|
| `docker/docker-compose.yml` | Orchestrates Postgres, GoTrue (Auth), PostgREST, Realtime, Kong (API gateway), Edge Runtime, Studio and the SPA. |
| `docker/.env.example` | Template with all variables (passwords, JWT, API keys, `ADO_PAT_ENC_KEY`, public URLs). |
| `docker/kong.yml` | API gateway routes (`/auth/v1`, `/rest/v1`, `/realtime/v1`, `/functions/v1`). |
| `docker/Dockerfile` | Multi-stage build of the SPA (Bun + Vite → nginx). |
| `docker/nginx.conf` | nginx config with SPA fallback and security headers. |

### 11.2 Requirements

- Docker Engine ≥ 24 and Docker Compose v2.
- 4 GB RAM and 5 GB free disk space.
- `openssl` (to generate secrets) and `bash`.

### 11.3 Step by step

1. **Clone the repo** and place yourself at the project root.
2. **Prepare the `.env`**:
   ```bash
   cd docker
   cp .env.example .env
   ```
3. **Generate the secrets** and paste them into `.env`:
   ```bash
   openssl rand -hex 32   # POSTGRES_PASSWORD
   openssl rand -hex 32   # JWT_SECRET
   openssl rand -hex 64   # REALTIME_SECRET_KEY_BASE
   openssl rand -hex 32   # ADO_PAT_ENC_KEY
   ```
4. **Generate `ANON_KEY` and `SERVICE_ROLE_KEY`** (JWTs signed with `JWT_SECRET`) following the official guide: <https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys>. Paste both into `.env`.
5. **Bring up the stack**:
   ```bash
   docker compose --env-file .env up -d --build
   ```
   The first SPA build takes 2‑3 min. Check with `docker compose ps` that all services are `healthy`.
6. **Apply the migrations** (once, in alphabetical order):
   ```bash
   for f in ../supabase/migrations/*.sql; do
     docker compose exec -T db psql -U postgres -d postgres < "$f"
   done
   ```
7. **Create the first admin user**:
   - Register at <http://localhost:8080> (Auth with autoconfirm enabled in `.env.example`).
   - In Studio (<http://localhost:3001>) or via `psql`, insert the role:
     ```sql
     INSERT INTO public.user_roles (user_id, role)
     VALUES ('<user_uuid>', 'admin');
     ```
8. **Configure Azure DevOps** from within the app (Settings → PAT + RODAT / Software scopes).

### 11.4 Local endpoints

| Service | URL |
|----------|-----|
| SPA | http://localhost:8080 |
| API gateway (Supabase) | http://localhost:8000 |
| Studio (DB admin) | http://localhost:3001 |
| Postgres | localhost:5432 (user `postgres`) |

### 11.5 Operation

- **Logs**: `docker compose logs -f <service>` (e.g. `functions`, `auth`).
- **DB backup**: `docker compose exec db pg_dump -U postgres postgres > backup_$(date +%F).sql`.
- **Restore**: `cat backup.sql | docker compose exec -T db psql -U postgres -d postgres`.
- **Update the SPA**: `docker compose up -d --build web`.
- **Stop everything**: `npm run local:down` (stops containers and cleans networks; use `npm run local:down:reset` to delete volumes including the database).
- **Stack status**: `npm run local:status` shows a table with the containers and runs health checks against Postgres, Kong, Auth (GoTrue), PostgREST, Realtime, Edge Runtime and Studio.
  - `npm run local:status:wait` blocks up to 60s waiting for Postgres and PostgREST to be ready — intended to chain with migrations (`local:up` already uses it internally).
  - `npm run local:status:json` returns structured output for scripting/CI.
  - Exit codes: `0` = Postgres + Kong + Auth + PostgREST ready (you can migrate); `1` = a critical service is missing → check the **Troubleshooting** section and `docker compose logs <service>`.

### 11.6 Internal production

To expose the stack beyond `localhost`:

1. Publish the SPA and Kong behind a reverse proxy with TLS (Caddy/Traefik/nginx).
2. Change `SITE_URL` and `PUBLIC_SUPABASE_URL` in `.env` to the real domain (e.g. `https://team-flow.yourcompany.local`).
3. Rebuild only the SPA to reinject the variables: `docker compose up -d --build web`.
4. Restrict port `5432` to the internal network (or remove the `ports:` mapping from the `db` service).
5. Rotate `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` and `ADO_PAT_ENC_KEY` before first real use.

---

## 12. Troubleshooting

Frequent errors when deploying locally, grouped by layer. Before diving into each one, always check first:

```bash
docker compose ps                      # is everything healthy?
docker compose logs -f <service>      # auth | rest | realtime | functions | kong | db | web
```

### 12.1 Auth (GoTrue)

| Symptom | Common cause | Solution |
|---------|----------------|----------|
| `Invalid login credentials` immediately after signing up | `GOTRUE_MAILER_AUTOCONFIRM=false` and the email is not confirmed (no local SMTP). | Leave `GOTRUE_MAILER_AUTOCONFIRM=true` in `.env` for internal installation, or configure SMTP (`GOTRUE_SMTP_*`). |
| `redirect_to is not allowed` when signing in | `SITE_URL` / `GOTRUE_URI_ALLOW_LIST` do not include the real domain from which you open the SPA. | Update `SITE_URL` in `.env`, `docker compose up -d auth` and rebuild `web`. |
| `Unsupported provider: google` | Only email/password is configured. | Add the provider in GoTrue's config or remove the Google button from the login. |
| `JWSError` / `signature verification failed` in `rest`/`realtime` | `JWT_SECRET` differs between services. | The **same** `JWT_SECRET` must be present in `auth`, `rest`, `realtime` and in the `ANON_KEY` / `SERVICE_ROLE_KEY` JWTs. Regenerate keys if in doubt. |
| `over_email_send_rate_limit` (429) | Hourly auth email limit. | Temporarily raise the limit or wait 1 h; locally it usually comes from test loops. |

### 12.2 RLS and Data API (PostgREST)

| Symptom | Cause | Solution |
|---------|-------|----------|
| `permission denied for table <x>` from the client, but `psql` as `postgres` works | Missing `GRANT` for `anon` / `authenticated` on the `public.<x>` table. | Run the explicit `GRANT`s: `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<x> TO authenticated; GRANT ALL ON public.<x> TO service_role;` and only `GRANT SELECT ... TO anon` if the policy allows it. |
| Queries return an **empty array** with no error | RLS active but no policy matches `auth.uid()`. | Check policies with `SELECT * FROM pg_policies WHERE tablename='<x>';`. Verify that the JWT carries the correct `sub` (inspect at <https://jwt.io>). |
| `new row violates row-level security policy` on insert | The row doesn't satisfy `WITH CHECK`. Very typical: forgetting to send `user_id = auth.uid()`. | Add `user_id` on `insert` from the client or set the column to `default auth.uid()` and `NOT NULL`. |
| The first admin sees nothing in `/settings` | There is no row in `public.user_roles` with `role='admin'` for their `user_id`. | `INSERT INTO public.user_roles (user_id, role) VALUES ('<uuid>', 'admin');` |
| Policy changes have no effect | PostgREST caches the schema. | `docker compose restart rest` or `NOTIFY pgrst, 'reload schema';` from `psql`. |

### 12.3 CORS

| Symptom | Cause | Solution |
|---------|-------|----------|
| `CORS policy: No 'Access-Control-Allow-Origin' header` when calling `/functions/v1/...` | Missing `OPTIONS` handler or `corsHeaders` in the Edge Function response. | Add to the function: respond to `req.method === 'OPTIONS'` with `corsHeaders` and spread them in **all** responses (including errors). |
| Preflight OK but the real request fails with CORS | `Access-Control-Allow-Headers` doesn't include some header sent (`authorization`, `content-type`, `apikey`, `x-client-info`). | Expand `Access-Control-Allow-Headers` in the function to cover all client headers. |
| CORS only fails after adding a reverse proxy with a new domain | The proxy strips headers or the domain isn't in the list. | Configure the proxy to preserve `Authorization`/`apikey` headers and use `Access-Control-Allow-Origin: *` only if you're not sending cookies. |

### 12.4 Edge Functions (`tfs-pat-vault`, `ado-public-connection`)

| Symptom | Cause | Solution |
|---------|-------|----------|
| `500 Internal Server Error` on deploy/start | Incompatible `deno.lock` or a remote import is down (esm.sh). | Delete `deno.lock` and restart (`docker compose restart functions`). Prefer `npm:` imports over `https://esm.sh`. |
| `Missing ADO_PAT_ENC_KEY` in logs | The variable wasn't propagated to the `functions` container. | Confirm it's present in `docker/.env` and relaunch with `docker compose up -d functions`. |
| `Invalid key length` when encrypting/decrypting PATs | `ADO_PAT_ENC_KEY` is not 32 bytes (64 hex chars). | Regenerate with `openssl rand -hex 32`. **Warning:** any PAT already encrypted with the old key becomes unrecoverable — re-enter it from Settings. |
| `401 Unauthorized` when calling the function from the SPA | The request doesn't carry the user's JWT (`Authorization: Bearer ...`) and `VERIFY_JWT=true`. | The local stack purposely uses `VERIFY_JWT: "false"`: each function validates the session in its own code and `ado-public-connection` is public so that visitors can see the data without logging in. If you set it to `true`, visitors without a session will see a connection error with TFS. |
| Connection error with TFS without signing in | The `functions` container doesn't serve `ado-public-connection` (missing the `supabase/functions/main` router), or `VERIFY_JWT` is `true`. | Make sure you have `supabase/functions/main/index.ts` and `VERIFY_JWT: "false"`, and relaunch `docker compose up -d functions`. |
| Empty data or `permission denied` without signing in | Missing migrations: the latest one adds anonymous read access to teams, members, absences, handovers, topics, notes and epic versions. | Apply **all** migrations from `supabase/migrations/` in order. |
| TFS error only for visitors (the admin does see data) | `ADO_PAT_ENC_KEY` in `docker/.env` isn't the same key used to encrypt the PAT, so decryption fails. | Use exactly the same key, or re-save the PAT from Settings with the current key. |
| Function doesn't appear in Kong (`404 no Route matched`) | The name in `supabase/functions/<name>` doesn't match the called route. | Verify the route `/functions/v1/<name>` and restart `functions` + `kong`. |

### 12.5 Network and on‑premise TFS

| Symptom | Cause | Solution |
|---------|-------|----------|
| "TFS network unreachable (is the ROSEN VPN on?)" in the UI | The browser (or the `functions` container if you proxy) can't reach the internal TFS. | Turn on the corporate VPN. If you want to expose the SPA without VPN, put a reverse proxy towards TFS on the same network as the container. |
| Self‑signed TFS certificate rejected by the Edge Function | Deno doesn't trust the internal CA. | Mount the CA into the `functions` container and start with `DENO_CERT=/path/ca.pem`. |

### 12.6 Frontend (Vite + nginx)

| Symptom | Cause | Solution |
|---------|-------|----------|
| Blank page after `docker compose up`, console: `Cannot read properties of undefined (reading 'auth')` | The build was done without `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`. | Confirm the variables are in `docker/.env` and rebuild: `docker compose up -d --build web`. |
| `404 Not Found` on refreshing a deep route (e.g. `/tasks`) | Missing SPA fallback in nginx. | Already included in `docker/nginx.conf` (`try_files $uri /index.html;`). If you use another proxy, replicate this rule. |
| Hashed CSS/JS returns 304 but the app remains outdated after deploy | Aggressive caching in the browser or an intermediate proxy. | We already use hashes in `assets/`. Force `Ctrl+Shift+R` once and verify that the proxy doesn't cache `index.html`. |

### 12.7 Database

| Symptom | Cause | Solution |
|---------|-------|----------|
| `role "authenticator" does not exist` when starting `rest` | `rest` was started against an empty DB without Supabase's migrations/roles. | Use the `supabase/postgres` image (it already includes the roles) or apply the Supabase bootstrap before the project's migrations. |
| Migrations fail with `permission denied for schema public` | You're running as a non-privileged user. | Run the migrations as `postgres`: `docker compose exec -T db psql -U postgres -d postgres < <file>`. |
| Data lost after `docker compose down` | You added `-v` and deleted the volume. | Restore from a previous `pg_dump`. Automate backups (section 11.5). |

### 12.8 Initial setup and environment variables

Common errors while running `make setup`, `make env` or the first `make dev-up`.

| Symptom | Common cause | Solution |
|---------|----------------|----------|
| `make env` doesn't generate `ANON_KEY` / `SERVICE_ROLE_KEY` | `node` or `openssl` missing from PATH, or `JWT_SECRET` wasn't generated. | Install Node.js 20+ and openssl. Check that `scripts/setup-env.sh` doesn't return red errors. |
| `JWTSecretInvalid` / `invalid token` / `JWSError` in the browser or in `rest` | `ANON_KEY` and `SERVICE_ROLE_KEY` weren't signed with the same `JWT_SECRET` used by GoTrue/PostgREST. | Run `make env` again to regenerate the trio (`JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`) or verify that `docker/.env` has the same `JWT_SECRET` in `auth`, `rest`, `realtime` and in the JWTs. |
| `Cannot read properties of undefined (reading 'auth')` when opening the SPA | `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` aren't in the bundle. | Make sure `docker/.env` has `VITE_SUPABASE_PUBLISHABLE_KEY` equal to the local `ANON_KEY`, and rebuild the `web` container: `make dev-down && make dev-up` or `make dev-restart-svc S=web`. |
| `Failed to connect to postgres` / `connection refused` on startup | Postgres isn't ready yet or port `5432` is taken by another service. | Wait 10-20 s; if it persists, check `make ps`. If you have another local Postgres, change it or change the port mapping in `docker/docker-compose.yml`. |
| `bind: address already in use` for `8000`, `8080` or `3001` | Another process is using the port. | Identify the process with `lsof -i :8000` (or `netstat -ano` on Windows) and stop it, or change the ports in `docker/.env` (`KONG_HTTP_PORT`, `STUDIO_PORT`, and the `web` service mapping). |
| `authentication failed for user "postgres"` | `POSTGRES_PASSWORD` in `docker/.env` doesn't match the password already initialized in the volume. | If the data is disposable, run `make dev-down` and delete the volume: `docker compose -f docker/docker-compose.yml --env-file docker/.env down -v`, then `make dev-up`. If not, reset the password inside the container. |
| `Missing ADO_PAT_ENC_KEY` in `functions` logs | `ADO_PAT_ENC_KEY` isn't defined or doesn't have 64 hex characters. | Run `make env` or generate one with `openssl rand -hex 32`. Then `make dev-restart-svc S=functions`. |
| The automatic setup overwrites my production values | `scripts/setup-env.sh` only replaces `CAMBIAR_*` placeholders, but if the real values match the pattern they would be changed. | Review `.env` and `docker/.env` before running the script in production. In production, edit the variables by hand instead of using `make env`. |
| `docker compose` doesn't recognize the command | Docker Compose v1 (`docker-compose`) instead of v2 (`docker compose`). | Update Docker Desktop or Docker Engine to 24+ with the Compose plugin. On Linux you can alternatively create an alias: `alias docker-compose='docker compose'`. |
| `docker/.env` doesn't exist and `make dev-up` fails | `make env` wasn't run beforehand. | Run `make env` first to copy `docker/.env.example` → `docker/.env` and generate secrets. |

If after following the table the problem persists, share the `docker compose logs` block for the affected service and the request/response (URL, method, status and payload) for further diagnosis.

### 12.9 Verification checklist failures (containers, migrations, RLS and JWT roles)

Ordered the same way as the checklist in section 5.5: if a point fails, look here for the typical cause and apply the fix steps.

#### 12.9.1 Containers

| Symptom | Typical cause | Fix steps |
|---------|--------------|---------------------|
| `make ps` shows a service as `Exited (1)` | Required environment variable empty or malformed in `docker/.env`. | 1) `make dev-logs-svc S=<service>` and read the last 30 lines. 2) Fix the flagged variable. 3) `make dev-restart-svc S=<service>`. |
| A service stays in a `Restarting` loop | Dependency not ready (usually `db`) or crash on startup. | 1) Check `db` first: `docker compose -f docker/docker-compose.yml --env-file docker/.env exec -T db pg_isready -U postgres`. 2) Once `db` responds, `make dev-restart-svc S=<service>`. |
| `db` healthy but `rest`/`auth` don't respond via Kong | Kong started before the upstreams and cached DNS. | `make dev-restart-svc S=kong` and repeat the checklist. |
| I changed `docker/.env` and it's not applied | Compose doesn't reread the environment with a simple restart. | `make dev-down && make dev-up` (recreates the containers). For the frontend, the build is also redone: the `VITE_*` are injected at build time. |
| `no space left on device` | Old accumulated volumes and images. | `docker system prune` and, if the data is disposable, `docker volume prune`. |

#### 12.9.2 Migrations

| Symptom | Typical cause | Fix steps |
|---------|--------------|---------------------|
| A checklist table doesn't exist | The migration that creates it wasn't applied or failed halfway. | 1) `make db-shell` → `\dt public.*`. 2) Reapply in order: `for f in supabase/migrations/*.sql; do docker compose -f docker/docker-compose.yml --env-file docker/.env exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < "$f"; done`. 3) Check the first error that appears; the following ones are usually a consequence. |
| `relation "…" already exists` | Migration re-run without `IF NOT EXISTS`. | Harmless if the object is already correct. For a clean, reproducible state use `make db-reset` (section 17). |
| `permission denied for schema public` | Running as a non-privileged role. | Always run with `-U postgres` inside the `db` container. |
| The migration order breaks | Files without a timestamp prefix. | Rename the file with the pattern `<timestamp>_<description>.sql`; the shell expands them alphabetically and the timestamp guarantees order. |
| Migrations OK but the SPA still shows the old schema | Outdated generated types or PostgREST with cached schema. | 1) `make dev-restart-svc S=rest` (reloads the schema cache). 2) Reload the SPA with a clean cache. |

#### 12.9.3 RLS and policies

| Symptom | Typical cause | Fix steps |
|---------|--------------|---------------------|
| `rowsecurity = f` on some table in `public` | Missing `ALTER TABLE … ENABLE ROW LEVEL SECURITY` from the migration. | `ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;` and add the statement to the corresponding migration so it's reproducible. |
| The table returns `[]` for a valid user | RLS active but no read policy applies to that role. | 1) List the policies: `SELECT tablename, policyname, roles, cmd FROM pg_policies WHERE schemaname='public';`. 2) Check that a `SELECT` policy exists for `authenticated`. |
| `new row violates row-level security policy` on write | The ownership column isn't filled with the authenticated user, or `WITH CHECK` is missing. | Ensure the insert sends the `user_id` of the logged-in user and that the `INSERT` policy has a `WITH CHECK` consistent with the `SELECT`'s `USING`. |
| `infinite recursion detected in policy` | The policy queries the same table it's applied to. | Extract the check into a `SECURITY DEFINER` function (e.g. `public.has_role`) and use it in the policy. |
| An unauthenticated visitor sees data they shouldn't | There's a permissive policy for `anon` or a `GRANT SELECT … TO anon`. | 1) Check `pg_policies` filtering by `roles`. 2) Remove the `anon` policy and run `REVOKE SELECT ON public.<table> FROM anon;`. |

#### 12.9.4 JWT role permissions

| Symptom | Typical cause | Fix steps |
|---------|--------------|---------------------|
| `permission denied for table <table>` (even though RLS allows it) | Missing Data API `GRANT`s on the table. | `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;` and `GRANT ALL ON public.<table> TO service_role;`. Add `GRANT SELECT … TO anon` only if the table should be public. |
| `JWSError` / `invalid signature` on any call | `ANON_KEY` signed with a different `JWT_SECRET` than PostgREST/GoTrue's. | Regenerate the trio with `make env` and recreate the containers (`make dev-down && make dev-up`). See section 16. |
| `role "anon" does not exist` | The DB doesn't have Supabase's base roles. | Use the `supabase/postgres` image (it includes them) or apply the role bootstrap before the project's migrations. |
| The JWT doesn't carry the expected role (`role` missing or `anon` while logged in) | The client sends `apikey` but not `Authorization: Bearer <access_token>`. | Always use the client from `@/integrations/supabase/client`; don't build manual fetches against the Data API. |
| A logged-in user doesn't see admin actions | They have no row in `public.user_roles` with `role = 'admin'`. | `INSERT INTO public.user_roles (user_id, role) VALUES ('<uuid>', 'admin') ON CONFLICT DO NOTHING;` (get the uuid with `SELECT id, email FROM auth.users;`). |
| An Edge Function writes but gets an RLS error | `ANON_KEY` is being used instead of `SUPABASE_SERVICE_ROLE_KEY`, or sign-in was done on the service client. | Create a separate client with `SUPABASE_SERVICE_ROLE_KEY` for privileged writes and don't run login on it. |

Quick diagnostic commands:

```bash
# RLS active per table
make db-shell -c "\
  SELECT relname, relrowsecurity FROM pg_class c \
  JOIN pg_namespace n ON n.oid=c.relnamespace \
  WHERE n.nspname='public' AND c.relkind='r' ORDER BY relname;"

# Existing policies
make db-shell -c "SELECT tablename, policyname, roles, cmd FROM pg_policies WHERE schemaname='public' ORDER BY tablename;"

# Grants per role
make db-shell -c "\
  SELECT table_name, grantee, string_agg(privilege_type, ',') AS privs \
  FROM information_schema.role_table_grants \
  WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role') \
  GROUP BY 1,2 ORDER BY 1,2;"
```

---

## 13. Automation with Make / npm

The [`Makefile`](./Makefile) at the root groups all local tasks. Each target also has its alias in `package.json` for those who prefer `npm run …`.

### 13.1 View all targets

```bash
make help
```

### 13.2 Typical end‑to‑end cycle

```bash
make setup              # copies .env.example → .env  + docker/.env  + installs deps
make keys               # prints random values to paste into docker/.env
# … edit docker/.env (POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY,
#   REALTIME_SECRET_KEY_BASE, ADO_PAT_ENC_KEY) …
make bootstrap          # up -d --build + wait for DB + migrations + seed
```

When it finishes you'll see:

```text
SPA     → http://localhost:8080
API     → http://localhost:8000
Studio  → http://localhost:3001
```

### 13.3 Available targets

| Category | `make …` | `npm run …` | What it does |
|-----------|----------|-------------|----------|
| Setup | `setup` | `setup` | `.env` + `docker/.env` + `bun install` |
| Setup | `keys` | `keys` | Generates random secrets with `openssl` |
| Frontend | `dev` | `dev` | Vite dev server |
| Frontend | `build` / `test` / `lint` | `build` / `test` / `lint` | Build, tests and lint |
| Stack | `up` / `down` / `restart` / `ps` | `stack:up` / `stack:down` | Control of `docker-compose` |
| Stack | `logs S=<svc>` | `stack:logs` | Follows the logs of a service (`auth`, `functions`…) |
| Stack | `bootstrap` | `stack:bootstrap` | One‑shot: up + migrations + seed |
| Dev Docker | `dev-up` | `dev:up` | Starts the development environment in the background (`docker compose up -d --build`) |
| Dev Docker | `dev-down` | `dev:down` | Stops the development environment |
| Dev Docker | `dev-restart` | `dev:restart` | Restarts all environment services |
| Dev Docker | `dev-restart-svc S=<svc>` | `dev:restart:svc` | Restarts a specific service (e.g. `auth`, `functions`) |
| Dev Docker | `dev-logs` | `dev:logs` | Follows the logs of **all** services |
| Dev Docker | `dev-logs-svc S=<svc>` | `dev:logs:svc` | Follows the logs of a specific service |
| DB | `db-migrate` | `db:migrate` | Applies `supabase/migrations/*.sql` in order |
| DB | `db-seed` | `db:seed` | Loads `supabase/seed.sql` (2 teams + 3 members + 1 absence) |
| DB | `db-reset` | `db:reset` | ⚠ Deletes the volume and rebuilds everything |
| DB | `db-shell` | `db:shell` | Interactive `psql` |
| DB | `db-backup` | `db:backup` | Dumps to `backups/backup_<date>.sql` |
| DB | `db-restore F=…` | — | Restores a specific backup |
| Functions | `functions-logs` | — | Edge Runtime logs (`tfs-pat-vault`, `ado-public-connection`) |

### 13.4 Data seed

`supabase/seed.sql` is idempotent (`ON CONFLICT DO NOTHING`) — you can re-run it without duplicating. It does **not** create Auth users; sign up in the SPA and then promote yourself to admin:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('<uuid_of_recently_registered_user>', 'admin');
```

Extend the seed with your own data (more teams, handovers, work topics) while keeping the `ON CONFLICT` structure so it remains replicable.

### 13.5 Restarting services and viewing development environment logs

During local development it's normal to need to restart a service or inspect logs. The `Makefile` exposes specific commands for both tasks without having to remember the `docker-compose.yml` path or `--env-file`.

#### Starting the development environment

The first startup —or after changing images/Dockerfile— should include a build:

```bash
make dev-up       # docker compose up -d --build
# or
npm run dev:up
```

This starts **all** services from `docker/docker-compose.yml` in the background. If you just want to see the status:

```bash
make ps           # or: docker compose -f docker/docker-compose.yml --env-file docker/.env ps
```

#### Restarting services

- **All services** (useful after changing variables in `docker/.env` or base images):

  ```bash
  make dev-restart
  # or
  npm run dev:restart
  ```

- **A single service** (faster and more selective). Common examples:

  ```bash
  make dev-restart-svc S=auth       # GoTrue / authentication
  make dev-restart-svc S=functions  # Edge Runtime
  make dev-restart-svc S=rest       # PostgREST
  make dev-restart-svc S=db         # Postgres (⚠ cuts active connections)
  make dev-restart-svc S=kong       # API gateway
  ```

  Alias with npm:

  ```bash
  npm run dev:restart:svc -- auth
  ```

> Note: if you modify `docker/.env`, a `restart` is not enough for some services that read the variable at startup time. In that case use `make dev-down && make dev-up` or `make dev-restart-svc S=<svc>` for the affected container.

#### Viewing logs

- **All services at once** (useful on first startup or to detect which container fails):

  ```bash
  make dev-logs
  # or
  npm run dev:logs
  ```

- **A single service** (recommended once the area is identified):

  ```bash
  make dev-logs-svc S=auth
  make dev-logs-svc S=functions
  make dev-logs-svc S=rest
  make dev-logs-svc S=db
  make dev-logs-svc S=web
  ```

  Alias with npm:

  ```bash
  npm run dev:logs:svc -- functions
  ```

To exit the logs, press `Ctrl+C`. The `-f` (follow) flag follows the output in real time; if you prefer to see the last lines without following, use `docker compose -f docker/docker-compose.yml --env-file docker/.env logs --tail=100 <service>`.

#### Typical debugging workflow

```bash
# 1. Check that everything is running
make ps

# 2. If something isn't responding, view logs of all
make dev-logs

# 3. Identify the problematic service (e.g. auth) and restart it
make dev-restart-svc S=auth
make dev-logs-svc S=auth

# 4. If an environment variable changed, bring down and back up
make dev-down && make dev-up
```

---

## 14. Continuous integration (CI) before deploying

The pipeline lives in `.github/workflows/ci.yml` and runs on every push and pull
request against `main`, as well as manually (`workflow_dispatch`).

### 14.1 Jobs

| Job | Command | Blocks the deploy |
|-----|---------|-------------------|
| `lint` | `bun run lint` (ESLint) | Yes |
| `typecheck` | `bunx tsc --noEmit -p tsconfig.app.json` | Yes |
| `test` | `bunx vitest run` (29 suites) | Yes |
| `build` | `bun run build` + uploads the `dist` artifact | Yes |
| `audit` | `bun audit --audit-level=high` | No (informational) |
| `deploy` | Downloads `dist`, verifies and publishes | — |

`lint`, `typecheck`, `test` and `build` run in parallel. The `deploy` job
declares `needs: [lint, typecheck, test, build]`, so it only starts if the
four finish green, and it also requires a `push` on `main` (pull requests
never deploy).

### 14.2 Repository variables and secrets

The Vite build needs the `VITE_*` variables present. The workflow uses
example values by default and overrides them with secrets if they exist:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Configure them in *Settings → Secrets and variables → Actions*. For the
publishing step also add the credentials of your destination (for example
`SSH_PRIVATE_KEY`, `DEPLOY_HOST`). Never put `SERVICE_ROLE_KEY` or
`ADO_PAT_ENC_KEY` in the frontend workflow: they are backend secrets.

The `deploy` job uses `environment: production`, so you can require
manual approval in *Settings → Environments → production*.

### 14.3 Adapting the deployment step

The last step is a placeholder. Replace it with your real destination, for example:

```yaml
- name: Publish to internal server
  run: rsync -az --delete dist/ deploy@teamflow.intranet.rosen.local:/var/www/teamflow/
```

Remember that database changes do not go in this workflow: apply the
migrations (section 5) before publishing a frontend that depends on new
tables.

### 14.4 Reproducing the CI locally

```bash
bun install --frozen-lockfile
bun run lint
bunx tsc --noEmit -p tsconfig.app.json
bunx vitest run
bun run build
```

If these five commands pass on your machine, the pipeline will pass too.

---

## 15. Deployment to staging and production

This section describes the recommended flow for publishing the application in two controlled environments: **staging** (pre-validation) and **production** (actual team use). The guide assumes the backend is already deployed following sections 3 and 11, and that the CI pipeline (section 14) is active.

> ⚠️ Fundamental principle: **database changes are applied before the frontend**. If you publish an SPA that depends on a table or column that doesn't yet exist in the backend, users will see read/write errors.

### 15.1 Environments and roles

| Environment | Purpose | Branch | Manual approval |
|---------|-----------|------|-------------------|
| `staging` | Validate migrations, TFS integration and translations before touching production | `main` or `release/*` | Optional |
| `production` | Stable version used by the team | `main` (only tagged commits) | Recommended (`environment: production` in CI) |

For each environment you need:

- A backend with its own database and secrets (ideally separate instances; if you use the same stack, at least a different `docker/.env`).
- A frontend build `.env` file with the `VITE_*` variables pointing to that environment's backend.
- Access to TFS/Azure DevOps from the backend network (Edge Functions) and from the users' network (browser, which calls TFS directly).

### 15.2 Configuring environment variables per environment

Create two files outside of version control, one per environment. Both derive from `.env.example` (section 5.2):

```bash
.env.staging
.env.production
```

#### Frontend: required variables

```bash
# .env.staging / .env.production
VITE_SUPABASE_URL=https://teamflow-api-staging.intranet.rosen.local
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
VITE_SUPABASE_PROJECT_ID=rosen-team-flow-staging
```

> **Key difference from local development**: `VITE_SUPABASE_URL` points to the environment's public API gateway URL (Kong, Supabase or reverse proxy), **not** to `localhost:8000`.

#### Backend (self-hosted): `docker/.env` variables

```bash
# docker/.env.staging / docker/.env.production
POSTGRES_PASSWORD=<minimum 24 chars, unique per environment>
JWT_SECRET=<minimum 32 chars, unique per environment>
ANON_KEY=<JWT signed with this JWT_SECRET>
SERVICE_ROLE_KEY=<JWT signed with this JWT_SECRET>
REALTIME_SECRET_KEY_BASE=<64 random chars>
SITE_URL=https://teamflow-staging.intranet.rosen.local
PUBLIC_SUPABASE_URL=https://teamflow-api-staging.intranet.rosen.local
ADO_PAT_ENC_KEY=<64 hex chars, unique per environment; back it up in a vault>
GOTRUE_DISABLE_SIGNUP=false   # close it after onboarding the team
GOTRUE_MAILER_AUTOCONFIRM=true
```

> 🔐 **Never reuse `JWT_SECRET`, `ADO_PAT_ENC_KEY` or database keys between staging and production**. If one environment is leaked, the other must remain isolated.

### 15.3 Staging deployment flow

1. **Prepare the version**

   ```bash
   git checkout main
   git pull origin main
   git tag -a v1.4.0-rc.1 -m "Staging candidate v1.4.0-rc.1"
   git push origin v1.4.0-rc.1
   ```

2. **Apply database migrations**

   ```bash
   export DB_URL=postgres://postgres:<pwd>@db-staging:5432/postgres
   make db-migrate DB_URL=$DB_URL
   # or with Supabase CLI:
   # supabase db push --db-url "$DB_URL"
   ```

3. **Verify the backend**

   ```bash
   curl -sf https://teamflow-api-staging.intranet.rosen.local/rest/v1/
   curl -sf https://teamflow-api-staging.intranet.rosen.local/functions/v1/ado-public-connection/links
   ```

   The second endpoint should return `200` even without authentication (it's the public shared-configuration read endpoint).

4. **Build the frontend**

   ```bash
   bun install --frozen-lockfile
   cp .env.staging .env
   bun run build
   ```

   Vite injects the values from `.env` into the bundle. Verify that the `dist` doesn't contain `localhost` URLs:

   ```bash
   rg -F "localhost" dist/ || echo "OK: no local references"
   ```

5. **Publish to the staging server**

   ```bash
   rsync -az --delete dist/ deploy@teamflow-staging.intranet.rosen.local:/var/www/teamflow/
   # or deployment to internal S3/bucket:
   # aws s3 sync dist/ s3://teamflow-staging-static/ --delete
   ```

6. **Run the verification checklist (section 15.5)**.

### 15.4 Production deployment flow

Repeat the staging steps with `production` and add:

1. **Sign-up lockdown**: if the team is already onboarded, set `GOTRUE_DISABLE_SIGNUP=true` in `docker/.env.production` and restart the `auth` service.

2. **Admin promotion (first time only)**

   Sign up in the application from the browser, get your user UUID and promote yourself to admin:

   ```sql
   psql "$DB_URL_PROD" -c "INSERT INTO public.user_roles (user_id, role) VALUES ('<your-uuid>', 'admin');"
   ```

3. **Configure the TFS connection from `/settings`** with the read-only Azure DevOps service account.

4. **Enable automatic backups** of the database:

   ```bash
   make db-backup DB_URL="$DB_URL_PROD"  # manual; automate with cron/systemd
   ```

5. **Publish with the CI artifact** instead of building locally:

   ```bash
   # Download the `dist` artifact from the CI workflow and sync it:
   rsync -az --delete dist/ deploy@teamflow.intranet.rosen.local:/var/www/teamflow/
   ```

### 15.5 Final verification checklist

Before considering a deployment good, run these checks.

#### Backend / database

- [ ] `VITE_SUPABASE_URL` responds with `200` at `/rest/v1/`.
- [ ] All Docker services are `healthy` (`docker compose ps`).
- [ ] Public tables have RLS enabled (`rowsecurity = t`).
- [ ] There is at least one admin user in `public.user_roles`.
- [ ] `GOTRUE_DISABLE_SIGNUP` is set to `true` in production after the initial onboarding.
- [ ] The `/functions/v1/ado-public-connection/links` endpoint returns JSON without error.
- [ ] The `/functions/v1/ado-public-connection/data` endpoint rejects requests without the proper scope (try calling it directly with `curl`, it should return 403 or 400).

#### Frontend

- [ ] The SPA loads at `https://teamflow[-staging].intranet.rosen.local` without 404 errors.
- [ ] There are no references to `localhost` in the production bundle.
- [ ] Login works with the admin user.
- [ ] The read-only pages (`/tasks`, `/bugs`, `/epics`, `/waiting`) show TFS data for unauthenticated or non-admin authenticated users.
- [ ] `/settings` is only accessible to the admin user.
- [ ] Write actions (creating an absence, saving a PAT, assigning a version to an epic) are hidden or disabled for non-admins.
- [ ] The application shows the selected language (es/en) with no untranslated labels.

#### TFS / Azure DevOps

- [ ] The Tasks page shows bugs and tasks with their states (Open, Closed, Resolved, In Progress, etc.).
- [ ] The **Changed date** and **Closed date** columns are rendered in `DD/MM/YYYY` format.
- [ ] The TFS cache (`sessionStorage`) reduces requests: open the browser console, refresh the page and check that identical calls aren't repeated within less than 15 min.
- [ ] The refresh button forces a new request and updates the data.

#### Security

- [ ] `SERVICE_ROLE_KEY` and `ADO_PAT_ENC_KEY` do not appear in the source code or in the `web` container logs.
- [ ] Security headers (`Content-Security-Policy`, `X-Frame-Options`, etc.) are present in the nginx response.
- [ ] `bun audit --audit-level=high` doesn't report unresolved critical vulnerabilities.

### 15.6 Rollback

If the deployment fails:

1. **Frontend**: go back to the last stable `dist` with your deployment system's backup (rsync, versioned S3, etc.).
2. **Backend / data**: restore the latest database backup:

   ```bash
   make db-restore F=backups/backup_20260806_120000.sql DB_URL="$DB_URL"
   ```

3. **Edge Functions**: if the failure is in a function, it's enough to restart the `functions` service after fixing the code:

   ```bash
   make dev-restart-svc S=functions
   ```

4. **Environment variables**: if the issue is a wrong value in `.env`, fix it, rebuild the `web` container and restart:

   ```bash
   docker compose --env-file docker/.env -f docker/docker-compose.yml up -d --build web
   ```

---

## 16. Secret rotation and regeneration

This section explains how to rotate `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` and
`ADO_PAT_ENC_KEY` without breaking the development environment, and which files
need to be updated in each case (`.env` at the root and `docker/.env`).

### 16.1 Secret map and where each one lives

| Secret | File(s) | Consumers | Independent rotation |
|---|---|---|---|
| `JWT_SECRET` | `docker/.env` | `auth`, `rest`, `realtime`, `storage`, `functions` (Kong/GoTrue sign and validate JWTs) | No: forces `ANON_KEY` and `SERVICE_ROLE_KEY` to be regenerated |
| `ANON_KEY` | `docker/.env` + `.env` (`VITE_SUPABASE_PUBLISHABLE_KEY`) | Gateway and frontend (public client) | No: must be signed with the current `JWT_SECRET` |
| `SERVICE_ROLE_KEY` | `docker/.env` | Edge Functions and administrative scripts | No: signed with the current `JWT_SECRET` |
| `ADO_PAT_ENC_KEY` | `docker/.env` (Edge Functions secret) | `tfs-pat-vault`, `ado-public-connection` | Yes, but invalidates already-encrypted PATs |

Golden rule: **`JWT_SECRET`, `ANON_KEY` and `SERVICE_ROLE_KEY` form an atomic
trio**. If you change the first one, the other two must be regenerated in the
same operation; otherwise all requests will respond with `401 invalid JWT`.

### 16.2 Rotate the JWT trio (`JWT_SECRET` + `ANON_KEY` + `SERVICE_ROLE_KEY`)

The `scripts/setup-env.sh` script already generates the three values
consistently (it signs the JWTs with the new `JWT_SECRET` and synchronizes the
`ANON_KEY` with the frontend). To rotate them, simply clear the current values
and run it again:

```bash
# 1. Back up the environment files
cp .env .env.bak && cp docker/.env docker/.env.bak

# 2. Mark the three values for regeneration
sed -i \
  -e 's/^JWT_SECRET=.*/JWT_SECRET=CAMBIAR_JWT_SECRET/' \
  -e 's/^ANON_KEY=.*/ANON_KEY=CAMBIAR_ANON_KEY/' \
  -e 's/^SERVICE_ROLE_KEY=.*/SERVICE_ROLE_KEY=CAMBIAR_SERVICE_ROLE_KEY/' \
  docker/.env

sed -i 's/^VITE_SUPABASE_PUBLISHABLE_KEY=.*/VITE_SUPABASE_PUBLISHABLE_KEY=CAMBIAR_ANON_KEY/' .env

# 3. Regenerate (only touches the CAMBIAR_* values)
npm run setup:env       # or: make env

# 4. Apply to the stack: services read the variables on startup
make dev-down && make dev-up
```

Verification:

```bash
# The gateway must accept the new ANON_KEY
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "apikey: $(grep '^ANON_KEY=' docker/.env | cut -d= -f2)" \
  http://localhost:8000/rest/v1/teams?select=id
# 200 → correct | 401 → the ANON_KEY does not match the JWT_SECRET
```

> Expected side effect: **all active sessions are invalidated**. Log out and
> log back in from the browser (or clear `localStorage`) after the rotation.
> Users, passwords and data are not lost.

### 16.3 Rotate only `ANON_KEY` or `SERVICE_ROLE_KEY`

This only makes sense if the `JWT_SECRET` is still valid (for example, the
public key was leaked in a repository). You need to sign the new token with
the current `JWT_SECRET`:

```bash
JWT_SECRET=$(grep '^JWT_SECRET=' docker/.env | cut -d= -f2) \
node -e '
const crypto = require("crypto");
const secret = process.env.JWT_SECRET;
const role = process.argv[1];            // anon | service_role
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const head = b64({ alg: "HS256", typ: "JWT" });
const body = b64({ role, iss: "supabase", iat: now, exp: now + 60 * 60 * 24 * 365 * 10 });
const sig = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
console.log(`${head}.${body}.${sig}`);
' anon
```

Then update the value:

- `ANON_KEY` → in `docker/.env` **and** in `.env` as `VITE_SUPABASE_PUBLISHABLE_KEY`
  (they must be identical; otherwise the frontend will get `401`).
- `SERVICE_ROLE_KEY` → only in `docker/.env`.

And restart the affected services:

```bash
make dev-restart-svc S=kong
make dev-restart-svc S=functions
```

### 16.4 Rotate `ADO_PAT_ENC_KEY`

This key encrypts Azure DevOps PATs with AES‑256‑GCM. **Rotating it makes
already-saved PATs unreadable**, so the procedure includes re-entering the
token from the UI.

```bash
# 1. Generate a new 32-byte key (64 hex)
NEW_KEY=$(openssl rand -hex 32)

# 2. Update docker/.env
sed -i "s/^ADO_PAT_ENC_KEY=.*/ADO_PAT_ENC_KEY=${NEW_KEY}/" docker/.env

# 3. Restart the Edge Functions so they pick up the new secret
make dev-restart-svc S=functions
```

Then, in the application:

1. Log in with the admin account in **Settings → Azure DevOps**.
2. Paste the PAT again and save: it will be encrypted with the new key.
3. Check that the **Tasks**, **Bugs** and **Epics** views load data.

If you prefer to avoid a service outage, decrypt and re-encrypt before
rotating: save the PAT in a password manager, rotate the key and re-enter it
immediately from the UI.

> In Lovable Cloud, `ADO_PAT_ENC_KEY` is not in any file: it is managed as a
> project secret. Rotation consists of updating the secret and repeating steps
> 1-3 above.

### 16.5 Rotation checklist

- [ ] Backup of `.env` and `docker/.env` made before touching anything.
- [ ] If `JWT_SECRET` changed: `ANON_KEY` and `SERVICE_ROLE_KEY` regenerated in the same pass.
- [ ] `ANON_KEY` identical in `docker/.env` and in `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`.
- [ ] Stack restarted (`make dev-down && make dev-up`) or specific services with `make dev-restart-svc`.
- [ ] Frontend rebuilt if any `VITE_*` variable changed.
- [ ] Browser session renewed (logout / clear `localStorage`).
- [ ] If `ADO_PAT_ENC_KEY` changed: PAT re-entered and TFS views verified.
- [ ] `.env.bak` / `docker/.env.bak` files removed once confirmed everything works.

---

## 17. Resetting the local database and recovering state

Guide for the local environment with Docker Compose (project `rosen-team-flow`,
data volume `rosen-team-flow_db-data`).

### 17.1 Before resetting: save what you can

```bash
make db-backup          # → backups/backup_<date>.sql
```

A backup takes seconds and is the only way to recover data after a
`down -v`. Always do it, even if you think the database is corrupted: a
partial dump is usually better than nothing.

### 17.2 Full reset (deletes all data)

```bash
make db-reset
```

This target does, in order: `docker compose down -v` (removes the
`db-data` volume), brings up only the `db` service, waits for it to accept
connections, applies **all** migrations from `supabase/migrations` in
alphabetical order and loads `supabase/seed.sql`.

Then bring up the rest of the stack:

```bash
make dev-up
make ps                 # all services in "running" state
```

Equivalent manual reset, if you need step-by-step control:

```bash
COMPOSE="docker compose --env-file docker/.env -f docker/docker-compose.yml"

$COMPOSE down -v                        # removes containers + volumes
docker volume ls | grep rosen-team-flow # check that db-data no longer exists
$COMPOSE up -d db                       # database only
$COMPOSE exec db pg_isready -U postgres # wait for "accepting connections"
make db-migrate
make db-seed
$COMPOSE up -d                          # rest of the services
```

> A `make dev-down` does **not** delete data (it keeps volumes). Only `down -v`
> or `docker volume rm rosen-team-flow_db-data` destroy the database.

### 17.3 Apply migrations without resetting

When there are only new migrations and the data is valid:

```bash
make db-migrate
```

The migrations in this repo are mostly idempotent
(`create table if not exists`, `drop policy if exists` before `create
policy`), so reapplying all of them is safe. If one fails because an object
already exists, apply only the new one:

```bash
docker compose --env-file docker/.env -f docker/docker-compose.yml \
  exec -T db psql -U postgres -d postgres \
  < supabase/migrations/20260802163154_f6456ef6-c13d-4ba3-924b-87aeffb3dbe1.sql
```

Post-migration verification:

```bash
# Tables present
make db-shell -c "\dt public.*"

# RLS enabled on all public tables (all should show rowsecurity = t)
docker compose --env-file docker/.env -f docker/docker-compose.yml \
  exec -T db psql -U postgres -d postgres -c \
  "select tablename, rowsecurity from pg_tables where schemaname='public' order by 1;"

# Policies per table
docker compose --env-file docker/.env -f docker/docker-compose.yml \
  exec -T db psql -U postgres -d postgres -c \
  "select tablename, count(*) from pg_policies where schemaname='public' group by 1 order by 1;"
```

### 17.4 Recovering from an inconsistent state

| Symptom | Common cause | Recovery |
|---|---|---|
| `relation "public.x" does not exist` in the app | New migration not applied | `make db-migrate` |
| `permission denied for table x` | Missing `GRANT` for that table | Reapply the migration for that table; check with `\dp public.x` |
| Everything returns `401 invalid JWT` | `ANON_KEY` out of sync with `JWT_SECRET` | Section 16.2 (JWT trio rotation) |
| `db` restarts in a loop | Corrupted volume or changed image version | `make db-backup` (if it starts) → `make db-reset` |
| Migration halfway done (error mid-file) | SQL without a transaction | Restore the previous backup and reapply: `make db-restore F=backups/<file>.sql` |
| Duplicate data after several seeds | `db-seed` run more than once | `make db-reset` (clean reset) |
| TFS views empty after the reset | Encrypted PAT lost in `azure_devops_settings` | Re-enter the PAT in **Settings → Azure DevOps** |
| No admin user after the reset | `user_roles` table empty | Sign up again and assign the role (section 6) |

Restoring onto an already-initialized database:

```bash
make db-reset                                       # clean database + schema
make db-restore F=backups/backup_20260806_120000.sql # data from the backup
make dev-restart                                    # refresh PostgREST cache
```

### 17.5 Checklist after a reset

- [ ] `make ps`: all services `running`.
- [ ] Migrations applied and `rowsecurity = t` on all public tables.
- [ ] Admin user created and with a role in `user_roles`.
- [ ] Azure DevOps PAT re-entered from **Settings**.
- [ ] **Tasks**, **Bugs**, **Epics**, **Absences** and **Workload** views load without errors.
- [ ] Browser TFS cache cleared (`sessionStorage`) if you see old data.
