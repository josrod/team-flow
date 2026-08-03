// Edge function: exposes the admin-configured Azure DevOps connection so any
// visitor of the intranet app can read data without signing in.
//
// The TFS server only exists inside the corporate network, so the cloud can
// never reach it: every upstream request has to be made by the visitor's own
// browser. That means the admin token is decrypted here and returned to the
// client (accepted trade-off — use a read-only, short-lived token).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ENC_KEY_RAW = Deno.env.get("ADO_PAT_ENC_KEY");

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fromBase64 = (input: string): Uint8Array => {
  const binary = atob(input);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

const importKey = async (): Promise<CryptoKey> => {
  if (!ENC_KEY_RAW || ENC_KEY_RAW.length < 32) {
    throw new Error("ADO_PAT_ENC_KEY is not configured or is too short");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ENC_KEY_RAW));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM", length: 256 }, false, [
    "decrypt",
  ]);
};

/** Decrypts a stored PAT. Legacy rows without an iv still hold plaintext. */
const decryptPat = async (ciphertext: string, iv: string | null): Promise<string> => {
  if (!iv) return ciphertext;
  const key = await importKey();
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    fromBase64(ciphertext),
  );
  return new TextDecoder().decode(plainBuf);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await admin
    .from("azure_devops_settings")
    .select(
      "server_url, collection, project, team, pat_encrypted, pat_iv, area_paths, iteration_paths, bugs_query_id, epics_query_id, epics_tags, epics_project, epics_team, epics_area_paths, epics_iteration_paths, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return jsonResponse({ error: "Could not read the Azure DevOps configuration" }, 500);
  }
  if (!data || !data.server_url || !data.collection || !data.project || !data.pat_encrypted) {
    return jsonResponse({ error: "No Azure DevOps configuration available" }, 404);
  }

  let pat: string;
  try {
    pat = await decryptPat(data.pat_encrypted, data.pat_iv);
  } catch {
    return jsonResponse({ error: "Could not decrypt the stored access token" }, 500);
  }

  return jsonResponse({
    server_url: data.server_url,
    collection: data.collection,
    project: data.project,
    team: data.team,
    pat_encrypted: pat,
    pat_iv: null,
    area_paths: data.area_paths ?? [],
    iteration_paths: data.iteration_paths ?? [],
    bugs_query_id: data.bugs_query_id ?? null,
    epics_query_id: data.epics_query_id ?? null,
    epics_tags: data.epics_tags ?? [],
    epics_project: data.epics_project ?? null,
    epics_team: data.epics_team ?? null,
    epics_area_paths: data.epics_area_paths ?? [],
    epics_iteration_paths: data.epics_iteration_paths ?? [],
  });
});
