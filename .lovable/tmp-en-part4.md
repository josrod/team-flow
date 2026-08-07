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
