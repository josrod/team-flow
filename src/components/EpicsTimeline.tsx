import { useMemo, useState } from "react";
import type { TfsEpic } from "@/services/tfs";
import { useLang } from "@/context/LanguageContext";
import {
  ensureUpcomingQuarters,
  parseBucketId,
  quarterLabel,
  quarterRange,
  type QuarterBucket,
} from "@/lib/quarters";
import { getEpicQuarterSpan } from "@/lib/epicSpan";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface EpicsTimelineProps {
  epics: TfsEpic[];
  onOpenEpic: (epic: TfsEpic) => void;
}

type GroupMode = "none" | "area" | "assignee";

const formatDate = (iso?: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

// Semantic colour per Azure DevOps state, using theme tokens only.
const stateBarClass = (state: string): string => {
  const s = state.toLowerCase();
  if (s === "closed" || s === "done" || s === "completed") return "bg-muted-foreground/60";
  if (s === "resolved") return "bg-primary/70";
  if (s === "active" || s === "in progress" || s === "committed") return "bg-primary";
  if (s === "new" || s === "proposed" || s === "to do") return "bg-primary/40";
  return "bg-primary/50";
};

export const EpicsTimeline = ({ epics, onOpenEpic }: EpicsTimelineProps) => {
  const { t } = useLang();
  const [weeksAhead, setWeeksAhead] = useState<3 | 5 | 7>(3);
  const [groupBy, setGroupBy] = useState<GroupMode>("none");

  const visibleBuckets = useMemo(
    () =>
      ensureUpcomingQuarters([], new Date(), weeksAhead).filter(
        (b) => parseBucketId(b) !== null,
      ),
    [weeksAhead],
  );

  const rangeStart = useMemo(() => {
    const first = parseBucketId(visibleBuckets[0]);
    return first ? quarterRange(first).start : new Date();
  }, [visibleBuckets]);
  const rangeEnd = useMemo(() => {
    const last = parseBucketId(visibleBuckets[visibleBuckets.length - 1]);
    return last ? quarterRange(last).end : new Date();
  }, [visibleBuckets]);
  const totalMs = Math.max(1, rangeEnd.getTime() - rangeStart.getTime());

  const rows = useMemo(() => {
    const inRange = epics
      .filter((e) => {
        const span = getEpicQuarterSpan(e, visibleBuckets);
        return span.some((b) => visibleBuckets.includes(b));
      })
      .sort((a, b) => {
        const da = a.startDate ? new Date(a.startDate).getTime() : Infinity;
        const db = b.startDate ? new Date(b.startDate).getTime() : Infinity;
        if (da !== db) return da - db;
        return a.title.localeCompare(b.title);
      });

    if (groupBy === "none") {
      return [{ groupKey: "", epics: inRange }];
    }
    const map = new Map<string, TfsEpic[]>();
    for (const e of inRange) {
      const key =
        groupBy === "area"
          ? e.areaPath ?? t.epicsUnassigned
          : e.assignedTo ?? t.epicsUnassigned;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([groupKey, list]) => ({ groupKey, epics: list }));
  }, [epics, visibleBuckets, groupBy, t.epicsUnassigned]);

  const todayOffsetPct = useMemo(() => {
    const now = Date.now();
    if (now < rangeStart.getTime() || now > rangeEnd.getTime()) return null;
    return ((now - rangeStart.getTime()) / totalMs) * 100;
  }, [rangeStart, rangeEnd, totalMs]);

  const getBarGeometry = (epic: TfsEpic): { leftPct: number; widthPct: number; inferred: boolean } | null => {
    const hasStart = Boolean(epic.startDate);
    const hasEnd = Boolean(epic.targetDate);
    if (!hasStart && !hasEnd) return null;
    const startIso = epic.startDate ?? epic.targetDate!;
    const endIso = epic.targetDate ?? epic.startDate!;
    let start = new Date(startIso).getTime();
    let end = new Date(endIso).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return null;
    if (start > end) [start, end] = [end, start];
    const clampedStart = Math.max(start, rangeStart.getTime());
    const clampedEnd = Math.min(end, rangeEnd.getTime());
    if (clampedEnd < rangeStart.getTime() || clampedStart > rangeEnd.getTime()) return null;
    const leftPct = ((clampedStart - rangeStart.getTime()) / totalMs) * 100;
    const widthPct = Math.max(
      1.2,
      ((clampedEnd - clampedStart) / totalMs) * 100,
    );
    return { leftPct, widthPct, inferred: !hasStart || !hasEnd };
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t.epicsTimelineTodayLabel}</span>
          <span className="inline-block h-2 w-2 rounded-full bg-destructive" />
        </div>
        <div className="flex items-center gap-2">
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupMode)}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder={t.epicsTimelineGroupBy} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t.epicsGroupNone}</SelectItem>
              <SelectItem value="area">{t.epicsGroupArea}</SelectItem>
              <SelectItem value="assignee">{t.epicsGroupAssignee}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(weeksAhead)} onValueChange={(v) => setWeeksAhead(Number(v) as 3 | 5 | 7)}>
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
      </div>

      <div className="overflow-x-auto rounded-md border">
        <div className="min-w-[900px]">
          {/* Header row: quarter columns */}
          <div className="flex sticky top-0 z-10 bg-muted/40 border-b">
            <div className="w-[260px] shrink-0 px-3 py-2 text-xs font-semibold border-r">
              {t.epicsColTitle}
            </div>
            <div className="relative flex-1 flex">
              {visibleBuckets.map((b) => {
                const parsed = parseBucketId(b);
                if (!parsed) return null;
                return (
                  <div
                    key={b}
                    className="flex-1 px-2 py-2 text-xs font-semibold text-center border-r last:border-r-0"
                  >
                    {quarterLabel(parsed)}
                  </div>
                );
              })}
            </div>
          </div>

          {rows.map(({ groupKey, epics: groupEpics }) => (
            <div key={groupKey || "__nogroup"}>
              {groupBy !== "none" && (
                <div className="px-3 py-1.5 bg-muted/20 text-[11px] font-medium uppercase tracking-wide text-muted-foreground border-b">
                  {groupKey}
                  <span className="ml-2 text-muted-foreground/70 normal-case">
                    · {groupEpics.length}
                  </span>
                </div>
              )}
              {groupEpics.length === 0 ? (
                <div className="px-3 py-6 text-xs text-muted-foreground text-center">—</div>
              ) : (
                <TooltipProvider delayDuration={200}>
                  {groupEpics.map((epic) => {
                    const geom = getBarGeometry(epic);
                    return (
                      <div
                        key={epic.id}
                        className="flex items-stretch border-b last:border-b-0 hover:bg-muted/20"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenEpic(epic)}
                          className="w-[260px] shrink-0 px-3 py-2 text-left text-xs border-r hover:text-primary"
                          title={epic.title}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-muted-foreground">#{epic.id}</span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0">{epic.state}</Badge>
                          </div>
                          <div className="mt-0.5 truncate font-medium">{epic.title}</div>
                        </button>
                        <div className="relative flex-1 py-2 min-h-[42px]">
                          {/* Column dividers */}
                          <div className="absolute inset-0 flex pointer-events-none">
                            {visibleBuckets.map((b) => (
                              <div key={b} className="flex-1 border-r last:border-r-0" />
                            ))}
                          </div>
                          {todayOffsetPct !== null && (
                            <div
                              className="absolute top-0 bottom-0 w-px bg-destructive/70 pointer-events-none"
                              style={{ left: `${todayOffsetPct}%` }}
                            />
                          )}
                          {geom ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => onOpenEpic(epic)}
                                  className={cn(
                                    "absolute top-1/2 -translate-y-1/2 h-5 rounded-sm text-[10px] text-primary-foreground px-1.5 truncate text-left hover:ring-2 hover:ring-primary/40 transition-shadow",
                                    stateBarClass(epic.state),
                                    geom.inferred && "border border-dashed border-foreground/40",
                                  )}
                                  style={{
                                    left: `${geom.leftPct}%`,
                                    width: `${geom.widthPct}%`,
                                    minWidth: 24,
                                  }}
                                >
                                  <span className="text-primary-foreground/95">
                                    #{epic.id}
                                  </span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <div className="space-y-0.5 text-xs">
                                  <div className="font-medium">#{epic.id} · {epic.title}</div>
                                  <div className="text-muted-foreground">
                                    {epic.assignedTo ?? t.epicsUnassigned}
                                  </div>
                                  {epic.areaPath && (
                                    <div className="text-muted-foreground font-mono">{epic.areaPath}</div>
                                  )}
                                  <div className="font-mono">
                                    {formatDate(epic.startDate)} → {formatDate(epic.targetDate)}
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="absolute top-1/2 -translate-y-1/2 left-2 text-[10px] italic text-muted-foreground">
                              {t.epicsTimelineNoDatesHint}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </TooltipProvider>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
