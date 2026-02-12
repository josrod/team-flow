import { useApp } from "@/context/AppContext";
import { useLang } from "@/context/LanguageContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { format, differenceInDays, eachDayOfInterval, startOfMonth, endOfMonth, parseISO, addMonths, subMonths } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { AbsenceType } from "@/types";
import { motion } from "framer-motion";

export default function AbsencesPage() {
  const { members, absences, addAbsence } = useApp();
  const { t, lang } = useLang();
  const dateLoc = lang === "es" ? es : enUS;

  const [addOpen, setAddOpen] = useState(false);
  const [selMember, setSelMember] = useState("");
  const [selType, setSelType] = useState<AbsenceType>("vacation");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [viewMonth, setViewMonth] = useState(new Date());

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

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const timelineAbsences = absences.filter((a) => {
    const s = parseISO(a.startDate);
    const e = parseISO(a.endDate);
    return s <= monthEnd && e >= monthStart;
  });

  const timelineMembers = [...new Set(timelineAbsences.map((a) => a.memberId))].map(
    (id) => members.find((m) => m.id === id)!
  ).filter(Boolean);

  const upcomingAbsences = [...absences]
    .filter((a) => a.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">{t.absences}</h1>
          <p className="text-muted-foreground mt-1">{t.absencesDesc}</p>
        </div>
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
                          <StatusBadge status={a.type} />
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
    </div>
  );
}
