# Security audit — ROSEN CUSW Team Flow

Scope: frontend React app, Lovable Cloud (Supabase) schema, RLS policies, auth flow, Azure DevOps (TFS) integration, browser storage. Automated scanners (Supabase advisor, connector scan, npm audit, agent scanner) returned clean — the findings below come from manual code review and outweigh that baseline.

---

## 1. Findings overview

| # | Finding | Severity |
|---|---|---|
| 1 | Azure DevOps PAT stored in plaintext (column misleadingly named `pat_encrypted`) | **Critical** |
| 2 | PAT sent from the browser directly to TFS — exposed to any XSS and to the user's devtools/extensions | **High** |
| 3 | `dangerouslySetInnerHTML` on un-sanitized TFS HTML (`description`, `reproSteps`) → stored XSS | **High** |
| 4 | Supabase session in `localStorage` (XSS → full account takeover) | **High** (amplifier of #3) |
| 5 | RLS policies on `azure_devops_settings` / `tfs_import_history` target role `public` instead of `authenticated` | **Medium** |
| 6 | CSV import / export vulnerable to spreadsheet formula injection (`=`, `+`, `-`, `@`, tab, CR) | **Medium** |
| 7 | No Content-Security-Policy, `X-Frame-Options`, `Referrer-Policy`, or `Permissions-Policy` headers | **Medium** |
| 8 | Login-name → memberId mapping cached unencrypted in `localStorage` (PII) | **Low** |
| 9 | No server-side rate limiting on auth endpoints beyond Supabase defaults; HIBP is on, but lockout/CAPTCHA isn't | **Low** |
| 10 | Mixed-content TFS calls only *warned about*, not blocked at the network layer | **Low** |

---

## 2. Detailed analysis

### 1. Plaintext PAT in the database — Critical
`src/pages/AzureDevOpsSettingsPage.tsx:357` writes the raw PAT into `azure_devops_settings.pat_encrypted`, and `FeaturesPage`, `BugsPage`, `TfsImportDialog` read it back unchanged. There is no `crypto.subtle` usage anywhere despite the project memory note "AES-GCM encryption for Azure DevOps PATs". The column name gives a false sense of security.

**Attack scenario:** any future read-only SQL leak, support-tool query, backup snapshot, or RLS misconfiguration immediately exposes corporate Azure DevOps tokens with `vso.work` / `vso.project` scopes. One stolen row = one stolen identity into the internal ADO tenant.

**Fix:**
- Move all TFS calls behind a Supabase Edge Function. The PAT never leaves the server.
- Encrypt at rest with AES-GCM using a key stored as an Edge-Function secret (`ADO_PAT_ENC_KEY`, 32 bytes, generated via `secrets--generate_secret`).
- Schema: keep `pat_encrypted TEXT`, add `pat_iv TEXT NOT NULL`, add `pat_kid TEXT NOT NULL` for key rotation. Migrate existing rows by re-encrypting through an admin function, then `REVOKE SELECT(pat_encrypted) ON public.azure_devops_settings FROM authenticated;` so the client cannot read ciphertext directly.

### 2. PAT round-trip through the browser — High
Even before encryption is added, the architectural flaw is that the browser fetches the PAT from Supabase, holds it in React state, and sends it via `Authorization: Basic` directly to TFS (`src/services/tfs.ts:99`, `:153`). Any third-party script, browser extension, or successful XSS reads it from memory and from network traces.

**Fix:** proxy all TFS REST calls through an Edge Function that:
1. Verifies the caller's JWT (`supabase.auth.getClaims(token)`).
2. Loads the row by `user_id`, decrypts the PAT in-process.
3. Calls TFS with `fetch` and returns the (filtered) JSON.
The client never receives the PAT and the PAT never appears in browser network logs.

### 3. Stored XSS via Azure DevOps work-item HTML — High
`src/components/BugDetailDialog.tsx:165,178` renders `detail.description` and `detail.reproSteps` with `dangerouslySetInnerHTML`. TFS work-item rich-text fields accept arbitrary HTML, and any ADO user inside the corporate tenant can plant `<img src=x onerror=...>` in a bug they file. Once the team opens that bug in this app, the script runs with full access to:
- the Supabase session token in `localStorage` → account takeover,
- the in-memory PAT from finding #2,
- the ability to silently call `supabase.from(...).update(...)` as the victim.

**Fix:** sanitize before render with DOMPurify, allowlisting only the tags ADO actually uses (`p, br, strong, em, ul, ol, li, a[href], code, pre, img[src]` with `src` restricted to `https:` and the corporate TFS origin). Add a Vitest case for `<img onerror>`, `<script>`, and `javascript:` URLs.

### 4. Supabase session in `localStorage` — High (amplifier)
`src/integrations/supabase/client.ts:13` opts into `localStorage`. Combined with #3, an XSS payload exfiltrates the refresh token in one line. Lovable Cloud's `supabase-js` does not natively support httpOnly cookies, so the realistic mitigations are:
- close finding #3 (the only realistic XSS vector today),
- add a strict CSP (see #7) so injected scripts cannot phone home,
- shorten refresh-token lifetime in Auth settings,
- enable "Reuse Detection" on refresh tokens (already on by default — confirm).

### 5. RLS policies target role `public` — Medium
Every policy on `azure_devops_settings` and `tfs_import_history` is declared `TO public`. The `auth.uid() = user_id` predicate makes them safe (anon → `auth.uid()` is null → no rows), but `public` includes future roles and defeats grant-based defense in depth.

**Fix:** recreate each policy `TO authenticated`, and ensure GRANTs match:
```sql
REVOKE ALL ON public.azure_devops_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.azure_devops_settings TO authenticated;
GRANT ALL ON public.azure_devops_settings TO service_role;
```
After finding #1's remediation, also `REVOKE SELECT (pat_encrypted, pat_iv) ON public.azure_devops_settings FROM authenticated`.

### 6. CSV formula injection — Medium
The app imports absences from CSV/Excel and exports CSVs with the UTF-8 BOM. Excel/LibreOffice evaluate any cell whose first char is `=`, `+`, `-`, `@`, `\t`, or `\r` as a formula, enabling `=HYPERLINK(...)` data exfiltration when a teammate opens an exported file.

**Fix:** on export, prefix any such cell with a leading apostrophe `'`. On import, reject or strip those leading characters before persisting strings into `members`, `work_topics`, `handovers`.

### 7. Missing security response headers — Medium
SPA is served by Lovable hosting; the app does not set CSP, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. CSP would have made #3's exfiltration step far harder.

**Fix:** add a strict CSP via `<meta http-equiv="Content-Security-Policy" ...>` in `index.html` (only place we can influence headers from app code):
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https://<tfs-host>;
connect-src 'self' https://veirotksnslmhshxfkoa.supabase.co https://<tfs-host>;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```
Replace `<tfs-host>` with the configured server URL pattern.

### 8. PII in `localStorage` (login mappings) — Low
`teamflow-login-mappings` stores ADO login names mapped to internal member ids. Survives logout. Clear it on `signOut()` and after `auth.signOut()` in `AuthContext`.

### 9. Auth hardening — Low
HIBP is enabled (good). Add:
- `password_min_length: 12`,
- enable CAPTCHA (hCaptcha) on signup,
- disable email signups if only invited users should onboard,
- in `AuthContext`, switch any *trust* check from `getSession()` to `getUser()` (re-validates with the auth server).

### 10. Mixed content / TFS over HTTP — Low
`tfs.ts` only warns when HTTPS app → HTTP TFS; once #2 is implemented (Edge Function proxy) this becomes moot. Until then, refuse to save settings whose `server_url` starts with `http://`.

---

## 3. Production-grade roadmap (recommended order)

1. **Build TFS Edge Function proxy** (`tfs-proxy`) and migrate `FeaturesPage`, `BugsPage`, `TfsImportDialog`, `AzureDevOpsSettingsPage` test/probe paths to call it. Closes #2.
2. **Add AES-GCM encryption** for the PAT inside that Edge Function, plus migration + key secret. Closes #1, completes #5 grant tightening.
3. **Sanitize TFS HTML** with DOMPurify in `BugDetailDialog`. Closes #3, neutralizes the realistic exploitation path for #4.
4. **Tighten RLS / GRANTs** to `authenticated` and add CSP + security meta tags. Closes #5, #7.
5. **CSV hardening** on import + export. Closes #6.
6. **Auth polish**: clear PII on signOut, CAPTCHA, `getUser()` in trust paths. Closes #8, #9.

I can implement these in that order (one PR per step), or jump straight to the top 3 critical/high items in a single change. Tell me which scope you want and I'll switch to build mode.
