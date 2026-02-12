import { useApp } from "@/context/AppContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { format, differenceInDays, eachDayOfInterval, startOfMonth, endOfMonth, isWithinInterval, parseISO, addMonths, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { AbsenceType } from "@/types";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function AbsencesPage() {
  const { members, absences, addAbsence } = useApp();
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

  // Timeline data
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

  // List data
  const upcomingAbsences = [...absences]
    .filter((a) => a.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ausencias</h1>
          <p className="text-muted-foreground">Gestión de vacaciones y bajas</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva ausencia</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar ausencia</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Persona</Label>
                <Select value={selMember} onValueChange={setSelMember}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={selType} onValueChange={(v) => setSelType(v as AbsenceType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacation">Vacaciones</SelectItem>
                    <SelectItem value="sick-leave">Baja</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Inicio</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left", !startDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "dd/MM/yyyy") : "Fecha"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={startDate} onSelect={setStartDate} className="pointer-events-auto" /></PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>Fin</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left", !endDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "dd/MM/yyyy") : "Fecha"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={endDate} onSelect={setEndDate} className="pointer-events-auto" /></PopoverContent>
                  </Popover>
                </div>
              </div>
              <Button onClick={handleAdd} className="w-full">Registrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="list">Lista</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <div className="flex items-center gap-2 mb-4">
            <Button variant="outline" size="icon" onClick={() => setViewMonth(subMonths(viewMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium min-w-[140px] text-center">
              {format(viewMonth, "MMMM yyyy", { locale: es })}
            </span>
            <Button variant="outline" size="icon" onClick={() => setViewMonth(addMonths(viewMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Header row */}
              <div className="flex border-b pb-1 mb-2">
                <div className="w-[140px] shrink-0 text-xs font-medium text-muted-foreground">Persona</div>
                <div className="flex-1 flex">
                  {daysInMonth.map((day) => (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "flex-1 text-center text-xs text-muted-foreground",
                        format(day, "yyyy-MM-dd") === today && "font-bold text-foreground"
                      )}
                    >
                      {format(day, "d")}
                    </div>
                  ))}
                </div>
              </div>

              {timelineMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Sin ausencias este mes</p>
              ) : (
                timelineMembers.map((member) => {
                  const memberAbsences = timelineAbsences.filter((a) => a.memberId === member.id);
                  return (
                    <div key={member.id} className="flex items-center py-1.5">
                      <div className="w-[140px] shrink-0 text-sm truncate">{member.name}</div>
                      <div className="flex-1 flex relative h-6">
                        {daysInMonth.map((day) => {
                          const dayStr = format(day, "yyyy-MM-dd");
                          const absence = memberAbsences.find((a) => a.startDate <= dayStr && a.endDate >= dayStr);
                          return (
                            <div
                              key={day.toISOString()}
                              className={cn(
                                "flex-1 mx-px rounded-sm",
                                absence?.type === "vacation" && "bg-yellow-400/60",
                                absence?.type === "sick-leave" && "bg-red-400/60",
                                !absence && "bg-muted/30"
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
          </div>
        </TabsContent>

        <TabsContent value="list">
          <div className="grid gap-3 sm:grid-cols-2">
            {upcomingAbsences.length === 0 ? (
              <p className="text-muted-foreground text-sm col-span-2">No hay ausencias registradas.</p>
            ) : (
              upcomingAbsences.map((a) => {
                const member = members.find((m) => m.id === a.memberId);
                const days = differenceInDays(parseISO(a.endDate), parseISO(a.startDate)) + 1;
                return (
                  <Card key={a.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{member?.name}</span>
                        <StatusBadge status={a.type} />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {format(parseISO(a.startDate), "dd MMM", { locale: es })} — {format(parseISO(a.endDate), "dd MMM", { locale: es })}
                        <span className="ml-2 text-xs">({days} días)</span>
                      </p>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
