import { supabase } from "@/integrations/supabase/client";

export type ImportKind = "time_booking" | "absences";

export interface ImportHistoryEntry {
  id: string;
  userId: string;
  userEmail: string | null;
  kind: ImportKind;
  sourceFileName: string;
  rangeFrom: string | null;
  rangeTo: string | null;
  rowsProcessed: number;
  importedCount: number;
  skippedCount: number;
  personsCount: number;
  projectsCount: number;
  /** Per-row issues encoded as `{excelRow}|{code}`. */
  rowErrors: string[];
  createdAt: string;
}

interface ImportHistoryRow {
  id: string;
  user_id: string;
  user_email: string | null;
  kind: string;
  source_file_name: string;
  range_from: string | null;
  range_to: string | null;
  rows_processed: number;
  imported_count: number;
  skipped_count: number;
  persons_count: number;
  projects_count: number;
  row_errors: unknown;
  created_at: string;
}

const mapRow = (row: ImportHistoryRow): ImportHistoryEntry => ({
  id: row.id,
  userId: row.user_id,
  userEmail: row.user_email,
  kind: row.kind === "absences" ? "absences" : "time_booking",
  sourceFileName: row.source_file_name,
  rangeFrom: row.range_from,
  rangeTo: row.range_to,
  rowsProcessed: Number(row.rows_processed),
  importedCount: Number(row.imported_count),
  skippedCount: Number(row.skipped_count),
  personsCount: Number(row.persons_count),
  projectsCount: Number(row.projects_count),
  rowErrors: Array.isArray(row.row_errors) ? row.row_errors.map(String) : [],
  createdAt: row.created_at,
});

export const fetchImportHistory = async (kind?: ImportKind): Promise<ImportHistoryEntry[]> => {
  const query = supabase
    .from("import_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const { data, error } = kind ? await query.eq("kind", kind) : await query;
  if (error) throw error;
  return (data as ImportHistoryRow[]).map(mapRow);
};

export interface RecordImportInput {
  kind: ImportKind;
  sourceFileName: string;
  rangeFrom?: string | null;
  rangeTo?: string | null;
  rowsProcessed: number;
  importedCount: number;
  skippedCount?: number;
  personsCount?: number;
  projectsCount?: number;
  rowErrors?: string[];
}

/** Appends an audit entry. Failures never block the import itself. */
export const recordImport = async (input: RecordImportInput): Promise<void> => {
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) return;
  await supabase.from("import_history").insert({
    user_id: user.id,
    user_email: user.email ?? null,
    kind: input.kind,
    source_file_name: input.sourceFileName,
    range_from: input.rangeFrom ?? null,
    range_to: input.rangeTo ?? null,
    rows_processed: input.rowsProcessed,
    imported_count: input.importedCount,
    skipped_count: input.skippedCount ?? 0,
    persons_count: input.personsCount ?? 0,
    projects_count: input.projectsCount ?? 0,
    row_errors: input.rowErrors ?? [],
  });
};
