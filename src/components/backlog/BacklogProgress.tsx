import { useLang } from "@/context/LanguageContext";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { completionPercent, type BacklogCardItem } from "@/lib/backlogBoard";

interface BacklogProgressProps {
  card: Pick<BacklogCardItem, "childrenDone" | "childrenTotal">;
  /** Compact variant used inside board cards. */
  compact?: boolean;
  className?: string;
}

/** Completion of a backlog item: closed child tasks over total child tasks. */
export const BacklogProgress = ({ card, compact = false, className }: BacklogProgressProps) => {
  const { t } = useLang();
  const percent = completionPercent(card);

  if (percent === null) {
    return (
      <span className={cn("text-[11px] text-muted-foreground", className)}>{t.backlogNoChildTasks}</span>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Progress value={percent} className={cn(compact ? "h-1.5 w-16" : "h-2 w-24")} />
      <span className="whitespace-nowrap text-[11px] text-muted-foreground">
        {percent}% · {card.childrenDone}/{card.childrenTotal}
      </span>
    </div>
  );
};
