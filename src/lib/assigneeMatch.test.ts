import { describe, it, expect } from "vitest";
import { buildAssigneeIndex, resolveMember, normalizeName, extractLogin } from "./assigneeMatch";
import type { TeamMember } from "@/types";

const m = (over: Partial<TeamMember>): TeamMember => ({
  id: over.id ?? "id",
  name: over.name ?? "Name",
  role: over.role ?? "",
  teamId: over.teamId ?? "team-1",
  loginName: over.loginName,
});

describe("normalizeName", () => {
  it("strips diacritics and lowercases", () => {
    expect(normalizeName("José Luis  Rodríguez ")).toBe("jose luis rodriguez");
  });
  it("returns empty for nullish", () => {
    expect(normalizeName(undefined)).toBe("");
    expect(normalizeName(null)).toBe("");
  });
});

describe("extractLogin", () => {
  it("extracts local part of email", () => {
    expect(extractLogin("JRodriguezGonzalez@rosen-group.com")).toBe("jrodriguezgonzalez");
  });
  it("extracts user from DOMAIN\\user", () => {
    expect(extractLogin("ROSEN\\mfreese")).toBe("mfreese");
  });
});

describe("resolveMember", () => {
  const members: TeamMember[] = [
    m({ id: "1", name: "Jose Luis Rodriguez", loginName: "jrodriguezgonzalez" }),
    m({ id: "2", name: "Matthias Freese", loginName: "mfreese" }),
    m({ id: "3", name: "Christian Kremer", loginName: "ckremer" }),
  ];
  const idx = buildAssigneeIndex(members);

  it("matches by exact normalized name (accents ignored)", () => {
    expect(resolveMember("José Luis Rodríguez", undefined, idx)?.id).toBe("1");
  });

  it("matches by login when name differs", () => {
    expect(resolveMember("Freese, Matthias", "ROSEN\\mfreese", idx)?.id).toBe("2");
  });

  it("matches by email uniqueName", () => {
    expect(resolveMember("Krem, C.", "ckremer@rosen-group.com", idx)?.id).toBe("3");
  });

  it("matches flipped Last, First order", () => {
    expect(resolveMember("Kremer, Christian", undefined, idx)?.id).toBe("3");
  });

  it("token-subset falls back when TFS name is shorter", () => {
    expect(resolveMember("Jose Rodriguez", undefined, idx)?.id).toBe("1");
  });

  it("returns undefined when nothing matches", () => {
    expect(resolveMember("Someone Unknown", "unknown@x.com", idx)).toBeUndefined();
  });
});
