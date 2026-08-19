import { useCallback, useEffect, useState } from "react";
import { History, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLang } from "@/context/LanguageContext";
import { formatIsoDay } from "@/lib/inventValues";
import {
  fetchImportHistory,
  type ImportHistoryEntry,
  type ImportKind,
} from "@/services/importHistoryService";

interface Props {
  kind?: ImportKind;
  /** Bumped by the parent after a successful import to refresh the list. */
  refreshKey?: number;
}

const formatDateTime = (iso: string) => {
  const date = new Date(iso);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

export function ImportHistoryPanel({ kind, refreshKey = 0 }: Props) {
  const { t } = useLang();
  const [entries, setEntries] = useState<ImportHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await fetchImportHistory(kind));
    } catch (error) {
      toast.error(t.importHistoryLoadError, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [kind, t.importHistoryLoadError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const kindLabel = (entryKind: ImportKind) =>
    entryKind === "absences" ? t.importHistoryKindAbsences : t.importHistoryKindTimeBooking;

  const rangeLabel = (entry: ImportHistoryEntry) =>
    entry.rangeFrom && entry.rangeTo
      ? `${formatIsoDay(entry.rangeFrom)} – ${formatIsoDay(entry.rangeTo)}`
      : "—";

  const errorLabel = (code: string) => {
    const [row] = code.split("|");
    return t.importRowWarningMissing.replace("{row}", row);
  };


  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            {t.importHistoryTitle}
          </CardTitle>
          <CardDescription className="text-xs">{t.importHistoryDescription}</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t.importHistoryEmpty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t.importHistoryColDate}</TableHead>
                <TableHead className="text-xs">{t.importHistoryColUser}</TableHead>
                <TableHead className="text-xs">{t.importHistoryColKind}</TableHead>
                <TableHead className="text-xs">{t.importHistoryColFile}</TableHead>
                <TableHead className="text-xs">{t.importHistoryColRange}</TableHead>
                <TableHead className="text-xs text-right">{t.importHistoryColRows}</TableHead>
                <TableHead className="text-xs text-right">{t.importHistoryColImported}</TableHead>
                <TableHead className="text-xs">{t.importHistoryColErrors}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs whitespace-nowrap">{formatDateTime(entry.createdAt)}</TableCell>
                  <TableCell className="text-xs max-w-[180px] truncate">
                    {entry.userEmail ?? t.importHistoryUnknownUser}
                  </TableCell>
                  <TableCell className="text-xs">{kindLabel(entry.kind)}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{entry.sourceFileName}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{rangeLabel(entry)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{entry.rowsProcessed}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{entry.importedCount}</TableCell>
                  <TableCell className="text-xs">
                    {entry.rowErrors.length === 0 ? (
                      <Badge variant="outline">{t.importHistoryNoErrors}</Badge>
                    ) : (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive">
                            {t.importHistoryErrorsCount.replace("{n}", String(entry.rowErrors.length))}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <ul className="mt-1 max-h-32 overflow-auto space-y-0.5">
                            {entry.rowErrors.map((code) => (
                              <li key={code} className="text-[11px] text-muted-foreground">
                                {errorLabel(code)}
                              </li>
                            ))}
                          </ul>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
