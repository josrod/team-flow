import type { Team, TeamMember } from "@/types";

/**
 * External teams (e.g. "Externals") must not count towards internal team
 * capacity metrics on the main dashboard.
 */
export const isInternalTeam = (team: Pick<Team, "name">): boolean =>
  !team.name.toLowerCase().includes("extern");

/** Teams excluding any external team. */
export const filterInternalTeams = <T extends Pick<Team, "name">>(teams: T[]): T[] =>
  teams.filter(isInternalTeam);

/** Members that belong to one of the given internal teams. */
export const filterInternalMembers = <M extends Pick<TeamMember, "teamId">>(
  members: M[],
  internalTeams: Pick<Team, "id">[]
): M[] => {
  const internalIds = new Set(internalTeams.map((team) => team.id));
  return members.filter((member) => internalIds.has(member.teamId));
};

/**
 * Lowercase name and login keys of members that do NOT belong to an internal
 * team. Used to scope person-based datasets (e.g. time bookings) to RODAT and
 * Processing without needing an explicit member id on every row.
 */
export const externalPersonKeys = (
  members: Pick<TeamMember, "teamId" | "name" | "loginName">[],
  teams: Pick<Team, "id" | "name">[]
): Set<string> => {
  const internalIds = new Set(filterInternalTeams(teams).map((team) => team.id));
  const keys = new Set<string>();
  for (const member of members) {
    if (internalIds.has(member.teamId)) continue;
    if (member.name) keys.add(member.name.toLowerCase().trim());
    if (member.loginName) keys.add(member.loginName.toLowerCase().trim());
  }
  return keys;
};

/** Keeps only rows whose person is not a known external team member. */
export const filterInternalByPerson = <T extends { person: string }>(
  rows: T[],
  externalKeys: Set<string>
): T[] => (externalKeys.size === 0 ? rows : rows.filter((row) => !externalKeys.has(row.person.toLowerCase().trim())));
