import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TfsWorkItem } from "@/services/tfs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface WorkloadMatrixProps {
  tasks: TfsWorkItem[];
}

export function WorkloadMatrix({ tasks }: WorkloadMatrixProps) {
  const { members, absences } = useApp();
  const [selectedCell, setSelectedCell] = useState<{ memberId: string; weekStart: string } | null>(null);

  // Consider all members for the team workload
  const rodatMembers = members; 

  const weeks = useMemo(() => {
    const today = new Date();
    const day = today.getDay() || 7; 
    today.setDate(today.getDate() - day + 1);
    today.setHours(0, 0, 0, 0);

    const ws = [];
    for (let i = 0; i < 4; i++) {
      const wStart = new Date(today);
      wStart.setDate(today.getDate() + (i * 7));
      const wEnd = new Date(wStart);
      wEnd.setDate(wStart.getDate() + 6);
      ws.push({
        start: wStart,
        end: wEnd,
        label: `Semana ${wStart.getDate()}/${wStart.getMonth() + 1}`,
        isoStart: wStart.toISOString().split("T")[0],
        isoEnd: wEnd.toISOString().split("T")[0]
      });
    }
    return ws;
  }, []);

  const getEffortForWeek = (memberId: string, weekStartIso: string) => {
    const memberName = rodatMembers.find(m => m.id === memberId)?.name;
    const memberTasks = tasks.filter(t => 
      t.assignedTo === memberName && 
      !t.state.toLowerCase().includes("done") && 
      !t.state.toLowerCase().includes("closed") && 
      !t.state.toLowerCase().includes("removed")
    );
    
    const totalEffort = memberTasks.reduce((acc, t) => acc + (t.remainingWork || t.effort || t.originalEstimate || 0), 0);
    
    const weekIndex = weeks.findIndex(w => w.isoStart === weekStartIso);
    // Simplification: dump all currently open assigned effort into the first week.
    if (weekIndex === 0) return { effort: totalEffort, tasks: memberTasks };
    return { effort: 0, tasks: [] };
  };

  const getCapacityForWeek = (memberId: string, weekStartIso: string, weekEndIso: string) => {
    const baseCapacity = 40;
    
    const memberAbsences = absences.filter(a => a.memberId === memberId && a.startDate <= weekEndIso && a.endDate >= weekStartIso);
    
    if (memberAbsences.length === 0) return baseCapacity;

    let absenceDays = 0;
    for (let d = new Date(weekStartIso); d <= new Date(weekEndIso); d.setDate(d.getDate() + 1)) {
      const isoD = d.toISOString().split("T")[0];
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      
      const isAbsent = memberAbsences.some(a => a.startDate <= isoD && a.endDate >= isoD);
      if (isAbsent) absenceDays++;
    }

    return Math.max(0, baseCapacity - (absenceDays * 8));
  };

  const selectedCellData = selectedCell ? getEffortForWeek(selectedCell.memberId, selectedCell.weekStart) : null;

  return (
    <Card className="border-primary/20 shadow-sm mt-6">
      <CardHeader>
        <CardTitle className="text-xl font-display">Carga de Trabajo y Disponibilidad</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">Miembro</TableHead>
              {weeks.map(w => (
                <TableHead key={w.isoStart} className="text-center">{w.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rodatMembers.map(member => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary font-bold">{member.name.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate" title={member.name}>{member.name}</span>
                  </div>
                </TableCell>
                {weeks.map(w => {
                  const { effort } = getEffortForWeek(member.id, w.isoStart);
                  const capacity = getCapacityForWeek(member.id, w.isoStart, w.isoEnd);
                  const pct = capacity > 0 ? (effort / capacity) * 100 : effort > 0 ? 100 : 0;
                  
                  let bgClass = "bg-green-500";
                  if (pct >= 80 && pct <= 100) bgClass = "bg-yellow-500";
                  if (pct > 100) bgClass = "bg-red-500";
                  if (capacity === 0) bgClass = "bg-gray-300";

                  return (
                    <TableCell 
                      key={w.isoStart} 
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setSelectedCell({ memberId: member.id, weekStart: w.isoStart })}
                    >
                      <div className="space-y-1.5 px-2">
                        <div className="flex justify-between text-xs text-muted-foreground font-medium">
                          <span>{effort}h</span>
                          <span>{capacity}h cap.</span>
                        </div>
                        <Progress value={Math.min(pct, 100)} className="h-2.5" indicatorClassName={bgClass} />
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Dialog open={!!selectedCell} onOpenChange={(o) => !o && setSelectedCell(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Detalle de Tareas - {selectedCell && rodatMembers.find(m => m.id === selectedCell.memberId)?.name}
              </DialogTitle>
              <DialogDescription>
                {selectedCell && weeks.find(w => w.isoStart === selectedCell.weekStart)?.label}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[400px] mt-4 pr-4">
              {selectedCellData && selectedCellData.tasks.length > 0 ? (
                <div className="space-y-4">
                  {selectedCellData.tasks.map(t => (
                    <div key={t.id} className="p-4 rounded-lg border bg-card text-card-foreground shadow-sm">
                      <div className="flex flex-col gap-2">
                        <p className="font-medium">[{t.id}] {t.title}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{t.state}</Badge>
                          <Badge variant="outline">{t.workItemType}</Badge>
                          <span className="text-sm font-semibold ml-auto">
                            Esfuerzo: {t.remainingWork || t.effort || t.originalEstimate || 0}h
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">No hay tareas asignadas para esta semana.</p>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}