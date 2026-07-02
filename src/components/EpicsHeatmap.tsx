import { useMemo, useState } from "react";
import type { TfsEpic } from "@/services/tfs";
import { useLang } from "@/context/LanguageContext";
import {
  NO_DATE_BUCKET,
  ensureUpcomingQuarters,
  parseBucketId,
  quarterLabel,
  type QuarterBucket,
} from "@/lib/quarters";
import { getEpicQuarterSpan } from "@/lib/epicSpan";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface EpicsHeatmapProps {
  epics: TfsEpic[];
  onOpenEpic: (epic: TfsEpic) => void;
}

type RowMode = "area" | "assignee";

const intensityClass = (value: number, max: number): string => {
  if (value === 0 || max === 0) return "bg-muted/30";
  const ratio = value / max;
  if (ratio > 0.8) return "bg-primary text-primary-foreground";
  if (ratio > 0.6) return "bg-primary/75 text-primary-foreground";
  if (ratio > 0.4) return "bg-primary/55";
  if (ratio > 0.2) return "bg-primary/35";
  return "bg-primary/20";
};

export const EpicsHeatmap = ({ epics, onOpenEpic }: EpicsHeatmapProps) => {
  const { t } = useLang();
  const [rowMode, setRowMode] = useState<RowMode>("area");
  const [quartersAhead, setQuartersAhead] = useState<3 | 5 | 7>(3);
  const [openCell, setOpenCell] = useState<{ row: string; bucket: QuarterBucket } | null>(null);

  const visibleBuckets = useMemo(() => {
    const base = ensureUpcomingQuarters([], new Date(), quartersAhead).filter(
      (b) => parseBucketId(b) !== null,
    );
    // Always keep the NO_DATE column at the end.
    return [...base, NO_DATE_BUCKET] as QuarterBucket[];
  }, [quartersAhead]);

  const { rowKeys, matrix, epicsByCell, maxValue } = useMemo(() => {
    const cellMap = new Map<string, TfsEpic[]>();
    const rowSet = new Set<string>();
    const cellKey = (row: string, bucket: QuarterBucket) => `${row}||${bucket}`;

    for (const epic of epics) {
      const rowKey =
        rowMode === "area"
          ? epic.areaPath ?? t.epicsUnassigned
          : epic.assignedTo ?? t.epicsUnassigned;
      rowSet.add(rowKey);
      const buckets = getEpicQuarterSpan(epic, visibleBuckets);
      const relevant = buckets.filter((b) => visibleBuckets.includes(b));
      for (const b of relevant) {
        const k = cellKey(rowKey, b);
        if (!cellMap.has(k)) cellMap.set(k, []);
        cellMap.get(k)!.push(epic);
      }
    }

    const rows = Array.from(rowSet).sort((a, b) => a.localeCompare(b));
    const mat: number[][] = rows.map((r) =>
      visibleBuckets.map((b) => cellMap.get(cellKey(r, b))?.length ?? 0),
    );
    let max = 0;
    for (const row of mat) for (const v of row) if (v > max) max = v;
    return { rowKeys: rows, matrix: mat, epicsByCell: cellMap, maxValue: max };
  }, [epics, visibleBuckets, rowMode, t.epicsUnassigned]);

  const columnTotals = useMemo(
    () => visibleBuckets.map((_, colIdx) => matrix.reduce((s, row) => s + row[colIdx], 0)),
    [matrix, visibleBuckets],
  );
  const rowTotals = useMemo(
    () => matrix.map((row) => row.reduce((s, v) => s + v, 0)),
    [matrix],
  );
  const grandTotal = useMemo(() => rowTotals.reduce((s, v) => s + v, 0), [rowTotals]);

  const cellEpics = (row: string, bucket: QuarterBucket) =>
    epicsByCell.get(`${row}||${bucket}`) ?? [];

  const activeCellEpics = openCell ? cellEpics(openCell.row, openCell.bucket) : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select value={rowMode} onValueChange={(v) => setRowMode(v as RowMode)}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder={t.epicsHeatmapRowBy} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="area">{t.epicsGroupArea}</SelectItem>
            <SelectItem value="assignee">{t.epicsGroupAssignee}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(quartersAhead)} onValueChange={(v) => setQuartersAhead(Number(v) as 3 | 5 | 7)}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">{t.epicsTimelineRange4}</SelectItem>
            <SelectItem value="5">{t.epicsTimelineRange6}</SelectItem>
            <SelectItem value="7">{t.epicsTimelineRange8}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-muted/40 z-10 min-w-[220px] border-r">
                {rowMode === "area" ? t.epicsColArea : t.epicsColAssignee}
              </th>
              {visibleBuckets.map((b) => {
                const parsed = parseBucketId(b);
                const label = parsed ? quarterLabel(parsed) : t.epicsHeatmapNoDateColumn;
                return (
                  <th key={b} className="px-2 py-2 font-semibold text-center border-r last:border-r-0">
                    {label}
                  </th>
                );
              })}
              <th className="px-2 py-2 font-semibold text-center bg-muted/60">{t.epicsHeatmapTotal}</th>
            </tr>
          </thead>
          <tbody>
            {rowKeys.length === 0 ? (
              <tr>
                <td colSpan={visibleBuckets.length + 2} className="text-center text-muted-foreground py-8">
                  {t.epicsNoResults}
                </td>
              </tr>
            ) : (
              <TooltipProvider delayDuration={200}>
                {rowKeys.map((row, rIdx) => (
                  <tr key={row} className="border-t">
                    <td className="px-3 py-1.5 sticky left-0 bg-background z-10 border-r font-mono text-[11px] truncate max-w-[280px]">
                      {row}
                    </td>
                    {visibleBuckets.map((b, cIdx) => {
                      const value = matrix[rIdx][cIdx];
                      const items = cellEpics(row, b);
                      return (
                        <td key={b} className="p-1 text-center border-r last:border-r-0">
                          {value === 0 ? (
                            <div className={cn("h-8 rounded-sm flex items-center justify-center text-muted-foreground/60", intensityClass(0, maxValue))}>
                              ·
                            </div>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => setOpenCell({ row, bucket: b })}
                                  className={cn(
                                    "h-8 w-full rounded-sm font-semibold hover:ring-2 hover:ring-primary/50 transition-shadow",
                                    intensityClass(value, maxValue),
                                  )}
                                >
                                  {value}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <div className="space-y-1">
                                  {items.slice(0, 5).map((e) => (
                                    <div key={e.id} className="text-xs">
                                      <span className="font-mono text-muted-foreground mr-1">#{e.id}</span>
                                      {e.title}
                                    </div>
                                  ))}
                                  {items.length > 5 && (
                                    <div className="text-[11px] text-muted-foreground">
                                      +{items.length - 5}
                                    </div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-center font-semibold bg-muted/30">
                      {rowTotals[rIdx]}
                    </td>
                  </tr>
                ))}
              </TooltipProvider>
            )}
          </tbody>
          {rowKeys.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/50">
                <td className="px-3 py-2 font-semibold sticky left-0 bg-muted/50 z-10 border-r">
                  {t.epicsHeatmapTotal}
                </td>
                {columnTotals.map((v, i) => (
                  <td key={visibleBuckets[i]} className="px-2 py-2 text-center font-semibold border-r last:border-r-0">
                    {v}
                  </td>
                ))}
                <td className="px-2 py-2 text-center font-bold bg-muted/70">{grandTotal}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Dialog open={!!openCell} onOpenChange={(o) => !o && setOpenCell(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">
              {openCell && (
                <>
                  {openCell.row}
                  <span className="text-muted-foreground font-normal ml-2">
                    ·{" "}
                    {parseBucketId(openCell.bucket)
                      ? quarterLabel(parseBucketId(openCell.bucket)!)
                      : t.epicsHeatmapNoDateColumn}
                  </span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-2">
              {activeCellEpics.map((epic) => (
                <button
                  key={epic.id}
                  type="button"
                  onClick={() => {
                    onOpenEpic(epic);
                    setOpenCell(null);
                  }}
                  className="w-full text-left rounded-md border p-2.5 hover:border-primary hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">#{epic.id}</span>
                    <Badge variant="outline" className="text-[10px]">{epic.state}</Badge>
                  </div>
                  <div className="mt-1 text-sm font-medium">{epic.title}</div>
                  {epic.assignedTo && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">{epic.assignedTo}</div>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};
