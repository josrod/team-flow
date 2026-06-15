/**
 * Validación del campo "tema" (topicIds) de un Handover.
 *
 * Reglas unificadas que se aplican tanto en el frontend (formulario de
 * `HandoversPage`) como en la capa de datos (`AppContext.addHandover` /
 * `updateHandover` y el importador JSON):
 *
 *  - `topicIds` debe ser un array.
 *  - No puede quedar vacío: hay que transferir al menos un tema.
 *  - No se permiten duplicados.
 *  - Cada ID debe corresponder a un WorkTopic existente y conocido.
 */

export const HANDOVER_TOPIC_MESSAGES = {
  notArray: "El campo 'tema' debe ser una lista de identificadores.",
  empty: "Selecciona al menos un tema para el handover.",
  duplicates: "El handover contiene temas duplicados.",
  unknown:
    "El handover referencia temas que no existen. Refresca la página e inténtalo de nuevo.",
} as const;

export type HandoverTopicError =
  | "not-array"
  | "empty"
  | "duplicates"
  | "unknown";

export interface HandoverTopicValidation {
  valid: boolean;
  error?: HandoverTopicError;
  message?: string;
  /** IDs that don't exist in the provided catalog (only set when error = "unknown"). */
  unknownIds?: string[];
}

export const validateHandoverTopicIds = (
  topicIds: unknown,
  validTopicIds: ReadonlyArray<string>,
): HandoverTopicValidation => {
  if (!Array.isArray(topicIds)) {
    return {
      valid: false,
      error: "not-array",
      message: HANDOVER_TOPIC_MESSAGES.notArray,
    };
  }

  if (topicIds.length === 0) {
    return {
      valid: false,
      error: "empty",
      message: HANDOVER_TOPIC_MESSAGES.empty,
    };
  }

  const seen = new Set<string>();
  for (const id of topicIds) {
    if (typeof id !== "string" || id.trim() === "") {
      return {
        valid: false,
        error: "not-array",
        message: HANDOVER_TOPIC_MESSAGES.notArray,
      };
    }
    if (seen.has(id)) {
      return {
        valid: false,
        error: "duplicates",
        message: HANDOVER_TOPIC_MESSAGES.duplicates,
      };
    }
    seen.add(id);
  }

  const validSet = new Set(validTopicIds);
  const unknownIds = (topicIds as string[]).filter((id) => !validSet.has(id));
  if (unknownIds.length > 0) {
    return {
      valid: false,
      error: "unknown",
      message: HANDOVER_TOPIC_MESSAGES.unknown,
      unknownIds,
    };
  }

  return { valid: true };
};
