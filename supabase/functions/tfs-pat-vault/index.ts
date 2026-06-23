// Edge function: encrypts / decrypts Azure DevOps PATs using AES-256-GCM.
// The encryption key lives only as the edge-function secret ADO_PAT_ENC_KEY,
// so a database leak alone never exposes the plaintext token.
//
// Authentication: every request must carry a valid Supabase JWT. The function
// only encrypts/decrypts on behalf of the authenticated caller; it never reads
// or writes the database.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type EncryptRequest = { op: "encrypt"; pat: string };
type DecryptRequest = { op: "decrypt"; ciphertext: string; iv: string };
type VaultRequest = EncryptRequest | DecryptRequest;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const ENC_KEY_RAW = Deno.env.get("ADO_PAT_ENC_KEY");

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const fromBase64 = (input: string): Uint8Array => {
  const binary = atob(input);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

// Derive a stable 32-byte key from the raw secret (hex, base64, or arbitrary
// string). We hash so any length / format the operator pasted still produces
// the 256 bits AES-GCM needs.
const importKey = async (): Promise<CryptoKey> => {
  if (!ENC_KEY_RAW || ENC_KEY_RAW.length < 32) {
    throw new Error("ADO_PAT_ENC_KEY is not configured or is too short");
  }
  const material = new TextEncoder().encode(ENC_KEY_RAW);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

const encryptPat = async (
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> => {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return {
    ciphertext: toBase64(new Uint8Array(cipherBuf)),
    iv: toBase64(iv),
  };
};

const decryptPat = async (
  ciphertextB64: string,
  ivB64: string,
): Promise<string> => {
  const key = await importKey();
  const iv = fromBase64(ivB64);
  const ciphertext = fromBase64(ciphertextB64);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plainBuf);
};

const parseBody = (raw: unknown): VaultRequest | null => {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.op === "encrypt" && typeof obj.pat === "string" && obj.pat.length > 0 && obj.pat.length <= 8192) {
    return { op: "encrypt", pat: obj.pat };
  }
  if (
    obj.op === "decrypt" &&
    typeof obj.ciphertext === "string" &&
    typeof obj.iv === "string" &&
    obj.ciphertext.length > 0 &&
    obj.iv.length > 0 &&
    obj.ciphertext.length <= 16384 &&
    obj.iv.length <= 64
  ) {
    return { op: "decrypt", ciphertext: obj.ciphertext, iv: obj.iv };
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Verify caller's JWT — the function is registered with verify_jwt = false
  // so we authenticate explicitly with getClaims().
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const parsed = parseBody(body);
  if (!parsed) {
    return jsonResponse({ error: "Invalid request payload" }, 400);
  }

  try {
    if (parsed.op === "encrypt") {
      const result = await encryptPat(parsed.pat);
      return jsonResponse(result);
    }
    const pat = await decryptPat(parsed.ciphertext, parsed.iv);
    return jsonResponse({ pat });
  } catch {
    // Never echo the underlying crypto error — it can leak key/IV details.
    return jsonResponse({ error: "Vault operation failed" }, 400);
  }
});
