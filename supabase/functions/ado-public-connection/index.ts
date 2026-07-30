// Edge function: exposes the admin-configured Azure DevOps connection to any
// visitor of the intranet app, so read-only data can be displayed without a
// login.
//
// The on-prem TFS server is only reachable from browsers inside the corporate
// network, so the queries must run client-side. This function therefore
// decrypts the stored PAT and returns it. That trade-off was accepted
// explicitly: the app is served inside the intranet and the PAT should be a
// read-only, short-lived token.

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
  const material = new TextEncoder().encode(ENC_KEY_RAW);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
};

const decryptPat = async (ciphertextB64: string, ivB64: string): Promise<string> => {
  const key = await importKey();
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivB64) },
    key,
    fromBase64(ciphertextB64),
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

  return jsonResponse({
    server_url: data.server_url,
    collection: data.collection,
    project: data.project,
    team: data.team,
    // The token never leaves the server: the client receives a sentinel and
    // routes every read-only request through the `ado-proxy` function.
    pat_encrypted: "__ado_proxy__",
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

