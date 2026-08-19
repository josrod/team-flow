// Shared normalizers for INVENT Excel exports (Time Booking and Absences).
// Column values arrive as native numbers, native Dates, Excel serials or
// European-formatted text, so every reader funnels through these helpers.

/** Days between the Excel epoch (1899-12-30) and the Unix epoch. */
const EXCEL_EPOCH_OFFSET_DAYS = 25569;
const MS_PER_DAY = 86_400_000;

/** Trimmed text; nullish becomes an empty string and Dates become ISO. */
export const asText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  return String(value).trim();
};

/** Number accepting the European decimal comma; unparseable values become 0. */
export const asNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = asText(value).replace(/\s/g, "").replace(",", ".");
  if (!text) return 0;
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Optional integer where blank and 0 both mean "no value". */
export const asOptionalInt = (value: unknown): number | undefined => {
  const num = asNumber(value);
  if (!Number.isFinite(num)) return undefined;
  const truncated = Math.trunc(num);
  return truncated === 0 ? undefined : truncated;
};

const isoDay = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

/**
 * Parses a cell into an ISO day (`YYYY-MM-DD`), accepting native Dates, Excel
 * serial numbers, European `DD/MM/YYYY` / `DD.MM.YYYY` / `DD-MM-YYYY` text and
 * ISO strings. Returns null when nothing can be parsed.
 */
export const asIsoDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : isoDay(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return isoDay(new Date(Math.round((value - EXCEL_EPOCH_OFFSET_DAYS) * MS_PER_DAY)));
  }

  const text = asText(value);
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const parsed = new Date(`${text.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : isoDay(parsed);
  }

  const european = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (european) {
    const [, day, month, year] = european;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(parsed.getTime()) ? null : isoDay(parsed);
  }

  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 10_000) {
    return isoDay(new Date(Math.round((serial - EXCEL_EPOCH_OFFSET_DAYS) * MS_PER_DAY)));
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : isoDay(fallback);
};

/** Formats an ISO day as `DD/MM/YYYY` for the UI. */
export const formatIsoDay = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return "—";
  return `${day}/${month}/${year}`;
};

/** Formats hours with a decimal comma, e.g. `8,50 h`. */
export const formatHours = (hours: number | null | undefined): string => {
  const value = typeof hours === "number" && Number.isFinite(hours) ? hours : 0;
  return `${value.toFixed(2).replace(".", ",")} h`;
};
