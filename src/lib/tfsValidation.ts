// Real-time validation for TFS / Azure DevOps Server connection fields.
// Pure functions — no React or DOM dependencies — so they can be unit-tested
// and reused from the settings page, edge functions or future wizards.

import { z } from "zod";

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

export interface ConnectionValidation {
  serverUrl: FieldValidation;
  collection: FieldValidation;
  project: FieldValidation;
  team: FieldValidation;
  /** True only when every required field is valid and team is valid (or empty). */
  allRequiredValid: boolean;
}

export const validateConnectionFields = (input: {
  serverUrl: string;
  collection: string;
  project: string;
  team: string;
}): ConnectionValidation => {
  const serverUrl = validateServerUrl(input.serverUrl);
  const collection = validateCollection(input.collection);
  const project = validateProject(input.project);
  const team = validateTeam(input.team);

  const allRequiredValid =
    serverUrl.status === "valid" &&
    collection.status === "valid" &&
    project.status === "valid" &&
    team.status !== "invalid";

  return { serverUrl, collection, project, team, allRequiredValid };
};
