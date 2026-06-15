import { describe, it, expect } from "vitest";
import { mapBugsQueryIdError } from "@/lib/supabaseErrorMapping";

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
    expect(mapBugsQueryIdError(err)).toBe(
      "La ruta del 'Query de Bugs' no puede superar 256 caracteres.",
    );
  });

  it("maps trigger error: reserved characters", () => {
    const err = {
      message: "Invalid bugs_query_id: path contains reserved characters",
    };
    expect(mapBugsQueryIdError(err)).toMatch(/caracteres no permitidos/);
  });

  it("maps trigger error: starts/ends with /", () => {
    const err = {
      message: "Invalid bugs_query_id: path cannot start or end with /",
    };
    expect(mapBugsQueryIdError(err)).toMatch(/no puede empezar ni terminar/);
  });

  it("maps trigger error: empty segments", () => {
    const err = {
      message: "Invalid bugs_query_id: path contains empty segments",
    };
    expect(mapBugsQueryIdError(err)).toMatch(/segmentos vacíos/);
  });

  it("falls back to generic bugs_query message when mentioned but unknown", () => {
    const err = { message: "Invalid bugs_query_id: something new" };
    expect(mapBugsQueryIdError(err)).toMatch(/no es válido/);
  });

  it("checks details field too", () => {
    const err = {
      message: "constraint failed",
      details: "trigger validate_bugs_query_id rejected path exceeds 256 characters",
    };
    expect(mapBugsQueryIdError(err)).toMatch(/256 caracteres/);
  });
});
