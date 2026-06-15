import { describe, it, expect } from "vitest";
import { mapBugsQueryIdError } from "@/lib/supabaseErrorMapping";
import { BUGS_QUERY_MESSAGES } from "@/lib/bugsQueryMessages";

describe("mapBugsQueryIdError", () => {
  it("returns null for unrelated errors", () => {
    expect(mapBugsQueryIdError(null)).toBeNull();
    expect(mapBugsQueryIdError(undefined)).toBeNull();
    expect(mapBugsQueryIdError({ message: "network down" })).toBeNull();
    expect(mapBugsQueryIdError("string error")).toBeNull();
  });

  it("maps trigger error: path exceeds 256 characters", () => {
    const err = {
      code: "22023",
      message: "Invalid bugs_query_id: path exceeds 256 characters",
    };
    expect(mapBugsQueryIdError(err)).toBe(BUGS_QUERY_MESSAGES.tooLong);
  });

  it("maps trigger error: reserved characters", () => {
    const err = {
      message: "Invalid bugs_query_id: path contains reserved characters",
    };
    expect(mapBugsQueryIdError(err)).toBe(BUGS_QUERY_MESSAGES.reservedChars);
  });

  it("maps trigger error: starts/ends with /", () => {
    const err = {
      message: "Invalid bugs_query_id: path cannot start or end with /",
    };
    expect(mapBugsQueryIdError(err)).toBe(BUGS_QUERY_MESSAGES.startOrEndSlash);
  });

  it("maps trigger error: empty segments", () => {
    const err = {
      message: "Invalid bugs_query_id: path contains empty segments",
    };
    expect(mapBugsQueryIdError(err)).toBe(BUGS_QUERY_MESSAGES.emptySegments);
  });

  it("falls back to generic bugs_query message when mentioned but unknown", () => {
    const err = { message: "Invalid bugs_query_id: something new" };
    expect(mapBugsQueryIdError(err)).toBe(BUGS_QUERY_MESSAGES.generic);
  });

  it("checks details field too", () => {
    const err = {
      message: "constraint failed",
      details: "trigger validate_bugs_query_id rejected path exceeds 256 characters",
    };
    expect(mapBugsQueryIdError(err)).toBe(BUGS_QUERY_MESSAGES.tooLong);
  });
});
