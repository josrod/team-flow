import { describe, it, expect } from "vitest";
import { translations } from "@/context/LanguageContext";

// Mirrors the placeholder substitution used in FeaturesPage's empty state
// for "Tareas por persona". Kept pure so we can exercise every filter combo.
type EmptyStateStrings = {
  noPersonsMatching: string;
  noTasksForTeam: string;
  noTasksForPerson: string;
  noTasksForTeamAndPerson: string;
  noTasksForSearch: string;
  noTasksForTeamAndSearch: string;
  noTasksForPersonAndSearch: string;
  noTasksForTeamPersonAndSearch: string;
  clearFiltersCta: string;
};

function buildEmptyMessage(
  t: EmptyStateStrings,
  opts: { teamName?: string | null; personName?: string | null; searchQuery?: string | null },
): string {
  const { teamName, personName, searchQuery } = opts;
  const sub = (tpl: string) =>
    tpl
      .replace("{team}", teamName ?? "")
      .replace("{person}", personName ?? "")
      .replace("{q}", searchQuery ?? "");
  if (teamName && personName && searchQuery) return sub(t.noTasksForTeamPersonAndSearch);
  if (teamName && searchQuery) return sub(t.noTasksForTeamAndSearch);
  if (personName && searchQuery) return sub(t.noTasksForPersonAndSearch);
  if (teamName && personName) return sub(t.noTasksForTeamAndPerson);
  if (teamName) return sub(t.noTasksForTeam);
  if (personName) return sub(t.noTasksForPerson);
  if (searchQuery) return sub(t.noTasksForSearch);
  return t.noPersonsMatching;
}

describe("Empty-state i18n placeholders for 'Tareas por persona'", () => {
  (["es", "en"] as const).forEach((lang) => {
    const t = translations[lang];

    describe(`language: ${lang}`, () => {
      it("translation keys exist and contain expected placeholders", () => {
        expect(t.noPersonsMatching).toBeTruthy();
        expect(t.noTasksForTeam).toContain("{team}");
        expect(t.noTasksForPerson).toContain("{person}");
        expect(t.noTasksForTeamAndPerson).toContain("{team}");
        expect(t.noTasksForTeamAndPerson).toContain("{person}");
        expect(t.noTasksForSearch).toContain("{q}");
        expect(t.noTasksForTeamAndSearch).toContain("{team}");
        expect(t.noTasksForTeamAndSearch).toContain("{q}");
        expect(t.noTasksForPersonAndSearch).toContain("{person}");
        expect(t.noTasksForPersonAndSearch).toContain("{q}");
        expect(t.noTasksForTeamPersonAndSearch).toContain("{team}");
        expect(t.noTasksForTeamPersonAndSearch).toContain("{person}");
        expect(t.noTasksForTeamPersonAndSearch).toContain("{q}");
        expect(t.clearFiltersCta).toBeTruthy();
      });

      it("falls back to generic message when no filters are active", () => {
        const msg = buildEmptyMessage(t, {});
        expect(msg).toBe(t.noPersonsMatching);
        expect(msg).not.toContain("{");
      });

      it("substitutes team name when only team filter is active", () => {
        const msg = buildEmptyMessage(t, { teamName: "RODAT" });
        expect(msg).toContain("RODAT");
        expect(msg).not.toMatch(/\{(team|person|q)\}/);
      });

      it("substitutes person name when only person filter is active", () => {
        const msg = buildEmptyMessage(t, { personName: "Carlos" });
        expect(msg).toContain("Carlos");
        expect(msg).not.toMatch(/\{(team|person|q)\}/);
      });

      it("substitutes search query when only search is active", () => {
        const msg = buildEmptyMessage(t, { searchQuery: "login" });
        expect(msg).toContain("login");
        expect(msg).not.toMatch(/\{(team|person|q)\}/);
      });

      it("substitutes team + person when both are active", () => {
        const msg = buildEmptyMessage(t, { teamName: "Processing", personName: "María" });
        expect(msg).toContain("Processing");
        expect(msg).toContain("María");
        expect(msg).not.toMatch(/\{(team|person|q)\}/);
      });

      it("substitutes team + search", () => {
        const msg = buildEmptyMessage(t, { teamName: "RODAT", searchQuery: "auth" });
        expect(msg).toContain("RODAT");
        expect(msg).toContain("auth");
        expect(msg).not.toMatch(/\{(team|person|q)\}/);
      });

      it("substitutes person + search", () => {
        const msg = buildEmptyMessage(t, { personName: "Ana", searchQuery: "bug" });
        expect(msg).toContain("Ana");
        expect(msg).toContain("bug");
        expect(msg).not.toMatch(/\{(team|person|q)\}/);
      });

      it("substitutes team + person + search (all three active)", () => {
        const msg = buildEmptyMessage(t, {
          teamName: "RODAT",
          personName: "Diego",
          searchQuery: "api",
        });
        expect(msg).toContain("RODAT");
        expect(msg).toContain("Diego");
        expect(msg).toContain("api");
        expect(msg).not.toMatch(/\{(team|person|q)\}/);
      });

      it("handles values with special chars without leaking placeholders", () => {
        const msg = buildEmptyMessage(t, {
          teamName: "Team {X}",
          personName: "A & B",
          searchQuery: 'foo "bar"',
        });
        expect(msg).toContain("Team {X}");
        expect(msg).toContain("A & B");
        expect(msg).toContain('foo "bar"');
        expect(msg).not.toMatch(/\{team\}|\{person\}|\{q\}/);
      });
    });
  });

  it("Spanish and English variants produce different strings", () => {
    const es = buildEmptyMessage(translations.es, { teamName: "RODAT", personName: "Ana" });
    const en = buildEmptyMessage(translations.en, { teamName: "RODAT", personName: "Ana" });
    expect(es).not.toBe(en);
    expect(es).toContain("equipo");
    expect(en.toLowerCase()).toContain("team");
  });
});
