import { describe, it, expect } from "vitest";
import {
  validateServerUrl,
  validateCollection,
  validateProject,
  validateTeam,
  validateConnectionFields,
} from "@/lib/tfsValidation";

describe("tfsValidation", () => {
  describe("validateServerUrl", () => {
    it("returns empty for blank input", () => {
      expect(validateServerUrl("")).toEqual({ status: "empty" });
      expect(validateServerUrl("   ")).toEqual({ status: "empty" });
    });

    it("rejects URLs without protocol", () => {
      const r = validateServerUrl("tfs.empresa.net/tfs");
      expect(r.status).toBe("invalid");
    });

    it("rejects URLs ending with slash", () => {
      const r = validateServerUrl("https://tfs.empresa.net/tfs/");
      expect(r.status).toBe("invalid");
    });

    it("accepts a valid http/https URL", () => {
      expect(validateServerUrl("https://tfs.empresa.net/tfs").status).toBe("valid");
      expect(validateServerUrl("http://tfs.local/tfs").status).toBe("valid");
    });
  });

  describe("validateCollection / validateProject", () => {
    it("rejects values containing slashes or special chars", () => {
      expect(validateCollection("RND/Collection").status).toBe("invalid");
      expect(validateProject("SDES?").status).toBe("invalid");
    });

    it("accepts simple identifiers with dots, dashes and spaces", () => {
      expect(validateCollection("RNDCollection").status).toBe("valid");
      expect(validateProject("My Project.v2").status).toBe("valid");
    });
  });

  describe("validateTeam", () => {
    it("treats empty as valid (optional field)", () => {
      expect(validateTeam("").status).toBe("valid");
    });

    it("rejects invalid characters", () => {
      expect(validateTeam("Bad/Team").status).toBe("invalid");
    });
  });

  describe("validateConnectionFields", () => {
    it("flips allRequiredValid based on every field", () => {
      const ok = validateConnectionFields({
        serverUrl: "https://tfs.empresa.net/tfs",
        collection: "RNDCollection",
        project: "SDES",
        team: "Rodat",
      });
      expect(ok.allRequiredValid).toBe(true);

      const bad = validateConnectionFields({
        serverUrl: "tfs.empresa.net",
        collection: "RNDCollection",
        project: "SDES",
        team: "",
      });
      expect(bad.allRequiredValid).toBe(false);
      expect(bad.serverUrl.status).toBe("invalid");
      expect(bad.team.status).toBe("valid");
    });
  });
});
