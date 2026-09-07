import { Bug, ExternalLink, Square } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useLang } from "@/context/LanguageContext";
import { BacklogProgress } from "@/components/backlog/BacklogProgress";
import type { BacklogCardItem } from "@/lib/backlogBoard";

interface BacklogDetailDialogProps {
  card: BacklogCardItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const leaf = (path: string | undefined): string | undefined => path?.split("\\").slice(-1)[0];

export const BacklogDetailDialog = ({ card, open, onOpenChange }: BacklogDetailDialogProps) => {
  const { t } = useLang();
  if (!card) return null;
  const TypeIcon = card.isBug ? Bug : Square;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2 pr-6 text-left font-display text-base">
            <TypeIcon
              className={cn("mt-1 h-4 w-4 shrink-0", card.isBug ? "text-status-sick" : "text-status-info")}
              aria-hidden
            />
            <span>
              <span className="font-mono text-xs text-primary">{card.id}</span> {card.title}
            </span>
          </DialogTitle>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">{t.backlogDetailState}</dt>
          <dd>{card.state}</dd>
          <dt className="text-muted-foreground">{t.backlogFilterPerson}</dt>
          <dd>{card.assignedTo ?? t.backlogUnassigned}</dd>
          <dt className="text-muted-foreground">{t.backlogDetailIteration}</dt>
          <dd className="truncate">{leaf(card.iterationPath) ?? "—"}</dd>
          <dt className="text-muted-foreground">{t.backlogDetailArea}</dt>
          <dd className="truncate">{leaf(card.areaPath) ?? "—"}</dd>
          <dt className="text-muted-foreground">{t.backlogDetailProgress}</dt>
          <dd>
            <BacklogProgress card={card} />
          </dd>
        </dl>

        {card.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {card.tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className={cn(
                  "px-1.5 py-0 text-[11px] font-normal",
                  tag.toLowerCase() === "waiting" && "bg-status-vacation/15 text-status-vacation",
                )}
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t.backlogChildTasks}
          </h3>
          {card.children.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.backlogNoChildTasks}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {card.children.map((child) => (
                <li key={child.id} className="flex items-start gap-2 p-2 text-sm">
                  <a
                    href={child.htmlUrl || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {child.id}
                  </a>
                  <span
                    className={cn("min-w-0 flex-1", child.column === "closed" && "text-muted-foreground line-through")}
                  >
                    {child.title}
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {child.state} · {child.assignedTo ?? t.backlogUnassigned}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {card.htmlUrl && (
          <Button asChild variant="outline" size="sm" className="self-start">
            <a href={card.htmlUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              {t.backlogOpenInAdo}
            </a>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
};
