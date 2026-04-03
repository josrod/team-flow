import { cn } from "@/lib/utils";
import { MemberStatus, WorkTopicStatus } from "@/types";

export const statusConfig: Record<MemberStatus, { label: string; className: string; dot: string }> = {
  available: { label: "Disponible", className: "bg-status-available/10 text-status-available border-status-available/30", dot: "bg-status-available" },
  vacation: { label: "Vacaciones", className: "bg-status-vacation/10 text-status-vacation border-status-vacation/30", dot: "bg-status-vacation" },
  "sick-leave": { label: "Baja", className: "bg-status-sick/10 text-status-sick border-status-sick/30", dot: "bg-status-sick" },
  "work-travel": { label: "Viaje de trabajo", className: "bg-status-work-travel/10 text-status-work-travel border-status-work-travel/30", dot: "bg-status-work-travel" },
  "other-project": { label: "Otro proyecto", className: "bg-status-other-project/10 text-status-other-project border-status-other-project/30", dot: "bg-status-other-project" },
  "parental-leave": { label: "Baja maternal/paternal", className: "bg-status-parental-leave/10 text-status-parental-leave border-status-parental-leave/30", dot: "bg-status-parental-leave" },
};

export const topicStatusConfig: Record<WorkTopicStatus, { label: string; className: string }> = {
  "in-progress": { label: "En progreso", className: "bg-status-info/10 text-status-info" },
  pending: { label: "Pendiente", className: "bg-status-vacation/10 text-status-vacation" },
  blocked: { label: "Bloqueado", className: "bg-status-sick/10 text-status-sick" },
  completed: { label: "Completado", className: "bg-status-available/10 text-status-available" },
};

export function StatusBadge({ status }: { status: MemberStatus }) {
  const cfg = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors", cfg.className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

export function TopicStatusBadge({ status }: { status: WorkTopicStatus }) {
  const cfg = topicStatusConfig[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", cfg.className)}>
      {cfg.label}
    </span>
  );
}
