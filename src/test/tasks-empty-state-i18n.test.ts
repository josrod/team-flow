import { describe, it, expect } from "vitest";
import { translations } from "@/context/LanguageContext";

// Mirrors the placeholder substitution used in FeaturesPage's empty state
// for "Tareas por persona". Keeping it pure makes it easy to verify all
// filter combinations across both languages without rendering the page.
function buildEmptyMessage(
  t: typeof translations.es,
  opts: { teamName?: string | null; personName?: string | null },
): string {
  const { teamName, personName } = opts;
  if (teamName && personName) {
    return t.noTasksForTeamAndPerson
      .replace("{person}", personName)
      .replace("{team}", teamName);
  }
  if (teamName) return t.noTasksForTeam.replace("{team}", teamName);
  if (personName) return t.noTasksForPerson.replace("{person}", personName);
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
        expect(msg).not.toContain("{team}");
        expect(msg).not.toContain("{person}");
      });

      it("substitutes person name when only person filter is active", () => {
        const msg = buildEmptyMessage(t, { personName: "Carlos" });
        expect(msg).toContain("Carlos");
        expect(msg).not.toContain("{team}");
        expect(msg).not.toContain("{person}");
      });

      it("substitutes both placeholders when team + person are active", () => {
        const msg = buildEmptyMessage(t, { teamName: "Processing", personName: "María" });
        expect(msg).toContain("Processing");
        expect(msg).toContain("María");
        expect(msg).not.toContain("{team}");
        expect(msg).not.toContain("{person}");
      });

      it("handles names containing curly braces or special chars without leaking placeholders", () => {
        const msg = buildEmptyMessage(t, { teamName: "Team {X}", personName: "A & B" });
        expect(msg).toContain("Team {X}");
        expect(msg).toContain("A & B");
        // Ensure the original placeholder tokens are no longer present
        expect(msg).not.toMatch(/\{team\}/);
        expect(msg).not.toMatch(/\{person\}/);
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
