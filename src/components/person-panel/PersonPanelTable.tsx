import { Fragment, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, CircleDot, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useLang } from "@/context/LanguageContext";
import { BacklogTable } from "@/components/backlog/BacklogTable";
import { formatHours } from "@/lib/inventValues";
import type { BacklogCardItem } from "@/lib/backlogBoard";
import type { PersonPanelRow, PersonRisk } from "@/lib/personPanel";

interface PersonPanelTableProps {
  rows: PersonPanelRow[];
  teamNameById: Record<string, string>;
  onSelectCard: (card: BacklogCardItem) => void;
}

const riskStyles: Record<PersonRisk, string> = {
  high: "bg-status-sick/15 text-status-sick",
  medium: "bg-status-vacation/15 text-status-vacation",
  none: "bg-status-available/15 text-status-available",
};


/** One row per person: assigned TFS work, progress, hours, absence and blockers. */
export const PersonPanelTable = ({ rows, teamNameById, onSelectCard }: PersonPanelTableProps) => {
  const { t } = useLang();
  const [expanded, setExpanded] = useState<string | null>(null);

  const riskLabels: Record<PersonRisk, string> = {
    high: t.personPanelRiskHigh,
    medium: t.personPanelRiskMedium,
    none: t.personPanelRiskNone,
  };

  const RiskIcon = (risk: PersonRisk) =>
    risk === "high" ? AlertTriangle : risk === "medium" ? ShieldAlert : CircleDot;

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.personPanelNoData}</p>;
  }

  return (
    <div className="overflow-auto rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 bg-card">
          <TableRow>
            <TableHead className="w-[26%]">{t.personPanelPerson}</TableHead>
            <TableHead>{t.personPanelItems}</TableHead>
            <TableHead className="w-[18%]">{t.personPanelProgress}</TableHead>
            <TableHead>{t.personPanelHours}</TableHead>
            <TableHead>{t.personPanelAbsence}</TableHead>
            <TableHead>{t.personPanelBlockers}</TableHead>
            <TableHead>{t.personPanelClosed}</TableHead>
            <TableHead>{t.personPanelRisk}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isOpen = expanded === row.memberId;
            const Icon = RiskIcon(row.risk);
            return (
              <Fragment key={row.memberId}>
                <TableRow
                  className="cursor-pointer"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onClick={() => setExpanded(isOpen ? null : row.memberId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setExpanded(isOpen ? null : row.memberId);
                    }
                  }}
                >
                  <TableCell className="py-2">
                    <span className="flex items-center gap-2">
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{row.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {teamNameById[row.teamId] ?? "—"}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-sm">
                    {row.itemsActive}
                    {row.itemsInProgress > 0 && (
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        ({row.itemsInProgress} WIP)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-2">
                    {row.progressPercent === null ? (
                      <span className="text-[11px] text-muted-foreground">{t.personPanelNoItems}</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Progress value={row.progressPercent} className="h-1.5 w-16" />
                        <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                          {row.progressPercent}% · {row.childrenDone}/{row.childrenTotal}
                        </span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-sm">
                    {formatHours(row.hours)}
                    {row.hoursDelta !== 0 && (
                      <span
                        className={cn(
                          "ml-1 text-[11px]",
                          row.hoursDelta > 0 ? "text-status-available" : "text-status-sick",
                        )}
                      >
                        {row.hoursDelta > 0 ? "+" : ""}
                        {String(row.hoursDelta).replace(".", ",")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-sm">
                    {row.absenceDays > 0
                      ? t.personPanelAbsenceDays.replace("{days}", String(row.absenceDays))
                      : <span className="text-muted-foreground">{t.personPanelNoAbsence}</span>}
                  </TableCell>
                  <TableCell className="py-2 text-sm">
                    {row.blockers > 0 ? (
                      <Badge variant="secondary" className="bg-status-sick/15 text-status-sick">
                        {row.blockers}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-sm">{row.itemsClosedInWeek}</TableCell>
                  <TableCell className="py-2">
                    <Badge variant="secondary" className={cn("gap-1", riskStyles[row.risk])}>
                      <Icon className="h-3 w-3" aria-hidden />
                      {riskLabels[row.risk]}
                    </Badge>
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow>
                    <TableCell colSpan={8} className="bg-muted/30 p-3">
                      <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                        <span>
                          {t.personPanelReadyToClose.replace("{count}", String(row.readyToClose))}
                        </span>
                        <span>{t.personPanelWaiting.replace("{count}", String(row.waiting))}</span>
                        {row.absenceTypes.length > 0 && <span>{row.absenceTypes.join(", ")}</span>}
                      </div>
                      {row.cards.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t.personPanelNoItems}</p>
                      ) : (
                        <BacklogTable
                          cards={row.cards}
                          onSelect={onSelectCard}
                          maxHeightClass="max-h-[300px]"
                        />
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
