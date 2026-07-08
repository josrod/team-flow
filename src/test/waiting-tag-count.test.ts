import { describe, it, expect } from "vitest";
import { parseTfsTags } from "@/lib/tfsTags";

// Replica exacta de la lógica usada en FeaturesPage para el badge "Waiting".
const countWaiting = (rawTags: Array<string | null | undefined>): number => {
  let waiting = 0;
  for (const raw of rawTags) {
    const tags = parseTfsTags(raw);
    if (tags.some((tag) => tag.toLowerCase() === "waiting")) waiting++;
  }
  return waiting;
};

describe("waiting tag counting", () => {
  it("cuenta el tag 'waiting' sin distinguir mayúsculas", () => {
    expect(countWaiting(["Waiting", "WAITING", "waiting", "wAiTiNg"])).toBe(4);
  });

  it("ignora valores nulos, indefinidos y cadenas vacías", () => {
    expect(countWaiting([null, undefined, "", "   "])).toBe(0);
  });

  it("acepta tags mezclados con espacios y otros valores", () => {
    expect(
      countWaiting([
        " Waiting ;Bug",
        "Feature;waiting ; urgent",
        "bug;urgent",
        "Waiting-Review", // no coincide: token distinto
      ]),
    ).toBe(2);
  });

  it("no cuenta subcadenas como 'awaiting' o 'waiting-review'", () => {
    expect(countWaiting(["awaiting", "Waiting-Review", "prewaiting"])).toBe(0);
  });

  it("cuenta una sola vez aunque el tag aparezca duplicado en el mismo item", () => {
    expect(countWaiting(["waiting;Waiting;WAITING"])).toBe(1);
  });
});
