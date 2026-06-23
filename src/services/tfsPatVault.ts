// Client helper around the tfs-pat-vault edge function.
//
// Responsibilities:
// - Load Azure DevOps settings for the current user and return a ready-to-use
//   TfsConnection with the PAT decrypted in-memory only when needed.
// - Encrypt a PAT before persisting it to the database.
// - Backwards compat: rows saved before the vault landed have pat_iv = null
//   and still hold plaintext in pat_encrypted; we treat that path as the
//   legacy fallback so existing users don't get locked out, and we re-encrypt
//   on next save.

import { supabase } from "@/integrations/supabase/client";
import type { TfsConnection } from "@/services/tfs";

export interface AdoSettingsRow {
  server_url: string | null;
  collection: string | null;
  project: string;
  team: string | null;
  pat_encrypted: string;
  pat_iv: string | null;
  area_paths?: string[] | null;
  iteration_paths?: string[] | null;
}

export interface DecryptedAdoSettings {
  conn: TfsConnection;
  raw: AdoSettingsRow;
}

const VAULT_FN = "tfs-pat-vault";

const invokeVault = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke<T>(VAULT_FN, { body });
  if (error) {
    throw new Error(error.message ?? "Vault request failed");
  }
  if (!data) {
    throw new Error("Vault returned an empty response");
  }
  return data;
};

/**
 * Encrypt a PAT for storage. Always returns ciphertext + iv — the caller
 * must persist BOTH fields together (pat_encrypted, pat_iv).
 */
export const encryptPat = async (
  pat: string,
): Promise<{ ciphertext: string; iv: string }> => {
  return invokeVault<{ ciphertext: string; iv: string }>({ op: "encrypt", pat });
};

/**
 * Decrypt a stored PAT. Falls back to treating the value as plaintext for
 * legacy rows where pat_iv is still null.
 */
export const decryptPat = async (
  ciphertext: string,
  iv: string | null,
): Promise<string> => {
  if (!iv) return ciphertext; // legacy plaintext row
  const { pat } = await invokeVault<{ pat: string }>({
    op: "decrypt",
    ciphertext,
    iv,
  });
  return pat;
};

/**
 * Fetch the user's Azure DevOps settings and return a TfsConnection with the
 * PAT already decrypted. Returns null when the row is missing or incomplete.
 *
 * Pass `presetRow` to skip the DB fetch (used by the realtime subscription on
 * the Features page which already gets the row in the payload).
 */
export const loadDecryptedAdoSettings = async (
  userId: string,
  presetRow?: AdoSettingsRow | null,
): Promise<DecryptedAdoSettings | null> => {
  let row: AdoSettingsRow | null | undefined = presetRow;
  if (!row) {
    const { data, error } = await supabase
      .from("azure_devops_settings")
      .select(
        "server_url, collection, project, team, pat_encrypted, pat_iv, area_paths, iteration_paths",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    row = data as AdoSettingsRow | null;
  }
  if (!row || !row.server_url || !row.collection || !row.project || !row.pat_encrypted) {
    return null;
  }

  const pat = await decryptPat(row.pat_encrypted, row.pat_iv);
  return {
    raw: row,
    conn: {
      serverUrl: row.server_url,
      collection: row.collection,
      project: row.project,
      team: row.team ?? undefined,
      pat,
    },
  };
};
