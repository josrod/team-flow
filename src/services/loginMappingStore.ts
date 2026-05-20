const STORAGE_KEY = "teamflow-login-mappings";

export type LoginMappings = Record<string, string>; // loginName(lower) → memberId

export function loadLoginMappings(): LoginMappings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as LoginMappings;
    return {};
  } catch {
    return {};
  }
}

export function saveLoginMappings(mappings: LoginMappings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
  } catch {
    // ignore quota / serialization errors
  }
}

export function rememberLoginMappings(newEntries: Record<string, string>): LoginMappings {
  const current = loadLoginMappings();
  const merged: LoginMappings = { ...current };
  for (const [login, memberId] of Object.entries(newEntries)) {
    if (!login || !memberId) continue;
    merged[login.toLowerCase()] = memberId;
  }
  saveLoginMappings(merged);
  return merged;
}

export function getMappedMemberId(login: string): string | undefined {
  const all = loadLoginMappings();
  return all[login.toLowerCase()];
}

export function forgetLoginMapping(login: string): void {
  const all = loadLoginMappings();
  delete all[login.toLowerCase()];
  saveLoginMappings(all);
}
