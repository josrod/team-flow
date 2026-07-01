import { describe, it, expect } from "vitest";
import {
  parseTagsParam,
  pruneUnknownTags,
  serializeTagsParam,
} from "@/lib/epicsTagsParam";

describe("parseTagsParam", () => {
  it("returns empty array for null / empty / whitespace / commas only", () => {
    expect(parseTagsParam(null)).toEqual([]);
    expect(parseTagsParam("")).toEqual([]);
    expect(parseTagsParam("   ")).toEqual([]);
    expect(parseTagsParam(",,,")).toEqual([]);
    expect(parseTagsParam(" , , ")).toEqual([]);
  });

  it("trims entries and skips empty segments from extra commas", () => {
    expect(parseTagsParam(",alpha,,beta, ,gamma,")).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    expect(parseTagsParam("  alpha  ,  beta  ")).toEqual(["alpha", "beta"]);
  });

  it("deduplicates case-insensitively, keeping the first casing", () => {
    expect(parseTagsParam("Alpha,alpha,ALPHA,Beta")).toEqual(["Alpha", "Beta"]);
  });
});

describe("pruneUnknownTags", () => {
  it("keeps only tags present in the available set (case-insensitive)", () => {
    expect(pruneUnknownTags(["alpha", "ghost", "Beta"], ["Alpha", "beta"]))
      .toEqual(["alpha", "Beta"]);
  });

  it("returns the same reference when nothing changes (React bail-out)", () => {
    const selected = ["alpha", "beta"];
    const result = pruneUnknownTags(selected, ["alpha", "beta", "gamma"]);
    expect(result).toBe(selected);
  });

  it("returns the same reference for empty selection", () => {
    const selected: string[] = [];
    expect(pruneUnknownTags(selected, ["alpha"])).toBe(selected);
  });

  it("returns empty array when no selected tag matches", () => {
    expect(pruneUnknownTags(["ghost", "phantom"], ["alpha", "beta"]))
      .toEqual([]);
  });
});

describe("serializeTagsParam", () => {
  it("joins tags with commas", () => {
    expect(serializeTagsParam(["alpha", "beta"])).toBe("alpha,beta");
    expect(serializeTagsParam([])).toBe("");
  });
});
