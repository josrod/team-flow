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
