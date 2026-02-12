import { cn } from "@/lib/utils";
import { MemberStatus, WorkTopicStatus } from "@/types";

export const statusConfig: Record<MemberStatus, { label: string; className: string }> = {
  available: { label: "Disponible", className: "bg-green-500/15 text-green-700 border-green-300" },
  vacation: { label: "Vacaciones", className: "bg-yellow-500/15 text-yellow-700 border-yellow-300" },
  "sick-leave": { label: "Baja", className: "bg-red-500/15 text-red-700 border-red-300" },
};

export const topicStatusConfig: Record<WorkTopicStatus, { label: string; className: string }> = {
  "in-progress": { label: "En progreso", className: "bg-blue-500/15 text-blue-700" },
  pending: { label: "Pendiente", className: "bg-yellow-500/15 text-yellow-700" },
  blocked: { label: "Bloqueado", className: "bg-red-500/15 text-red-700" },
  completed: { label: "Completado", className: "bg-green-500/15 text-green-700" },
};

export function StatusBadge({ status }: { status: MemberStatus }) {
  const cfg = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", cfg.className)}>
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
