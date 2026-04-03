import { useApp } from "@/context/AppContext";
import { useLang } from "@/context/LanguageContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, ChevronLeft, ChevronRight, Download, Upload, Palmtree, Pencil, Stethoscope, Trash2, Plane, FolderKanban, Baby } from "lucide-react";
import { AbsenceImportDialog } from "@/components/AbsenceImportDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { format, differenceInDays, eachDayOfInterval, startOfMonth, endOfMonth, parseISO, addMonths, subMonths } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { AbsenceType, Absence } from "@/types";
import { motion } from "framer-motion";

export default function AbsencesPage() {
  const { teams, members, absences, addAbsence, updateAbsence, deleteAbsence } = useApp();
  const { t, lang } = useLang();
  const dateLoc = lang === "es" ? es : enUS;

  const [addOpen, setAddOpen] = useState(false);
  const [selMember, setSelMember] = useState("");
  const [selType, setSelType] = useState<AbsenceType>("vacation");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [viewMonth, setViewMonth] = useState(new Date());
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [editOpen, setEditOpen] = useState(false);
  const [editingAbsence, setEditingAbsence] = useState<Absence | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const filteredMemberIds = useMemo(() => {
    if (selectedTeam === "all") return members.map((m) => m.id);
    return members.filter((m) => m.teamId === selectedTeam).map((m) => m.id);
  }, [members, selectedTeam]);

  const filteredAbsences = useMemo(
    () => absences.filter((a) => filteredMemberIds.includes(a.memberId)),
    [absences, filteredMemberIds]
  );

  const summary = useMemo(() => {
    const counts: Record<AbsenceType, number> = { vacation: 0, "sick-leave": 0, "work-travel": 0, "other-project": 0, "parental-leave": 0 };
    for (const a of filteredAbsences) {
      const days = differenceInDays(parseISO(a.endDate), parseISO(a.startDate)) + 1;
      counts[a.type] += days;
    }
    const totalDays = Object.values(counts).reduce((s, v) => s + v, 0);
    return { ...counts, totalDays };
  }, [filteredAbsences]);

  const absenceTypeLabel = (type: AbsenceType): string => {
    const map: Record<AbsenceType, string> = {
      vacation: t.vacation,
      "sick-leave": t.sickLeave,
      "work-travel": t.workTravel,
      "other-project": t.otherProject,
      "parental-leave": t.parentalLeave,
    };
    return map[type];
  };

  const today = new Date().toISOString().split("T")[0];

  const handleAdd = () => {
    if (!selMember || !startDate || !endDate) return;
    addAbsence({
      memberId: selMember,
      type: selType,
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: format(endDate, "yyyy-MM-dd"),
    });
    setAddOpen(false);
    setSelMember("");
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const openEdit = (a: Absence) => {
    setEditingAbsence(a);
    setSelMember(a.memberId);
    setSelType(a.type);
    setStartDate(parseISO(a.startDate));
    setEndDate(parseISO(a.endDate));
    setEditOpen(true);
  };

  const handleEdit = () => {
    if (!editingAbsence || !startDate || !endDate) return;
    updateAbsence({
      ...editingAbsence,
      type: selType,
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: format(endDate, "yyyy-MM-dd"),
    });
    setEditOpen(false);
    setEditingAbsence(null);
    setSelMember("");
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const timelineAbsences = filteredAbsences.filter((a) => {
    const s = parseISO(a.startDate);
    const e = parseISO(a.endDate);
    return s <= monthEnd && e >= monthStart;
  });

  const timelineMembers = [...new Set(timelineAbsences.map((a) => a.memberId))].map(
    (id) => members.find((m) => m.id === id)!
  ).filter(Boolean);

  const upcomingAbsences = [...filteredAbsences]
    .filter((a) => a.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const handleExportCsv = () => {
    const header = `${t.person},${t.team},${t.type},${t.start},${t.end},${t.days}`;
    const rows = filteredAbsences.map((a) => {
      const member = members.find((m) => m.id === a.memberId);
      const team = teams.find((tm) => tm.id === member?.teamId);
      const days = differenceInDays(parseISO(a.endDate), parseISO(a.startDate)) + 1;
      const typeLabel = absenceTypeLabel(a.type);
      return `${member?.name},${team?.name ?? ""},${typeLabel},${a.startDate},${a.endDate},${days}`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `absences_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight">{t.absences}</h1>
          <p className="text-muted-foreground mt-1">{t.absencesDesc}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedTeam} onValueChange={setSelectedTeam}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.allTeams}</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="rounded-xl" onClick={handleExportCsv}>
            <Download className="h-4 w-4 mr-1" /> {t.exportCsv}
          </Button>
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> {t.importAbsences}
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-xl shadow-sm"><Plus className="h-4 w-4 mr-1" /> {t.newAbsence}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">{t.registerAbsence}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>{t.person}</Label>
                  <Select value={selMember} onValueChange={setSelMember}>
                    <SelectTrigger><SelectValue placeholder={t.select} /></SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t.type}</Label>
                  <Select value={selType} onValueChange={(v) => setSelType(v as AbsenceType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vacation">{t.vacation}</SelectItem>
                      <SelectItem value="sick-leave">{t.sickLeave}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t.start}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left", !startDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? format(startDate, "dd/MM/yyyy") : t.date}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={startDate} onSelect={setStartDate} className="pointer-events-auto" /></PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label>{t.end}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left", !endDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate ? format(endDate, "dd/MM/yyyy") : t.date}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={endDate} onSelect={setEndDate} className="pointer-events-auto" /></PopoverContent>
                    </Popover>
                  </div>
                </div>
                <Button onClick={handleAdd} className="w-full">{t.register}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 max-w-[100vw]">
        <Card className="min-w-0 flex-1 basis-[calc(50%-6px)] sm:basis-0">
          <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <div className="rounded-lg bg-status-vacation/10 p-2">
              <Palmtree className="h-4 w-4 sm:h-5 sm:w-5 text-status-vacation" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold">{summary.vacationDays}</p>
              <p className="text-xs text-muted-foreground">{t.vacation}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0 flex-1 basis-[calc(50%-6px)] sm:basis-0">
          <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <div className="rounded-lg bg-status-sick/10 p-2">
              <Stethoscope className="h-4 w-4 sm:h-5 sm:w-5 text-status-sick" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold">{summary.sickDays}</p>
              <p className="text-xs text-muted-foreground">{t.sickLeave}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0 flex-1 basis-full sm:basis-0">
          <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold">{summary.totalDays}</p>
              <p className="text-xs text-muted-foreground">{t.totalDays}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) { setEditingAbsence(null); setSelMember(""); setStartDate(undefined); setEndDate(undefined); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">{t.editAbsence}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t.person}</Label>
              <div className="mt-1 rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
                {members.find((m) => m.id === editingAbsence?.memberId)?.name}
              </div>
            </div>
            <div>
              <Label>{t.type}</Label>
              <Select value={selType} onValueChange={(v) => setSelType(v as AbsenceType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacation">{t.vacation}</SelectItem>
                  <SelectItem value="sick-leave">{t.sickLeave}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t.start}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left", !startDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "dd/MM/yyyy") : t.date}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={startDate} onSelect={setStartDate} className="pointer-events-auto" /></PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>{t.end}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left", !endDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "dd/MM/yyyy") : t.date}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={endDate} onSelect={setEndDate} className="pointer-events-auto" /></PopoverContent>
                </Popover>
              </div>
            </div>
            <Button onClick={handleEdit} className="w-full">{t.updateAbsence}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="timeline">
        <TabsList className="bg-card shadow-sm">
          <TabsTrigger value="timeline">{t.timeline}</TabsTrigger>
          <TabsTrigger value="list">{t.list}</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <div className="flex items-center gap-2 mb-4">
            <Button variant="outline" size="icon" className="rounded-lg" onClick={() => setViewMonth(subMonths(viewMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-display font-medium min-w-[160px] text-center capitalize">
              {format(viewMonth, "MMMM yyyy", { locale: dateLoc })}
            </span>
            <Button variant="outline" size="icon" className="rounded-lg" onClick={() => setViewMonth(addMonths(viewMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Card className="overflow-hidden">
            <CardContent className="p-4 overflow-x-auto">
              <div className="min-w-[800px]">
                <div className="flex border-b pb-2 mb-2">
                  <div className="w-[140px] shrink-0 text-xs font-semibold text-muted-foreground">{t.person}</div>
                  <div className="flex-1 flex">
                    {daysInMonth.map((day) => (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          "flex-1 text-center text-xs text-muted-foreground",
                          format(day, "yyyy-MM-dd") === today && "font-bold text-primary"
                        )}
                      >
                        {format(day, "d")}
                      </div>
                    ))}
                  </div>
                </div>

                {timelineMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">{t.noAbsencesMonth}</p>
                ) : (
                  timelineMembers.map((member) => {
                    const memberAbsences = timelineAbsences.filter((a) => a.memberId === member.id);
                    return (
                      <div key={member.id} className="flex items-center py-2 hover:bg-accent/30 rounded transition-colors">
                        <div className="w-[140px] shrink-0 text-sm font-medium truncate">{member.name}</div>
                        <div className="flex-1 flex relative h-7">
                          {daysInMonth.map((day) => {
                            const dayStr = format(day, "yyyy-MM-dd");
                            const absence = memberAbsences.find((a) => a.startDate <= dayStr && a.endDate >= dayStr);
                            return (
                              <div
                                key={day.toISOString()}
                                className={cn(
                                  "flex-1 mx-px rounded-sm transition-colors",
                                  absence?.type === "vacation" && "bg-status-vacation/40",
                                  absence?.type === "sick-leave" && "bg-status-sick/40",
                                  !absence && "bg-muted/20"
                                )}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="list">
          <motion.div
            className="grid gap-3 sm:grid-cols-2"
            initial="hidden"
            animate="show"
            variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }}
          >
            {upcomingAbsences.length === 0 ? (
              <p className="text-muted-foreground text-sm col-span-2">{t.noAbsences}</p>
            ) : (
              upcomingAbsences.map((a) => {
                const member = members.find((m) => m.id === a.memberId);
                const days = differenceInDays(parseISO(a.endDate), parseISO(a.startDate)) + 1;
                return (
                  <motion.div key={a.id} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
                    <Card className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{member?.name}</span>
                          <div className="flex items-center gap-0.5">
                            <StatusBadge status={a.type} />
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => openEdit(a)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t.deleteAbsenceTitle}</AlertDialogTitle>
                                  <AlertDialogDescription>{t.deleteAbsenceDesc}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteAbsence(a.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    {t.confirmDelete}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {format(parseISO(a.startDate), "dd MMM", { locale: dateLoc })} — {format(parseISO(a.endDate), "dd MMM", { locale: dateLoc })}
                          <span className="ml-2 text-xs font-medium">({days} {t.days})</span>
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })
            )}
          </motion.div>
        </TabsContent>
      </Tabs>
      <AbsenceImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
