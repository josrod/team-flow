import { describe, it, expect } from "vitest";
import { filterInternalMembers, filterInternalTeams, isInternalTeam } from "@/lib/internalTeams";

describe("internalTeams", () => {
  it("marks RODAT and Processing as internal", () => {
    expect(isInternalTeam({ name: "RODAT" })).toBe(true);
    expect(isInternalTeam({ name: "Processing" })).toBe(true);
  });

  it("marks external teams as not internal", () => {
    expect(isInternalTeam({ name: "Externals" })).toBe(false);
    expect(isInternalTeam({ name: "equipo externo" })).toBe(false);
  });

  it("filters out external teams", () => {
    const teams = [
      { id: "team-1", name: "RODAT" },
      { id: "team-2", name: "Processing" },
      { id: "team-3", name: "Externals" },
    ];
    expect(filterInternalTeams(teams).map((team) => team.id)).toEqual(["team-1", "team-2"]);
  });

  it("keeps only members of internal teams", () => {
    const internalTeams = [{ id: "team-1" }, { id: "team-2" }];
    const members = [
      { id: "m1", teamId: "team-1" },
      { id: "m2", teamId: "team-3" },
      { id: "m3", teamId: "team-2" },
    ];
    expect(filterInternalMembers(members, internalTeams).map((m) => m.id)).toEqual(["m1", "m3"]);
  });
});
