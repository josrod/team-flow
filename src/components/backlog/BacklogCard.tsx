import { useState } from "react";
import { Bug, ChevronDown, ChevronRight, ExternalLink, ListChecks, Square } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLang } from "@/context/LanguageContext";
import type { BacklogCardItem, BoardColumn } from "@/lib/backlogBoard";

const columnAccent: Record<BoardColumn, string> = {
  open: "border-l-muted-foreground/40",
  refinement: "border-l-status-vacation",
  inProgress: "border-l-status-info",
  testing: "border-l-status-other-project",
  closed: "border-l-status-available",
};

interface BacklogCardProps {
  card: BacklogCardItem;
  /** Hide the assignee line when the card is already grouped under a person. */
  hideAssignee?: boolean;
}

export const BacklogCard = ({ card, hideAssignee = false }: BacklogCardProps) => {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const TypeIcon = card.isBug ? Bug : Square;
  const hasChildren = card.children.length > 0;

  return (
    <article
      className={cn(
        "rounded-lg border border-l-4 bg-card p-3 shadow-sm transition-colors hover:border-primary/40",
        columnAccent[card.column],
        card.waiting && "bg-status-vacation/5",
      )}
    >
      <header className="flex items-start gap-2">
        <TypeIcon
          className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", card.isBug ? "text-status-sick" : "text-status-info")}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug">
            <a
              href={card.htmlUrl || undefined}
              target="_blank"
              rel="noreferrer"
              title={t.backlogOpenInAdo}
              className="font-mono text-xs text-primary hover:underline"
            >
              {card.id}
            </a>{" "}
            <span className="font-medium">{card.title}</span>
          </p>
          {!hideAssignee && card.assignedTo && (
            <p className="mt-1 text-xs text-muted-foreground truncate">{card.assignedTo}</p>
          )}
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <dt>State</dt>
            <dd className="text-foreground">{card.state}</dd>
            {card.iterationPath && (
              <>
                <dt>Iteration</dt>
                <dd className="text-foreground truncate">{card.iterationPath.split("\\").slice(-1)[0]}</dd>
              </>
            )}
          </dl>
          {card.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {card.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className={cn(
                    "px-1.5 py-0 text-[10px] font-normal",
                    tag.toLowerCase() === "waiting" && "bg-status-vacation/15 text-status-vacation",
                  )}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          {hasChildren && (
            <>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-expanded={open}
              >
                {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <ListChecks className="h-3 w-3" />
                {card.childrenDone}/{card.children.length}
                <span className="sr-only">{t.backlogChildTasks}</span>
              </button>
              {open && (
                <ul className="mt-1 space-y-1 border-l border-border pl-2">
                  {card.children.map((child) => (
                    <li key={child.id} className="text-[11px] leading-snug">
                      <a
                        href={child.htmlUrl || undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-primary hover:underline"
                      >
                        {child.id}
                      </a>{" "}
                      <span
                        className={cn(
                          child.column === "closed" && "text-muted-foreground line-through",
                        )}
                      >
                        {child.title}
                      </span>
                      <span className="ml-1 text-muted-foreground">
                        · {child.state}
                        {child.assignedTo ? ` · ${child.assignedTo}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <a
          href={card.htmlUrl || undefined}
          target="_blank"
          rel="noreferrer"
          title={t.backlogOpenInAdo}
          className="text-muted-foreground hover:text-primary"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </header>
    </article>
  );
};
