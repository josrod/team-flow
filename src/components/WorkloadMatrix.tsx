import { useState, useMemo, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TfsWorkItem } from "@/services/tfs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getTaskDueDate } from "@/services/workloadService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [selectedCell, setSelectedCell] = useState<{ memberId: string; weekStart: string; weekEnd: string } | null>(null);
  const [taskDueDates, setTaskDueDates] = useState<Record<string, string>>({});

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

  useEffect(() => {
    let isMounted = true;
    const fetchDueDates = async () => {
      const newDueDates: Record<string, string> = {};
      const tasksWithoutEffort = tasks.filter(t => !(t.remainingWork || t.effort || t.originalEstimate));
      
      const promises = tasksWithoutEffort.map(async (t) => {
        try {
          const dueDate = await getTaskDueDate(t.id);
          if (dueDate) {
            newDueDates[t.id] = dueDate;
          }
        } catch (e) {
          // ignore
        }
      });

      await Promise.all(promises);

      if (isMounted) {
        setTaskDueDates(prev => ({ ...prev, ...newDueDates }));
      }
    };

    if (tasks.length > 0) {
      fetchDueDates();
    }

    return () => { isMounted = false; };
  }, [tasks]);

  const getEffortForWeek = (memberId: string, weekStartIso: string, weekEndIso: string) => {
    const memberName = rodatMembers.find(m => m.id === memberId)?.name;
    const memberTasks = tasks.filter(t => 
      t.assignedTo === memberName && 
      !t.state.toLowerCase().includes("done") && 
      !t.state.toLowerCase().includes("closed") && 
      !t.state.toLowerCase().includes("removed")
    );
    
    let effortForWeek = 0;
    const weekTasks: TfsWorkItem[] = [];
    const weekIndex = weeks.findIndex(w => w.isoStart === weekStartIso);

    for (const t of memberTasks) {
      const explicitEffort = t.remainingWork || t.effort || t.originalEstimate || 0;
      
      if (explicitEffort > 0) {
        // Use effort field when available. Defaulting to first week for simplicity.
        if (weekIndex === 0) {
          effortForWeek += explicitEffort;
          weekTasks.push(t);
        }
      } else {
        // Fall back to the internal due-date API when effort isn't available
        const dueDate = taskDueDates[t.id];
        if (dueDate) {
          if (dueDate >= weekStartIso && dueDate <= weekEndIso) {
            effortForWeek += 8; // Fallback default effort
            weekTasks.push(t);
          }
        } else {
          // If no due date resolved yet, put it in the first week
          if (weekIndex === 0) {
            effortForWeek += 8; // Fallback default effort
            weekTasks.push(t);
          }
        }
      }
    }
    
    return { effort: effortForWeek, tasks: weekTasks };
  };

  const getCapacityForWeek = (memberId: string, weekStartIso: string, weekEndIso: string) => {
    const weeklyHours = 40;
    
    const memberAbsences = absences.filter(a => a.memberId === memberId && a.startDate <= weekEndIso && a.endDate >= weekStartIso);
    
    let absenceDays = 0;
    if (memberAbsences.length > 0) {
      for (let d = new Date(weekStartIso); d <= new Date(weekEndIso); d.setDate(d.getDate() + 1)) {
        const isoD = d.toISOString().split("T")[0];
        const dayOfWeek = d.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;
        
        const isAbsent = memberAbsences.some(a => a.startDate <= isoD && a.endDate >= isoD);
        if (isAbsent) absenceDays++;
      }
    }

    const maxCapacity = Math.max(0, weeklyHours - (absenceDays * 8));
    const baseCapacity = maxCapacity * 0.8; // 80% is the standard base productive capacity

    return { baseCapacity, maxCapacity };
  };

  const selectedCellData = selectedCell ? getEffortForWeek(selectedCell.memberId, selectedCell.weekStart, selectedCell.weekEnd) : null;

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
                  const { effort } = getEffortForWeek(member.id, w.isoStart, w.isoEnd);
                  const { baseCapacity, maxCapacity } = getCapacityForWeek(member.id, w.isoStart, w.isoEnd);
                  const pct = maxCapacity > 0 ? (effort / maxCapacity) * 100 : effort > 0 ? 100 : 0;
                  
                  let bgClass = "bg-green-500";
                  if (effort >= baseCapacity && effort <= maxCapacity) bgClass = "bg-yellow-500";
                  if (effort > maxCapacity) bgClass = "bg-red-500";
                  if (maxCapacity === 0) bgClass = "bg-gray-300";

                  return (
                    <TableCell 
                      key={w.isoStart} 
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setSelectedCell({ memberId: member.id, weekStart: w.isoStart, weekEnd: w.isoEnd })}
                    >
                      <div className="space-y-1.5 px-2">
                        <div className="flex justify-between text-[10px] text-muted-foreground font-medium leading-none">
                          <span className="text-foreground text-xs">{effort}h</span>
                          <span className="flex gap-1" title="Base / Max">
                            <span>B:{baseCapacity}h</span>
                            <span>M:{maxCapacity}h</span>
                          </span>
                        </div>
                        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                          <div 
                            className={`h-full transition-all ${bgClass}`} 
                            style={{ width: `${Math.min(pct, 100)}%` }} 
                          />
                          {maxCapacity > 0 && (
                            <div 
                              className="absolute top-0 bottom-0 w-0.5 bg-foreground/40 z-10" 
                              style={{ left: '80%' }}
                              title={`Base Capacity (${baseCapacity}h)`}
                            />
                          )}
                        </div>
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