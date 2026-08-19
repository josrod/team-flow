import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Loader2, RefreshCw, Upload } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TimeBookingImportDialog } from "@/components/TimeBookingImportDialog";
import {
  TimeBookingDrilldownDialog,
  type DrilldownSelection,
} from "@/components/TimeBookingDrilldownDialog";
import { BookingOverlapAlerts } from "@/components/BookingOverlapAlerts";
import { ImportHistoryPanel } from "@/components/ImportHistoryPanel";

import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { findBookingAbsenceOverlaps } from "@/lib/bookingOverlaps";
import { formatHours, formatIsoDay } from "@/lib/inventValues";

import {
  fetchTimeBookings,
  filterTimeBookings,
  hoursByActivity,
  hoursByPerson,
  hoursByProject,
  hoursByWeek,
  isoWeekKey,
  isoWeekRange,
  summarizeTimeBookings,
  type TimeBooking,
  type TimeBookingFilters,
} from "@/services/timeBookingService";

const PAGE_SIZE = 50;

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const emptyFilters: TimeBookingFilters = {
  person: "",
  project: "",
  task: "",
  activityKind: "",
  deliveryNo: null,
  from: "",
  to: "",
};

export function TimeBookingPage() {
  const { t } = useLang();
  const { isAdmin } = useAuth();
  const { members, absences } = useApp();
  const [bookings, setBookings] = useState<TimeBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [drilldown, setDrilldown] = useState<DrilldownSelection | null>(null);
  const [filters, setFilters] = useState<TimeBookingFilters>(emptyFilters);
  const [visible, setVisible] = useState(PAGE_SIZE);


  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBookings(await fetchTimeBookings());
    } catch (error) {
      toast.error(t.timeBookingLoadError, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [t.timeBookingLoadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => filterTimeBookings(bookings, filters), [bookings, filters]);
  const totals = useMemo(() => summarizeTimeBookings(filtered), [filtered]);
  const byPerson = useMemo(() => hoursByPerson(filtered).slice(0, 12), [filtered]);
  const byProject = useMemo(() => hoursByProject(filtered).slice(0, 8), [filtered]);
  const byActivity = useMemo(() => hoursByActivity(filtered).slice(0, 6), [filtered]);
  const byWeek = useMemo(() => hoursByWeek(filtered), [filtered]);
  const overlaps = useMemo(
    () => findBookingAbsenceOverlaps(absences, filtered, members),
    [absences, filtered, members]
  );


  const updateFilter = (key: keyof TimeBookingFilters, value: string) => {
    setVisible(PAGE_SIZE);
    setFilters((prev) => ({
      ...prev,
      [key]: key === "deliveryNo" ? (value ? Number(value) : null) : value,
    }));
  };

  /** Recharts click payloads are loosely typed; read the grouped label defensively. */
  const labelOf = (entry: unknown): string => {
    const candidate = entry as { label?: string; payload?: { label?: string } } | null;
    return candidate?.label ?? candidate?.payload?.label ?? "";
  };

  const matchesDimension = (
    booking: TimeBooking,
    dimension: DrilldownSelection["dimension"],
    label: string
  ): boolean => {
    const value = label.toLowerCase();
    if (dimension === "person") return booking.person.toLowerCase() === value;
    if (dimension === "project") return booking.projectCode.toLowerCase() === value;
    if (dimension === "activity") return (booking.activityKind || "—").toLowerCase() === value;
    return booking.workDate ? isoWeekKey(booking.workDate) === label : false;
  };

  const openDrilldown = (dimension: DrilldownSelection["dimension"], label: string) => {
    if (!label) return;
    setDrilldown({
      dimension,
      label,
      bookings: filtered.filter((b) => matchesDimension(b, dimension, label)),
    });
  };

  const applyDrilldownFilter = (selection: DrilldownSelection) => {
    setVisible(PAGE_SIZE);
    setFilters((prev) => {
      if (selection.dimension === "week") {
        const { from, to } = isoWeekRange(selection.label);
        return { ...prev, from, to };
      }
      if (selection.dimension === "person") return { ...prev, person: selection.label };
      if (selection.dimension === "project") return { ...prev, project: selection.label };
      return { ...prev, activityKind: selection.label };
    });
    setDrilldown(null);
    toast.success(t.timeBookingFilterApplied);
  };


  const kpis = [
    { label: t.timeBookingHours, value: formatHours(totals.hours) },
    { label: t.timeBookingBookings, value: String(totals.bookings) },
    { label: t.timeBookingPersons, value: String(totals.persons) },
    { label: t.timeBookingProjects, value: String(totals.projects) },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            {t.timeBookingTitle}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t.timeBookingDescription}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              {t.timeBookingImport}
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wide">{kpi.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-display font-semibold tabular-nums">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <BookingOverlapAlerts overlaps={overlaps} />


      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">{t.timeBookingFilterPerson}</Label>
            <Input value={filters.person ?? ""} onChange={(e) => updateFilter("person", e.target.value)} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.timeBookingFilterProject}</Label>
            <Input value={filters.project ?? ""} onChange={(e) => updateFilter("project", e.target.value)} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.timeBookingFilterTask}</Label>
            <Input value={filters.task ?? ""} onChange={(e) => updateFilter("task", e.target.value)} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.timeBookingFilterActivity}</Label>
            <Input value={filters.activityKind ?? ""} onChange={(e) => updateFilter("activityKind", e.target.value)} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.timeBookingFilterDelivery}</Label>
            <Input
              type="number"
              value={filters.deliveryNo ?? ""}
              onChange={(e) => updateFilter("deliveryNo", e.target.value)}
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.timeBookingFilterFrom}</Label>
            <Input type="date" value={filters.from ?? ""} onChange={(e) => updateFilter("from", e.target.value)} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.timeBookingFilterTo}</Label>
            <Input type="date" value={filters.to ?? ""} onChange={(e) => updateFilter("to", e.target.value)} className="h-8" />
          </div>
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={() => setFilters(emptyFilters)}>
              {t.timeBookingClearFilters}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t.timeBookingByPerson}</CardTitle>
            <CardDescription className="text-xs">{t.timeBookingChartHint}</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byPerson} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }} />
                <ChartTooltip formatter={(value: number) => formatHours(value)} />
                <Bar
                  dataKey="hours"
                  fill="hsl(var(--chart-1))"
                  radius={[0, 4, 4, 0]}
                  className="cursor-pointer"
                  onClick={(entry: unknown) => openDrilldown("person", labelOf(entry))}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t.timeBookingByProject}</CardTitle>
            <CardDescription className="text-xs">{t.timeBookingChartHint}</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byProject} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-15} height={50} textAnchor="end" />
                <YAxis tick={{ fontSize: 11 }} />
                <ChartTooltip formatter={(value: number) => formatHours(value)} />
                <Bar
                  dataKey="hours"
                  fill="hsl(var(--chart-2))"
                  radius={[4, 4, 0, 0]}
                  className="cursor-pointer"
                  onClick={(entry: unknown) => openDrilldown("project", labelOf(entry))}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t.timeBookingByActivity}</CardTitle>
            <CardDescription className="text-xs">{t.timeBookingChartHint}</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byActivity}
                  dataKey="hours"
                  nameKey="label"
                  innerRadius={45}
                  outerRadius={80}
                  className="cursor-pointer"
                  onClick={(entry: unknown) => openDrilldown("activity", labelOf(entry))}
                >
                  {byActivity.map((entry, index) => (
                    <Cell key={entry.key} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ChartTooltip formatter={(value: number) => formatHours(value)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t.timeBookingByWeek}</CardTitle>
            <CardDescription className="text-xs">{t.timeBookingChartHint}</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={byWeek}
                margin={{ left: 8, right: 16 }}
                className="cursor-pointer"
                onClick={(state: unknown) => {
                  const label = (state as { activeLabel?: string } | null)?.activeLabel;
                  if (label) openDrilldown("week", label);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ChartTooltip formatter={(value: number) => formatHours(value)} />
                <Line
                  type="monotone"
                  dataKey="hours"
                  stroke="hsl(var(--chart-3))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <TimeBookingDrilldownDialog
        selection={drilldown}
        onOpenChange={(open) => !open && setDrilldown(null)}
        onApplyFilter={applyDrilldownFilter}
      />


      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm">
            {t.timeBookingRowsShown
              .replace("{shown}", String(Math.min(visible, filtered.length)))
              .replace("{total}", String(filtered.length))}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t.timeBookingEmpty}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t.timeBookingNoResults}</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{t.timeBookingColDate}</TableHead>
                    <TableHead className="text-xs">{t.timeBookingColPerson}</TableHead>
                    <TableHead className="text-xs">{t.timeBookingColProject}</TableHead>
                    <TableHead className="text-xs">{t.timeBookingColTask}</TableHead>
                    <TableHead className="text-xs">{t.timeBookingColActivity}</TableHead>
                    <TableHead className="text-xs">{t.timeBookingColDelivery}</TableHead>
                    <TableHead className="text-xs text-right">{t.timeBookingColHours}</TableHead>
                    <TableHead className="text-xs">{t.timeBookingColRemarks}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, visible).map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell className="text-xs">{formatIsoDay(booking.workDate)}</TableCell>
                      <TableCell className="text-xs">{booking.person}</TableCell>
                      <TableCell className="text-xs font-mono">{booking.projectCode}</TableCell>
                      <TableCell className="text-xs max-w-[240px] truncate">{booking.taskName}</TableCell>
                      <TableCell className="text-xs">{booking.activityKind}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {booking.deliveryNo ?? "—"}
                        {booking.deliveryPosition ? `/${booking.deliveryPosition}` : ""}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{formatHours(booking.duration)}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate text-muted-foreground">
                        {booking.remarks ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {visible < filtered.length && (
                <div className="pt-3 text-center">
                  <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                    {t.timeBookingLoadMore}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {isAdmin && <ImportHistoryPanel refreshKey={historyKey} />}

      <TimeBookingImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => {
          void load();
          setHistoryKey((k) => k + 1);
        }}
      />

    </div>
  );
}
