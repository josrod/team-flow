import { useCallback, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApp } from "@/context/AppContext";
import { useLang } from "@/context/LanguageContext";
import { formatHours, formatIsoDay } from "@/lib/inventValues";
import {
  parseTimeBookingFile,
  validateTimeBookingFile,
  type TimeBookingParseResult,
} from "@/services/inventTimeBookingParser";
import { importTimeBookings } from "@/services/timeBookingService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

export function TimeBookingImportDialog({ open, onOpenChange, onImported }: Props) {
  const { members } = useApp();
  const { t } = useLang();
  const [result, setResult] = useState<TimeBookingParseResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setResult(null);
    setErrors([]);
    setBusy(false);
  }, []);

  const handleClose = useCallback(
    (value: boolean) => {
      if (!value) reset();
      onOpenChange(value);
    },
    [onOpenChange, reset]
  );

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setErrors([]);
    setBusy(true);
    try {
      const validation = await validateTimeBookingFile(file);
      if (!validation.ok) {
        setErrors(validation.errors);
        return;
      }
      setResult(await parseTimeBookingFile(file));
    } catch {
      setErrors(["timeBookingErrUnreadable"]);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const summary = await importTimeBookings(result.items, members, result.sourceFileName, {
        persons: result.persons,
        projects: result.projects,
        warnings: result.warnings,
        rowsProcessed: result.rowsProcessed,
      });

      toast.success(
        t.timeBookingImportSuccess
          .replace("{n}", String(summary.imported))
          .replace("{replaced}", String(summary.replaced))
      );
      onImported?.();
      handleClose(false);
    } catch (error) {
      toast.error(t.timeBookingImportError, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const translateError = (key: string) => (t as unknown as Record<string, string>)[key] ?? key;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t.timeBookingImport}</DialogTitle>
          <DialogDescription>{t.timeBookingImportHint}</DialogDescription>
        </DialogHeader>

        {!result && (
          <label className="flex flex-col items-center justify-center gap-2 border border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/50 transition-colors">
            {busy ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="h-6 w-6 text-muted-foreground" />
            )}
            <span className="text-sm text-muted-foreground">INVENT Time Booking (.xlsx)</span>
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
        )}

        {errors.length > 0 && (
          <ul className="rounded-lg border border-destructive/40 bg-destructive/5 p-2 space-y-1">
            {errors.map((key) => (
              <li key={key} className="text-xs text-destructive flex items-start gap-1">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {translateError(key)}
              </li>
            ))}
          </ul>
        )}

        {result && (
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground flex-1">
                {result.sourceFileName} —{" "}
                {t.timeBookingPreviewSummary
                  .replace("{items}", String(result.items.length))
                  .replace("{persons}", String(result.persons))
                  .replace("{projects}", String(result.projects))}
              </p>
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="h-4 w-4 mr-1" /> {t.importChangeFile}
              </Button>
            </div>

            {result.warnings.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-2 max-h-24 overflow-auto">
                <p className="text-xs font-medium flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  {t.importRowWarningsTitle.replace("{n}", String(result.warnings.length))}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {result.warnings.slice(0, 30).map((warning) => (
                    <li key={warning} className="text-[11px] text-muted-foreground">
                      {t.importRowWarningMissing.replace("{row}", warning.split("|")[0])}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ScrollArea className="flex-1 min-h-0 border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs py-1 px-2">{t.timeBookingColDate}</TableHead>
                    <TableHead className="text-xs py-1 px-2">{t.timeBookingColPerson}</TableHead>
                    <TableHead className="text-xs py-1 px-2">{t.timeBookingColProject}</TableHead>
                    <TableHead className="text-xs py-1 px-2">{t.timeBookingColTask}</TableHead>
                    <TableHead className="text-xs py-1 px-2">{t.timeBookingColActivity}</TableHead>
                    <TableHead className="text-xs py-1 px-2 text-right">{t.timeBookingColHours}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.slice(0, 200).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs py-1 px-2">{formatIsoDay(item.workDate)}</TableCell>
                      <TableCell className="text-xs py-1 px-2">{item.person}</TableCell>
                      <TableCell className="text-xs py-1 px-2 font-mono">{item.projectCode}</TableCell>
                      <TableCell className="text-xs py-1 px-2">{item.taskName}</TableCell>
                      <TableCell className="text-xs py-1 px-2">{item.activityKind}</TableCell>
                      <TableCell className="text-xs py-1 px-2 text-right tabular-nums">
                        {formatHours(item.duration)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <Button onClick={handleImport} disabled={busy || result.items.length === 0} className="w-full">
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t.timeBookingConfirm} ({result.items.length})
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
