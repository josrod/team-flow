import { cn } from "@/lib/utils";
import { PriorityLevel } from "@/lib/taskPriority";
import { useLang } from "@/context/LanguageContext";
import { ArrowDown, ArrowUp, Equal, Minus } from "lucide-react";

interface PriorityBadgeProps {
  level: PriorityLevel;
  className?: string;
}

const styles: Record<
  PriorityLevel,
  { classes: string; Icon: typeof ArrowUp }
> = {
  high: {
    classes: "bg-destructive/15 text-destructive border-destructive/30",
    Icon: ArrowUp,
  },
  medium: {
    classes: "bg-status-vacation/15 text-status-vacation border-status-vacation/30",
    Icon: Equal,
  },
  low: {
    classes: "bg-status-info/15 text-status-info border-status-info/30",
    Icon: ArrowDown,
  },
  none: {
    classes: "bg-muted text-muted-foreground border-border/60",
    Icon: Minus,
  },
};

export const PriorityBadge = ({ level, className }: PriorityBadgeProps) => {
  const { t } = useLang();
  const { classes, Icon } = styles[level];
  const labelMap: Record<PriorityLevel, string> = {
    high: t.priorityHigh,
    medium: t.priorityMedium,
    low: t.priorityLow,
    none: t.priorityNone,
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        classes,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {labelMap[level]}
    </span>
  );
};
