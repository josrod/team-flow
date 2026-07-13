import { useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useLang } from "@/context/LanguageContext";
import { toast } from "sonner";
import { parse as parseCsv } from "papaparse";
import { read as readXlsx, utils as xlsxUtils } from "xlsx";
import { parseISO, isValid, format } from "date-fns";
import { cn } from "@/lib/utils";
import { parseInventAbsentFile, validateInventAbsentFile, type ParseResult } from "@/services/inventAbsentParser";
import { loadLoginMappings, rememberLoginMappings } from "@/services/loginMappingStore";
import { previewImportJson } from "@/lib/validation";
import type { AbsenceType } from "@/types";

type Step = "upload" | "mapping" | "preview";
type Mode = "generic" | "invent" | "json";

interface RawRow {
  [key: string]: string;
}

interface MappedAbsence {
  memberName: string;
  type: string;
  startDate: string;
  endDate: string;
  valid: boolean;
  errors: string[];
  memberId?: string;
}

const REQUIRED_FIELDS = ["memberName", "type", "startDate", "endDate"] as const;
type FieldKey = (typeof REQUIRED_FIELDS)[number];

function tryParseDate(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = parseISO(trimmed);
    return isValid(d) ? format(d, "yyyy-MM-dd") : null;
  }
  const ddMmYyyy = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (ddMmYyyy) {
    const [, day, month, year] = ddMmYyyy;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return isValid(d) ? format(d, "yyyy-MM-dd") : null;
  }
  return null;
}

function normalizeType(raw: string): AbsenceType | null {
  const lower = raw.toLowerCase().trim();
  if (["vacation", "vacaciones", "holiday", "pto", "annual leave"].includes(lower)) return "vacation";
  if (["sick", "sick-leave", "sick leave", "baja", "enfermedad", "medical"].includes(lower)) return "sick-leave";
  if (["work-travel", "work travel", "travel", "viaje", "viaje de trabajo", "business trip"].includes(lower)) return "work-travel";
  if (["other-project", "other project", "otro proyecto", "project", "proyecto"].includes(lower)) return "other-project";
  if (["parental-leave", "parental leave", "parental", "baja maternal", "baja paternal", "baja parental", "maternity", "paternity"].includes(lower)) return "parental-leave";
  return null;
}

export interface ImportResultSummary {
  imported: number;
  skipped: number;
  unmatched: { loginName: string; reason: string }[];
  fileName: string;
}

export function AbsenceImportDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (open: boolean) => void; onImported?: (result: ImportResultSummary) => void }) {
  const { members, absences, addAbsence } = useApp();
  const { t } = useLang();

  const [mode, setMode] = useState<Mode>("generic");
  const [step, setStep] = useState<Step>("upload");
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({
    memberName: "",
    type: "",
    startDate: "",
    endDate: "",
  });
  const [fileName, setFileName] = useState("");
  const [inventResult, setInventResult] = useState<ParseResult | null>(null);
  const [jsonResult, setJsonResult] = useState<{
    rows: Array<{
      memberId: string | null;
      memberName: string;
      type: AbsenceType;
      startDate: string;
      endDate: string;
      status: "ok" | "duplicate" | "missing";
    }>;
  } | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [loginAssignments, setLoginAssignments] = useState<Record<string, string>>({});

  const reset = useCallback(() => {
    setStep("upload");
    setRawRows([]);
    setColumns([]);
    setMapping({ memberName: "", type: "", startDate: "", endDate: "" });
    setFileName("");
    setInventResult(null);
    setJsonResult(null);
    setValidationErrors([]);
    setLoginAssignments({});
  }, []);

  const handleClose = useCallback((val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  }, [onOpenChange, reset]);

  const autoMap = (cols: string[]) => {
    const lowerCols = cols.map((c) => c.toLowerCase());
    const newMapping: Record<FieldKey, string> = { memberName: "", type: "", startDate: "", endDate: "" };

    const namePatterns = ["name", "nombre", "member", "miembro", "persona", "employee", "empleado"];
    const typePatterns = ["type", "tipo", "kind", "clase", "category"];
    const startPatterns = ["start", "inicio", "from", "desde", "begin", "fecha inicio", "start date"];
    const endPatterns = ["end", "fin", "to", "hasta", "fecha fin", "end date"];

    const findMatch = (patterns: string[]) => {
      for (const p of patterns) {
        const idx = lowerCols.findIndex((c) => c.includes(p));
        if (idx !== -1) return cols[idx];
      }
      return "";
    };

    newMapping.memberName = findMatch(namePatterns);
    newMapping.type = findMatch(typePatterns);
    newMapping.startDate = findMatch(startPatterns);
    newMapping.endDate = findMatch(endPatterns);
    setMapping(newMapping);
  };

  const handleJsonFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const preview = previewImportJson(text);
      if (preview.ok === false) {
        setValidationErrors(preview.issues.map((i) => `${i.path}: ${i.message}`));
        return;
      }
      const raw = JSON.parse(text) as {
        members?: Array<{ id: string; name: string }>;
        absences?: Array<{ memberId: string; type: AbsenceType; startDate: string; endDate: string }>;
      };
      const absencesJson = raw.absences ?? [];
      if (absencesJson.length === 0) {
        setValidationErrors([t.importJsonNoAbsences]);
        return;
      }
      const membersById = new Map(members.map((m) => [m.id, m]));
      const membersByName = new Map(members.map((m) => [m.name.toLowerCase(), m]));
      const jsonMembersById = new Map((raw.members ?? []).map((m) => [m.id, m]));
      const existingKeys = new Set(
        absences.map((a) => `${a.memberId}|${a.type}|${a.startDate}|${a.endDate}`),
      );

      const rows = absencesJson.map((a) => {
        let member = membersById.get(a.memberId);
        let memberName = member?.name ?? "";
        if (!member) {
          const src = jsonMembersById.get(a.memberId);
          if (src) {
            memberName = src.name;
            member = membersByName.get(src.name.toLowerCase());
          }
        }
        if (!member) {
          return {
            memberId: null,
            memberName: memberName || a.memberId,
            type: a.type,
            startDate: a.startDate,
            endDate: a.endDate,
            status: "missing" as const,
          };
        }
        const key = `${member.id}|${a.type}|${a.startDate}|${a.endDate}`;
        return {
          memberId: member.id,
          memberName: member.name,
          type: a.type,
          startDate: a.startDate,
          endDate: a.endDate,
          status: existingKeys.has(key) ? ("duplicate" as const) : ("ok" as const),
        };
      });
      setJsonResult({ rows });
      setStep("preview");
    } catch (err) {
      setValidationErrors([err instanceof Error ? err.message : t.importParseError]);
    }
  }, [members, absences, t]);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setValidationErrors([]);
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (mode === "json") {
      if (ext !== "json") {
        setValidationErrors([t.importUnsupportedFormat]);
        return;
      }
      await handleJsonFile(file);
      return;
    }



    if (mode === "invent") {
      if (ext !== "xlsx") {
        setValidationErrors([t.importUnsupportedFormat]);
        return;
      }
      const validation = await validateInventAbsentFile(file);
      if (!validation.ok) {
        setValidationErrors(validation.errors);
        return;
      }
      try {
        const result = await parseInventAbsentFile(file, members);
        setInventResult(result);
        // Pre-fill assignments from previously saved login → member mappings
        const saved = loadLoginMappings();
        const memberIds = new Set(members.map((m) => m.id));
        const prefilled: Record<string, string> = {};
        for (const u of result.unmatched) {
          const mapped = saved[u.loginName.toLowerCase()];
          if (mapped && memberIds.has(mapped)) prefilled[u.loginName] = mapped;
        }
        setLoginAssignments(prefilled);
        setStep("preview");
      } catch {
        setValidationErrors([t.importParseError]);
      }
      return;
    }

    if (ext === "csv" || ext === "txt") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const result = parseCsv<RawRow>(text, { header: true, skipEmptyLines: true });
        if (result.errors.length > 0 && result.data.length === 0) {
          toast.error(t.importParseError);
          return;
        }
        const cols = result.meta.fields ?? [];
        setColumns(cols);
        setRawRows(result.data);
        autoMap(cols);
        setStep("mapping");
      };
      reader.readAsText(file);
    } else if (ext === "xlsx" || ext === "xls") {
      // Auto-detect ROSEN/Invent layout before falling back to generic mapping
      if (ext === "xlsx") {
        const inventValidation = await validateInventAbsentFile(file);
        if (inventValidation.ok) {
          setMode("invent");
          toast.success(t.importAutoDetectedInvent);
          try {
            const result = await parseInventAbsentFile(file, members);
            setInventResult(result);
            const saved = loadLoginMappings();
            const memberIds = new Set(members.map((m) => m.id));
            const prefilled: Record<string, string> = {};
            for (const u of result.unmatched) {
              const mapped = saved[u.loginName.toLowerCase()];
              if (mapped && memberIds.has(mapped)) prefilled[u.loginName] = mapped;
            }
            setLoginAssignments(prefilled);
            setStep("preview");
          } catch {
            setValidationErrors([t.importParseError]);
          }
          return;
        }
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = readXlsx(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = xlsxUtils.sheet_to_json<RawRow>(sheet, { defval: "" });
        if (rows.length === 0) {
          toast.error(t.importEmpty);
          return;
        }
        const cols = Object.keys(rows[0]);
        setColumns(cols);
        setRawRows(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))));
        autoMap(cols);
        setStep("mapping");
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast.error(t.importUnsupportedFormat);
    }
  }, [mode, members, t, handleJsonFile]);

  const mappedData: MappedAbsence[] = useMemo(() => {
    if (step !== "preview" || mode !== "generic") return [];
    return rawRows.map((row) => {
      const errors: string[] = [];
      const memberName = (row[mapping.memberName] ?? "").trim();
      const rawType = (row[mapping.type] ?? "").trim();
      const rawStart = (row[mapping.startDate] ?? "").trim();
      const rawEnd = (row[mapping.endDate] ?? "").trim();

      if (!memberName) errors.push(t.importErrNoName);
      const member = members.find((m) => m.name.toLowerCase() === memberName.toLowerCase());
      if (memberName && !member) errors.push(t.importErrMemberNotFound);

      const type = normalizeType(rawType);
      if (!type) errors.push(t.importErrInvalidType);

      const startDate = tryParseDate(rawStart);
      if (!startDate) errors.push(t.importErrInvalidStart);

      const endDate = tryParseDate(rawEnd);
      if (!endDate) errors.push(t.importErrInvalidEnd);

      if (startDate && endDate && startDate > endDate) errors.push(t.importErrDateOrder);

      return {
        memberName,
        type: type ?? rawType,
        startDate: startDate ?? rawStart,
        endDate: endDate ?? rawEnd,
        valid: errors.length === 0,
        errors,
        memberId: member?.id,
      };
    });
  }, [step, mode, rawRows, mapping, members, t]);

  const validCount = mappedData.filter((r) => r.valid).length;
  const invalidCount = mappedData.length - validCount;

  const allMapped = REQUIRED_FIELDS.every((f) => mapping[f] !== "");

  const handleImport = () => {
    const validRows = mappedData.filter((r) => r.valid && r.memberId);
    let imported = 0;
    for (const row of validRows) {
      addAbsence({
        memberId: row.memberId!,
        type: row.type as AbsenceType,
        startDate: row.startDate,
        endDate: row.endDate,
      });
      imported++;
    }
    toast.success(`📥 ${imported} ${t.importSuccess}`);
    onImported?.({ imported, skipped: mappedData.length - imported, unmatched: [], fileName });
    handleClose(false);
  };

  const assignedExtraCount = useMemo(() => {
    if (!inventResult) return 0;
    return inventResult.unmatched.reduce(
      (acc, u) => acc + (loginAssignments[u.loginName] ? u.ranges.length : 0),
      0
    );
  }, [inventResult, loginAssignments]);

  const handleInventImport = () => {
    if (!inventResult) return;
    let imported = 0;
    for (const a of inventResult.absences) {
      addAbsence({
        memberId: a.memberId,
        type: a.type,
        startDate: a.startDate,
        endDate: a.endDate,
      });
      imported++;
    }
    // Apply manual login → member assignments
    const stillUnmatched: typeof inventResult.unmatched = [];
    for (const u of inventResult.unmatched) {
      const memberId = loginAssignments[u.loginName];
      if (!memberId) {
        stillUnmatched.push(u);
        continue;
      }
      for (const r of u.ranges) {
        addAbsence({
          memberId,
          type: r.type,
          startDate: r.startDate,
          endDate: r.endDate,
        });
        imported++;
      }
    }
    // Persist login → member mappings used in this import for future reuse
    rememberLoginMappings(loginAssignments);
    toast.success(`📥 ${imported} ${t.importSuccess}`);
    onImported?.({
      imported,
      skipped: inventResult.skipped,
      unmatched: stillUnmatched,
      fileName,
    });
    handleClose(false);
  };


  const openFilePicker = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = mode === "invent" ? ".xlsx" : mode === "json" ? ".json" : ".csv,.xlsx,.xls";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleFile(file);
    };
    input.click();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {t.importAbsences}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); reset(); }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="generic">{t.importModeGeneric}</TabsTrigger>
                <TabsTrigger value="invent">{t.importModeInvent}</TabsTrigger>
              </TabsList>
            </Tabs>

            <div
              className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={openFilePicker}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="font-medium">
                {mode === "invent" ? t.importInventDropzone : t.importDropzone}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {mode === "invent" ? t.importInventFormats : t.importFormats}
              </p>
            </div>

            {validationErrors.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-destructive">
                      {t.importValidationFailed}
                      {fileName ? ` · ${fileName}` : ""}
                    </p>
                    <ul className="text-xs text-destructive/90 mt-1 space-y-0.5 list-disc list-inside">
                      {validationErrors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      {t.importValidationHint}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "mapping" && mode === "generic" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {fileName} — {rawRows.length} {t.importRows}
              </p>
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="h-4 w-4 mr-1" /> {t.importChangeFile}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {REQUIRED_FIELDS.map((field) => (
                <div key={field}>
                  <Label className="text-xs">
                    {field === "memberName" ? t.person
                      : field === "type" ? t.type
                      : field === "startDate" ? t.start
                      : t.end}
                    <span className="text-destructive ml-0.5">*</span>
                  </Label>
                  <Select value={mapping[field]} onValueChange={(v) => setMapping((m) => ({ ...m, [field]: v }))}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={t.importSelectColumn} />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((col) => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {rawRows.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t.importPreviewSample}</p>
                <ScrollArea className="h-[120px] border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {columns.slice(0, 6).map((col) => (
                          <TableHead key={col} className="text-xs py-1 px-2">{col}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rawRows.slice(0, 3).map((row, i) => (
                        <TableRow key={i}>
                          {columns.slice(0, 6).map((col) => (
                            <TableCell key={col} className="text-xs py-1 px-2 truncate max-w-[120px]">{row[col]}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}

            <Button onClick={() => setStep("preview")} disabled={!allMapped} className="w-full">
              {t.importValidate}
            </Button>
          </div>
        )}

        {step === "preview" && mode === "generic" && (
          <div className="space-y-3 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> {validCount} {t.importValid}
              </Badge>
              {invalidCount > 0 && (
                <Badge variant="outline" className="gap-1 text-destructive border-destructive/30">
                  <AlertTriangle className="h-3 w-3" /> {invalidCount} {t.importInvalid}
                </Badge>
              )}
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setStep("mapping")}>
                {t.importBackToMapping}
              </Button>
            </div>

            <ScrollArea className="flex-1 min-h-0 border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs py-1 px-2 w-8">#</TableHead>
                    <TableHead className="text-xs py-1 px-2">{t.person}</TableHead>
                    <TableHead className="text-xs py-1 px-2">{t.type}</TableHead>
                    <TableHead className="text-xs py-1 px-2">{t.start}</TableHead>
                    <TableHead className="text-xs py-1 px-2">{t.end}</TableHead>
                    <TableHead className="text-xs py-1 px-2">{t.status}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappedData.map((row, i) => (
                    <TableRow key={i} className={cn(!row.valid && "bg-destructive/5")}>
                      <TableCell className="text-xs py-1 px-2 text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-xs py-1 px-2">{row.memberName}</TableCell>
                      <TableCell className="text-xs py-1 px-2">{row.type}</TableCell>
                      <TableCell className="text-xs py-1 px-2">{row.startDate}</TableCell>
                      <TableCell className="text-xs py-1 px-2">{row.endDate}</TableCell>
                      <TableCell className="text-xs py-1 px-2">
                        {row.valid ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <span className="text-destructive text-[10px]">{row.errors.join("; ")}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <Button onClick={handleImport} disabled={validCount === 0} className="w-full">
              {t.importConfirm} ({validCount})
            </Button>
          </div>
        )}

        {step === "preview" && mode === "invent" && inventResult && (
          <div className="space-y-3 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground flex-1">
                {fileName} —{" "}
                {t.importInventSummary
                  .replace("{imported}", String(inventResult.absences.length))
                  .replace("{unmatched}", String(inventResult.unmatched.length))
                  .replace("{skipped}", String(inventResult.skipped))}
              </p>
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="h-4 w-4 mr-1" /> {t.importChangeFile}
              </Button>
            </div>

            <ScrollArea className="flex-1 min-h-0 border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs py-1 px-2">{t.importInventLoginCol}</TableHead>
                    <TableHead className="text-xs py-1 px-2">{t.importInventMemberCol}</TableHead>
                    <TableHead className="text-xs py-1 px-2">{t.type}</TableHead>
                    <TableHead className="text-xs py-1 px-2">{t.start}</TableHead>
                    <TableHead className="text-xs py-1 px-2">{t.end}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventResult.absences.map((a, i) => (
                    <TableRow key={`ok-${i}`}>
                      <TableCell className="text-xs py-1 px-2 font-mono">{a.loginName}</TableCell>
                      <TableCell className="text-xs py-1 px-2">{a.memberName}</TableCell>
                      <TableCell className="text-xs py-1 px-2">{a.type}</TableCell>
                      <TableCell className="text-xs py-1 px-2">{a.startDate}</TableCell>
                      <TableCell className="text-xs py-1 px-2">{a.endDate}</TableCell>
                    </TableRow>
                  ))}
                  {inventResult.unmatched.map((u, i) => {
                    const assigned = loginAssignments[u.loginName];
                    return (
                      <TableRow key={`ko-${i}`} className={cn(!assigned && "bg-destructive/5")}>
                        <TableCell className="text-xs py-1 px-2 font-mono align-top">
                          {u.loginName}
                          <div className="text-[10px] text-muted-foreground font-sans">
                            {u.ranges.length} {t.importUnmatchedRangesLabel}
                          </div>
                        </TableCell>
                        <TableCell colSpan={4} className="text-xs py-1 px-2">
                          <Select
                            value={assigned ?? ""}
                            onValueChange={(v) =>
                              setLoginAssignments((prev) => {
                                const next = { ...prev };
                                if (v) next[u.loginName] = v;
                                else delete next[u.loginName];
                                return next;
                              })
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder={t.importAssignToMember} />
                            </SelectTrigger>
                            <SelectContent>
                              {members.map((m) => (
                                <SelectItem key={m.id} value={m.id} className="text-xs">
                                  {m.name}
                                  {m.loginName ? ` (${m.loginName})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>

            <Button
              onClick={handleInventImport}
              disabled={inventResult.absences.length === 0 && assignedExtraCount === 0}
              className="w-full"
            >
              {t.importConfirm} ({inventResult.absences.length + assignedExtraCount})
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
