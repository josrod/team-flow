import { describe, expect, it } from "vitest";

import {
  EPIC_VERSION_COLORS,
  epicVersionAccessibleLabel,
  resolveEpicVersionColor,
} from "@/lib/epicVersionColors";

describe("epic version colours", () => {
  it("has unique keys, symbols and colour names", () => {
    const keys = new Set(EPIC_VERSION_COLORS.map((c) => c.key));
    const symbols = new Set(EPIC_VERSION_COLORS.map((c) => c.symbol));
    const names = new Set(EPIC_VERSION_COLORS.map((c) => c.colorName));
    expect(keys.size).toBe(EPIC_VERSION_COLORS.length);
    expect(symbols.size).toBe(EPIC_VERSION_COLORS.length);
    expect(names.size).toBe(EPIC_VERSION_COLORS.length);
  });

  it("uses dark enough bar tones for white text", () => {
    for (const color of EPIC_VERSION_COLORS) {
      const shade = Number(color.bar.split("-").pop());
      expect(shade).toBeGreaterThanOrEqual(600);
    }
  });

  it("falls back to the neutral tone for unknown keys", () => {
    expect(resolveEpicVersionColor("does-not-exist").key).toBe(EPIC_VERSION_COLORS[0].key);
    expect(resolveEpicVersionColor(null).key).toBe(EPIC_VERSION_COLORS[0].key);
  });

  it("builds an accessible label with colour name and symbol", () => {
    expect(epicVersionAccessibleLabel("2026.1", "blue")).toBe("2026.1 (Blue ■)");
  });
});
