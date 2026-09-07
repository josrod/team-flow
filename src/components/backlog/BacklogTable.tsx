import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Bug, Square } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useLang } from "@/context/LanguageContext";
import { BacklogProgress } from "@/components/backlog/BacklogProgress";
import { BOARD_COLUMNS, completionRatio, type BacklogCardItem, type BoardColumn } from "@/lib/backlogBoard";

type SortKey = "state" | "person" | "progress";
type SortDir = "asc" | "desc";

interface BacklogTableProps {
  cards: BacklogCardItem[];
  onSelect: (card: BacklogCardItem) => void;
  /** Rows shown before the table scrolls. */
  maxHeightClass?: string;
}

export const BacklogTable = ({ cards, onSelect, maxHeightClass = "max-h-[420px]" }: BacklogTableProps) => {
  const { t } = useLang();
  const [sortKey, setSortKey] = useState<SortKey>("state");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const columnLabels: Record<BoardColumn, string> = {
    open: t.backlogColOpen,
    refinement: t.backlogColRefinement,
    inProgress: t.backlogColInProgress,
    testing: t.backlogColTesting,
    closed: t.backlogColClosed,
  };

  const sorted = useMemo(() => {
    const factor = sortDir === "asc" ? 1 : -1;
    return [...cards].sort((a, b) => {
      if (sortKey === "state") {
        const diff = BOARD_COLUMNS.indexOf(a.column) - BOARD_COLUMNS.indexOf(b.column);
        return (diff !== 0 ? diff : a.id - b.id) * factor;
      }
      if (sortKey === "person") {
        const nameA = a.assignedTo?.trim() ?? "";
        const nameB = b.assignedTo?.trim() ?? "";
        if (!nameA && nameB) return 1;
        if (nameA && !nameB) return -1;
        return (nameA.localeCompare(nameB) || a.id - b.id) * factor;
      }
      const ratioA = completionRatio(a);
      const ratioB = completionRatio(b);
      if (ratioA === null && ratioB === null) return (a.id - b.id) * factor;
      if (ratioA === null) return 1;
      if (ratioB === null) return -1;
      return (ratioA - ratioB || a.id - b.id) * factor;
    });
  }, [cards, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  };

  const SortHeader = ({ label, sortBy }: { label: string; sortBy: SortKey }) => (
    <button
      type="button"
      onClick={() => toggleSort(sortBy)}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      {label}
      {sortKey === sortBy &&
        (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  );

  return (
    <div className={cn("overflow-auto rounded-lg border", maxHeightClass)}>
      <Table>
        <TableHeader className="sticky top-0 bg-card">
          <TableRow>
            <TableHead className="w-[45%]">{t.backlogTableItem}</TableHead>
            <TableHead>
              <SortHeader label={t.backlogTableState} sortBy="state" />
            </TableHead>
            <TableHead>
              <SortHeader label={t.backlogTableOwner} sortBy="person" />
            </TableHead>
            <TableHead>
              <SortHeader label={t.backlogTableProgress} sortBy="progress" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((card) => {
            const TypeIcon = card.isBug ? Bug : Square;
            return (
              <TableRow
                key={card.id}
                onClick={() => onSelect(card)}
                className="cursor-pointer"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(card);
                  }
                }}
              >
                <TableCell className="py-2">
                  <span className="flex items-start gap-2">
                    <TypeIcon
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        card.isBug ? "text-status-sick" : "text-status-info",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-muted-foreground">{card.id}</span>{" "}
                      <span className="text-sm">{card.title}</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell className="py-2 text-sm">{columnLabels[card.column]}</TableCell>
                <TableCell className="py-2 text-sm">
                  {card.assignedTo ?? (
                    <span className="text-muted-foreground">{t.backlogUnassigned}</span>
                  )}
                </TableCell>
                <TableCell className="py-2">
                  <BacklogProgress card={card} compact />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
