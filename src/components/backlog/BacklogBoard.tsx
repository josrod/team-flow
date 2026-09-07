import { useLang } from "@/context/LanguageContext";
import { BacklogCard } from "@/components/backlog/BacklogCard";
import { BOARD_COLUMNS, groupIntoBoard, type BacklogCardItem, type BoardColumn, type Swimlane } from "@/lib/backlogBoard";

interface BacklogBoardProps {
  cards: BacklogCardItem[];
}

export const BacklogBoard = ({ cards }: BacklogBoardProps) => {
  const { t } = useLang();
  const grid = groupIntoBoard(cards);

  const columnLabels: Record<BoardColumn, string> = {
    open: t.backlogColOpen,
    refinement: t.backlogColRefinement,
    inProgress: t.backlogColInProgress,
    testing: t.backlogColTesting,
    closed: t.backlogColClosed,
  };
  const laneLabels: Record<Swimlane, string> = {
    unplanned: t.backlogLaneUnplanned,
    normal: t.backlogLaneNormal,
  };
  const lanes: Swimlane[] = ["unplanned", "normal"];

  return (
    <div className="overflow-x-auto pb-2">
      <div className="min-w-[1100px] space-y-6">
        <div className="grid grid-cols-5 gap-3">
          {BOARD_COLUMNS.map((column) => (
            <div
              key={column}
              className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
            >
              <span className="text-xs font-display font-semibold uppercase tracking-wide">
                {columnLabels[column]}
              </span>
              <span className="text-xs text-muted-foreground">
                {cards.filter((card) => card.column === column).length}
              </span>
            </div>
          ))}
        </div>

        {lanes.map((lane) => {
          const laneCards = BOARD_COLUMNS.flatMap((column) => grid[lane][column]);
          if (laneCards.length === 0) return null;
          return (
            <section key={lane} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {laneLabels[lane]} · {laneCards.length}
              </h3>
              <div className="grid grid-cols-5 gap-3">
                {BOARD_COLUMNS.map((column) => (
                  <div key={column} className="space-y-2 rounded-lg bg-muted/20 p-2">
                    {grid[lane][column].length === 0 ? (
                      <p className="py-4 text-center text-[11px] text-muted-foreground/70">
                        {t.backlogColumnEmpty}
                      </p>
                    ) : (
                      grid[lane][column].map((card) => <BacklogCard key={card.id} card={card} />)
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
