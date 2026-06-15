// Real-time validation for TFS / Azure DevOps Server connection fields.
// Pure functions — no React or DOM dependencies — so they can be unit-tested
// and reused from the settings page, edge functions or future wizards.

import { z } from "zod";
import { BUGS_QUERY_MESSAGES } from "@/lib/bugsQueryMessages";

export type FieldStatus = "empty" | "valid" | "invalid";

export interface FieldValidation {
  status: FieldStatus;
  message?: string;
}

/** Identifier-like segment used for collection / project / team names. */
const IDENTIFIER_REGEX = /^[A-Za-z0-9._\- ]+$/;

const RESERVED_PATH_CHARS = /[\\/?#%&]/;

const serverUrlSchema = z
  .string()
  .trim()
  .min(1, "Introduce la URL del servidor TFS.")
  .max(2048, "La URL es demasiado larga.")
  .refine(
    (value) => /^https?:\/\//i.test(value),
    "Debe empezar por http:// o https://",
  )
  .refine((value) => {
    try {
      const url = new URL(value);
      return Boolean(url.hostname);
    } catch {
      return false;
    }
  }, "URL no válida.")
  .refine((value) => !value.endsWith("/"), "Quita la barra final '/'.");

const buildIdentifierSchema = (label: string, max = 64) =>
  z
    .string()
    .trim()
    .min(1, `Introduce ${label}.`)
    .max(max, `${label} no puede superar ${max} caracteres.`)
    .refine(
      (value) => !RESERVED_PATH_CHARS.test(value),
      "Contiene caracteres no permitidos (\\ / ? # % &).",
    )
    .refine(
      (value) => IDENTIFIER_REGEX.test(value),
      "Solo se permiten letras, números, espacios, '.', '_' y '-'.",
    );

const collectionSchema = buildIdentifierSchema("la colección");
const projectSchema = buildIdentifierSchema("el proyecto");
const teamSchema = buildIdentifierSchema("el equipo");

const validateWith = (
  schema: z.ZodTypeAny,
  raw: string,
): FieldValidation => {
  if (raw.trim().length === 0) {
    return { status: "empty" };
  }
  const result = schema.safeParse(raw);
  if (result.success) {
    return { status: "valid" };
  }
  const message = result.error.issues[0]?.message ?? "Valor no válido.";
  return { status: "invalid", message };
};

export const validateServerUrl = (raw: string): FieldValidation =>
  validateWith(serverUrlSchema, raw);

export const validateCollection = (raw: string): FieldValidation =>
  validateWith(collectionSchema, raw);

export const validateProject = (raw: string): FieldValidation =>
  validateWith(projectSchema, raw);

/** Team is optional — empty is considered valid (not "empty"). */
export const validateTeam = (raw: string): FieldValidation => {
  if (raw.trim().length === 0) {
    return { status: "valid" };
  }
  return validateWith(teamSchema, raw);
};

/** Azure DevOps query ID or path validation.
 *  Accepts:
 *   - Empty (optional field)
 *   - GUID: 12345678-1234-1234-1234-123456789012
 *   - Query path: Shared Queries/Equipo/Bugs
 */
const GUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const validateQueryId = (raw: string): FieldValidation => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { status: "valid" };
  }

  if (GUID_REGEX.test(trimmed)) {
    return { status: "valid" };
  }

  // Path validation
  if (trimmed.length > 256) {
    return { status: "invalid", message: BUGS_QUERY_MESSAGES.tooLong };
  }
  if (trimmed.startsWith("/") || trimmed.endsWith("/")) {
    return { status: "invalid", message: BUGS_QUERY_MESSAGES.startOrEndSlash };
  }
  if (/\/\//.test(trimmed)) {
    return { status: "invalid", message: BUGS_QUERY_MESSAGES.emptySegments };
  }
  // Reserved characters check — exclude '/' here since paths use it as separator.
  if (/[\\?#%&]/.test(trimmed)) {
    return { status: "invalid", message: BUGS_QUERY_MESSAGES.reservedChars };
  }
  if (!IDENTIFIER_REGEX.test(trimmed.replace(/\//g, ""))) {
    return { status: "invalid", message: BUGS_QUERY_MESSAGES.invalidChars };
  }

  return { status: "valid" };
};

export interface ConnectionValidation {
  serverUrl: FieldValidation;
  collection: FieldValidation;
  project: FieldValidation;
  team: FieldValidation;
  bugsQueryId: FieldValidation;
  /** True only when every required field is valid and team is valid (or empty). */
  allRequiredValid: boolean;
}

export const validateConnectionFields = (input: {
  serverUrl: string;
  collection: string;
  project: string;
  team: string;
  bugsQueryId?: string;
}): ConnectionValidation => {
  const serverUrl = validateServerUrl(input.serverUrl);
  const collection = validateCollection(input.collection);
  const project = validateProject(input.project);
  const team = validateTeam(input.team);
  const bugsQueryId = validateQueryId(input.bugsQueryId ?? "");

  const allRequiredValid =
    serverUrl.status === "valid" &&
    collection.status === "valid" &&
    project.status === "valid" &&
    team.status !== "invalid" &&
    bugsQueryId.status !== "invalid";

  return { serverUrl, collection, project, team, bugsQueryId, allRequiredValid };
};

export type SaveBlockReason = "not-tested" | "invalid-bugs-query";

export interface SaveGuardResult {
  canSave: boolean;
  reason?: SaveBlockReason;
}

/**
 * Pure guard mirroring the precondition checks at the top of
 * `handleSave` in AzureDevOpsSettingsPage. Extracted so it can be
 * unit-tested without mounting the page or mocking Supabase.
 */
export const evaluateSaveGuard = (input: {
  connectionStatus: "idle" | "testing" | "success" | "error" | string;
  bugsQueryId: FieldValidation;
}): SaveGuardResult => {
  if (input.connectionStatus !== "success") {
    return { canSave: false, reason: "not-tested" };
  }
  if (input.bugsQueryId.status === "invalid") {
    return { canSave: false, reason: "invalid-bugs-query" };
  }
  return { canSave: true };
};
