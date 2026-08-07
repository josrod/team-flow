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

