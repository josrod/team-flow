import { cn } from "@/lib/utils";
import { MemberStatus, WorkTopicStatus } from "@/types";
import { useLang } from "@/context/LanguageContext";

export const statusStyles: Record<MemberStatus, { className: string; dot: string }> = {
  available: { className: "bg-status-available/10 text-status-available border-status-available/30", dot: "bg-status-available" },
  vacation: { className: "bg-status-vacation/10 text-status-vacation border-status-vacation/30", dot: "bg-status-vacation" },
  "sick-leave": { className: "bg-status-sick/10 text-status-sick border-status-sick/30", dot: "bg-status-sick" },
  "work-travel": { className: "bg-status-work-travel/10 text-status-work-travel border-status-work-travel/30", dot: "bg-status-work-travel" },
  "other-project": { className: "bg-status-other-project/10 text-status-other-project border-status-other-project/30", dot: "bg-status-other-project" },
  "parental-leave": { className: "bg-status-parental-leave/10 text-status-parental-leave border-status-parental-leave/30", dot: "bg-status-parental-leave" },
};

export const topicStatusStyles: Record<WorkTopicStatus, { className: string }> = {
  "in-progress": { className: "bg-status-info/10 text-status-info" },
  pending: { className: "bg-status-vacation/10 text-status-vacation" },
  blocked: { className: "bg-status-sick/10 text-status-sick" },
  completed: { className: "bg-status-available/10 text-status-available" },
};

export function StatusBadge({ status }: { status: MemberStatus }) {
  const { t } = useLang();
  const labels: Record<MemberStatus, string> = {
    available: t.statusAvailable,
    vacation: t.statusVacation,
    "sick-leave": t.statusSickLeave,
    "work-travel": t.statusWorkTravel,
    "other-project": t.statusOtherProject,
    "parental-leave": t.statusParentalLeave,
  };
  const cfg = statusStyles[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors", cfg.className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {labels[status]}
    </span>
  );
}

export function TopicStatusBadge({ status }: { status: WorkTopicStatus }) {
  const { t } = useLang();
  const labels: Record<WorkTopicStatus, string> = {
    "in-progress": t.topicInProgress,
    pending: t.topicPending,
    blocked: t.topicBlocked,
    completed: t.topicCompleted,
  };
  const cfg = topicStatusStyles[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", cfg.className)}>
      {labels[status]}
    </span>
  );
}
