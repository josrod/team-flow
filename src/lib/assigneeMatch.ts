// Robust assignee ↔ member matching.
//
// TFS returns AssignedTo.displayName ("Jose Luis Rodriguez") and uniqueName
// ("jrodriguezgonzalez@rosen-group.com" or "DOMAIN\\jrodriguez"). Our members
// table stores `name` (free-form) and optional `login_name`. Naive
// `name === displayName` matching drops people because of accents, order,
// double surnames, whitespace, etc. This module centralises the fuzzy match.

import type { TeamMember } from "@/types";

/** Normalize: trim, lowercase, strip diacritics, collapse whitespace. */
export const normalizeName = (raw: string | undefined | null): string => {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
};

/** Extract the login part from a uniqueName. Handles email and DOMAIN\user. */
export const extractLogin = (uniqueName: string | undefined | null): string => {
  if (!uniqueName) return "";
  const trimmed = uniqueName.trim();
  const atIdx = trimmed.indexOf("@");
  const emailLocal = atIdx >= 0 ? trimmed.slice(0, atIdx) : trimmed;
  const slashIdx = emailLocal.lastIndexOf("\\");
  const login = slashIdx >= 0 ? emailLocal.slice(slashIdx + 1) : emailLocal;
  return login.toLowerCase().trim();
};

/** "Rodriguez, Jose Luis" → "Jose Luis Rodriguez". Idempotent for non-comma names. */
const flipCommaOrder = (name: string): string => {
  const idx = name.indexOf(",");
  if (idx < 0) return name;
  const last = name.slice(0, idx).trim();
  const rest = name.slice(idx + 1).trim();
  return rest && last ? `${rest} ${last}` : name;
};

export interface AssigneeIndex {
  byName: Map<string, TeamMember>;
  byLogin: Map<string, TeamMember>;
  members: TeamMember[];
}

export const buildAssigneeIndex = (members: TeamMember[]): AssigneeIndex => {
  const byName = new Map<string, TeamMember>();
  const byLogin = new Map<string, TeamMember>();
  members.forEach((m) => {
    const nk = normalizeName(m.name);
    if (nk && !byName.has(nk)) byName.set(nk, m);
    const lk = normalizeName(m.loginName);
    if (lk && !byLogin.has(lk)) byLogin.set(lk, m);
  });
  return { byName, byLogin, members };
};

/**
 * Resolve a TFS assignee to a member.
 * Order:
 *  1) exact normalized name match,
 *  2) login_name vs uniqueName login,
 *  3) flipped "Last, First" order,
 *  4) name tokens are a subset of any member name (or vice versa) — handles
 *     "Jose Rodriguez" vs stored "Jose Luis Rodriguez Gonzalez".
 */
export const resolveMember = (
  displayName: string | undefined | null,
  uniqueName: string | undefined | null,
  index: AssigneeIndex,
): TeamMember | undefined => {
  const nk = normalizeName(displayName);
  if (nk) {
    const hit = index.byName.get(nk);
    if (hit) return hit;
  }
  const login = extractLogin(uniqueName);
  if (login) {
    const hit = index.byLogin.get(login);
    if (hit) return hit;
    // Also try login as normalized name (some orgs use "first.last")
    const asName = normalizeName(login.replace(/[._-]+/g, " "));
    if (asName) {
      const nameHit = index.byName.get(asName);
      if (nameHit) return nameHit;
    }
  }
  if (nk) {
    const flipped = normalizeName(flipCommaOrder(displayName ?? ""));
    if (flipped && flipped !== nk) {
      const hit = index.byName.get(flipped);
      if (hit) return hit;
    }
    // Token-subset fallback: every token of the display name appears in a
    // stored member name (or vice versa), and both share ≥2 tokens.
    const tokens = new Set(nk.split(" ").filter((t) => t.length > 1));
    if (tokens.size >= 2) {
      for (const m of index.members) {
        const memberTokens = new Set(
          normalizeName(m.name).split(" ").filter((t) => t.length > 1),
        );
        if (memberTokens.size < 2) continue;
        const shared = [...tokens].filter((t) => memberTokens.has(t)).length;
        if (shared >= 2 && (shared === tokens.size || shared === memberTokens.size)) {
          return m;
        }
      }
    }
  }
  return undefined;
};
