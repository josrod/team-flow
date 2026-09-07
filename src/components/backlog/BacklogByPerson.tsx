import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/context/LanguageContext";
import { BacklogCard } from "@/components/backlog/BacklogCard";
import {
  BOARD_COLUMNS,
  UNASSIGNED_KEY,
  groupByPerson,
  type BacklogCardItem,
  type BoardColumn,
} from "@/lib/backlogBoard";

interface BacklogByPersonProps {
  cards: BacklogCardItem[];
}

export const BacklogByPerson = ({ cards }: BacklogByPersonProps) => {
  const { t } = useLang();
  const groups = groupByPerson(cards);

  const columnLabels: Record<BoardColumn, string> = {
    open: t.backlogColOpen,
    refinement: t.backlogColRefinement,
    inProgress: t.backlogColInProgress,
    testing: t.backlogColTesting,
    closed: t.backlogColClosed,
  };

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <Card key={group.person}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                {group.person === UNASSIGNED_KEY ? t.backlogUnassigned : group.person}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary" className="bg-status-info/15 text-status-info">
                  {t.backlogPbisInProgress}: {group.inProgress}
                </Badge>
                <Badge variant="secondary">
                  {t.backlogActiveTasks}: {group.activeChildren}
                </Badge>
                {group.waiting > 0 && (
                  <Badge variant="secondary" className="bg-status-vacation/15 text-status-vacation">
                    {t.backlogWaitingItems}: {group.waiting}
                  </Badge>
                )}
                {!group.hasActiveWork && (
                  <span className="text-muted-foreground">{t.backlogNoActiveWork}</span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {BOARD_COLUMNS.map((column) => {
              const columnCards = group.cards.filter((card) => card.column === column);
              if (columnCards.length === 0) return null;
              return (
                <section key={column} className="space-y-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {columnLabels[column]} · {columnCards.length}
                  </h4>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {columnCards.map((card) => (
                      <BacklogCard key={card.id} card={card} hideAssignee />
                    ))}
                  </div>
                </section>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
