// Shared helper: validates the caller's Supabase JWT in code, since edge
// functions deploy with verify_jwt = false. Returns the user id or a ready-made
// 401 response.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

export type AuthResult = { userId: string } | { error: Response };

const unauthorized = (): Response =>
  new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Requires a valid signed-in session; anonymous callers get a 401. */
export const requireUser = async (req: Request): Promise<AuthResult> => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: unauthorized() };

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return { error: unauthorized() };

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return { error: unauthorized() };
  return { userId: String(data.claims.sub) };
};
