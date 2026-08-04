import { describe, it, expect } from "vitest";
import { isAllowedTfsRequest } from "@/services/tfs";

const base = "https://tfs.example.net/tfs/RNDCollection";

describe("TFS read-only endpoint allowlist", () => {
  it("allows the read endpoints the app needs", () => {
    expect(isAllowedTfsRequest(`${base}/_apis/projects?api-version=5.0`)).toBe(true);
    expect(isAllowedTfsRequest(`${base}/_apis/wit/workitems?ids=1,2`)).toBe(true);
    expect(isAllowedTfsRequest(`${base}/SDES/_apis/wit/wiql?api-version=5.0`, "POST")).toBe(true);
    expect(isAllowedTfsRequest(`${base}/SDES/Team/_apis/work/teamsettings/iterations`)).toBe(true);
    expect(isAllowedTfsRequest("https://tfs.example.net/_apis/projectcollections")).toBe(true);
  });

  it("blocks write verbs and endpoints outside the allowlist", () => {
    expect(isAllowedTfsRequest(`${base}/_apis/wit/workitems/$Task`, "PATCH")).toBe(false);
    expect(isAllowedTfsRequest(`${base}/_apis/wit/workitems/12`, "DELETE")).toBe(false);
    expect(isAllowedTfsRequest(`${base}/_apis/wit/workitems/12`, "POST")).toBe(false);
    expect(isAllowedTfsRequest(`${base}/_apis/git/repositories`)).toBe(false);
    expect(isAllowedTfsRequest(`${base}/_apis/tokens/pats`)).toBe(false);
    expect(isAllowedTfsRequest("not-a-url")).toBe(false);
  });
});
