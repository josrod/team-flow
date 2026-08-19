import { Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLang } from "@/context/LanguageContext";
import { formatHours, formatIsoDay } from "@/lib/inventValues";
import type { TimeBooking } from "@/services/timeBookingService";

export interface DrilldownSelection {
  /** Chart dimension the user clicked. */
  dimension: "person" | "project" | "activity" | "week";
  /** Human readable value of the clicked slice. */
  label: string;
  bookings: TimeBooking[];
}

interface Props {
  selection: DrilldownSelection | null;
  onOpenChange: (open: boolean) => void;
  onApplyFilter: (selection: DrilldownSelection) => void;
}

export function TimeBookingDrilldownDialog({ selection, onOpenChange, onApplyFilter }: Props) {
  const { t } = useLang();

  const dimensionLabel: Record<DrilldownSelection["dimension"], string> = {
    person: t.timeBookingColPerson,
    project: t.timeBookingColProject,
    activity: t.timeBookingColActivity,
    week: t.timeBookingByWeek,
  };

  const totalHours = selection?.bookings.reduce((sum, b) => sum + b.duration, 0) ?? 0;

  return (
    <Dialog open={selection !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {selection ? `${dimensionLabel[selection.dimension]}: ${selection.label}` : ""}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t.timeBookingDrilldownSummary
              .replace("{n}", String(selection?.bookings.length ?? 0))
              .replace("{hours}", formatHours(totalHours))}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t.timeBookingColDate}</TableHead>
                <TableHead className="text-xs">{t.timeBookingColPerson}</TableHead>
                <TableHead className="text-xs">{t.timeBookingColProject}</TableHead>
                <TableHead className="text-xs">{t.timeBookingColTask}</TableHead>
                <TableHead className="text-xs">{t.timeBookingColActivity}</TableHead>
                <TableHead className="text-xs text-right">{t.timeBookingColHours}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(selection?.bookings ?? []).map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell className="text-xs whitespace-nowrap">{formatIsoDay(booking.workDate)}</TableCell>
                  <TableCell className="text-xs">{booking.person}</TableCell>
                  <TableCell className="text-xs font-mono">{booking.projectCode}</TableCell>
                  <TableCell className="text-xs max-w-[240px] truncate">{booking.taskName}</TableCell>
                  <TableCell className="text-xs">{booking.activityKind}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">
                    {formatHours(booking.duration)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t.close}
          </Button>
          <Button size="sm" onClick={() => selection && onApplyFilter(selection)}>
            <Filter className="h-4 w-4 mr-2" />
            {t.timeBookingApplyAsFilter}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
