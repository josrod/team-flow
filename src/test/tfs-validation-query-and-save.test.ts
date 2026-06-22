import { describe, it, expect } from "vitest";
import {
  validateQueryId,
  evaluateSaveGuard,
  validateConnectionFields,
} from "@/lib/tfsValidation";

describe("validateQueryId", () => {
  it("treats empty / whitespace as valid (optional field)", () => {
    expect(validateQueryId("").status).toBe("valid");
    expect(validateQueryId("   ").status).toBe("valid");
  });

  it("accepts a canonical GUID (any case)", () => {
    expect(
      validateQueryId("12345678-1234-1234-1234-123456789abc").status,
    ).toBe("valid");
    expect(
      validateQueryId("ABCDEF12-3456-7890-ABCD-EF1234567890").status,
    ).toBe("valid");
  });

  it("rejects malformed GUID-like strings that also fail path rules", () => {
    // Contains '?' which is a reserved char.
    expect(validateQueryId("12345678-1234?1234-1234-123456789012").status).toBe(
      "invalid",
    );
  });

  it("accepts a typical Shared Queries path", () => {
    expect(validateQueryId("Shared Queries/Equipo/Bugs").status).toBe("valid");
    expect(validateQueryId("My Queries/Team.RODAT/Open-Bugs_v2").status).toBe(
      "valid",
    );
  });

  it("rejects paths starting or ending with '/'", () => {
    const start = validateQueryId("/Shared Queries/Bugs");
    expect(start.status).toBe("invalid");
    expect(start.message).toMatch(/cannot start or end with/i);

    const end = validateQueryId("Shared Queries/Bugs/");
    expect(end.status).toBe("invalid");
  });

  it("rejects empty segments (consecutive slashes)", () => {
    const r = validateQueryId("Shared Queries//Bugs");
    expect(r.status).toBe("invalid");
    expect(r.message).toMatch(/empty segments/i);
  });

  it("rejects reserved characters in path segments", () => {
    expect(validateQueryId("Shared Queries/Bugs?open").status).toBe("invalid");
    expect(validateQueryId("Shared Queries/Bugs#1").status).toBe("invalid");
    expect(validateQueryId("Shared Queries/Bugs&closed").status).toBe(
      "invalid",
    );
    expect(validateQueryId("Shared Queries/Bugs%20").status).toBe("invalid");
  });

  it("rejects paths exceeding 256 characters", () => {
    const longSegment = "a".repeat(260);
    const r = validateQueryId(longSegment);
    expect(r.status).toBe("invalid");
    expect(r.message).toMatch(/256 characters/);
  });

  it("integrates with validateConnectionFields", () => {
    const result = validateConnectionFields({
      serverUrl: "https://tfs.empresa.net/tfs",
      collection: "RNDCollection",
      project: "SDES",
      team: "Rodat",
      bugsQueryId: "Shared Queries/Bugs",
    });
    expect(result.bugsQueryId.status).toBe("valid");
    expect(result.allRequiredValid).toBe(true);

    const invalid = validateConnectionFields({
      serverUrl: "https://tfs.empresa.net/tfs",
      collection: "RNDCollection",
      project: "SDES",
      team: "Rodat",
      bugsQueryId: "/bad/",
    });
    expect(invalid.bugsQueryId.status).toBe("invalid");
    expect(invalid.allRequiredValid).toBe(false);
  });
});

describe("evaluateSaveGuard (handleSave precondition)", () => {
  const validBugsField = { status: "valid" as const };
  const invalidBugsField = {
    status: "invalid" as const,
    message: "bad path",
  };

  it("blocks save when the connection has not been tested successfully", () => {
    expect(
      evaluateSaveGuard({
        connectionStatus: "idle",
        bugsQueryId: validBugsField,
      }),
    ).toEqual({ canSave: false, reason: "not-tested" });

    expect(
      evaluateSaveGuard({
        connectionStatus: "error",
        bugsQueryId: validBugsField,
      }).canSave,
    ).toBe(false);

    expect(
      evaluateSaveGuard({
        connectionStatus: "testing",
        bugsQueryId: validBugsField,
      }).canSave,
    ).toBe(false);
  });

  it("blocks save when the bugs query ID is invalid, even after a successful test", () => {
    const result = evaluateSaveGuard({
      connectionStatus: "success",
      bugsQueryId: invalidBugsField,
    });
    expect(result).toEqual({ canSave: false, reason: "invalid-bugs-query" });
  });

  it("allows save when connection is success and query is valid or empty", () => {
    expect(
      evaluateSaveGuard({
        connectionStatus: "success",
        bugsQueryId: validBugsField,
      }),
    ).toEqual({ canSave: true });

    expect(
      evaluateSaveGuard({
        connectionStatus: "success",
        bugsQueryId: { status: "empty" },
      }).canSave,
    ).toBe(true);
  });

  it("prioritises the not-tested reason over the invalid query reason", () => {
    const result = evaluateSaveGuard({
      connectionStatus: "idle",
      bugsQueryId: invalidBugsField,
    });
    expect(result.reason).toBe("not-tested");
  });
});
