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

