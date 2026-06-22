import { cn } from "@/lib/utils";
import { PriorityLevel } from "@/lib/taskPriority";
import { ArrowDown, ArrowUp, Equal, Minus } from "lucide-react";

interface PriorityBadgeProps {
  level: PriorityLevel;
  className?: string;
}

const config: Record<
  PriorityLevel,
  { label: string; classes: string; Icon: typeof ArrowUp }
> = {
  high: {
    label: "Alta",
    classes: "bg-destructive/15 text-destructive border-destructive/30",
    Icon: ArrowUp,
  },
  medium: {
    label: "Media",
    classes: "bg-status-vacation/15 text-status-vacation border-status-vacation/30",
    Icon: Equal,
  },
  low: {
    label: "Baja",
    classes: "bg-status-info/15 text-status-info border-status-info/30",
    Icon: ArrowDown,
  },
  none: {
    label: "Sin prioridad",
    classes: "bg-muted text-muted-foreground border-border/60",
    Icon: Minus,
  },
};

export const PriorityBadge = ({ level, className }: PriorityBadgeProps) => {
  const { label, classes, Icon } = config[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        classes,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
};
