import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLang } from "@/context/LanguageContext";
import type { BookingAbsenceOverlap } from "@/lib/bookingOverlaps";
import { formatHours, formatIsoDay } from "@/lib/inventValues";

interface Props {
  overlaps: BookingAbsenceOverlap[];
  limit?: number;
}

export function BookingOverlapAlerts({ overlaps, limit = 25 }: Props) {
  const { t } = useLang();
  if (overlaps.length === 0) return null;

  const absenceLabel: Record<string, string> = {
    vacation: t.vacation,
    "sick-leave": t.sickLeave,
    "work-travel": t.workTravel,
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {t.overlapTitle}
          <Badge variant="destructive" className="ml-1">
            {overlaps.length}
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs">{t.overlapDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">{t.overlapColPerson}</TableHead>
              <TableHead className="text-xs">{t.overlapColDate}</TableHead>
              <TableHead className="text-xs">{t.overlapColAbsence}</TableHead>
              <TableHead className="text-xs text-right">{t.overlapColHours}</TableHead>
              <TableHead className="text-xs">{t.overlapColProjects}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overlaps.slice(0, limit).map((overlap) => (
              <TableRow key={overlap.key}>
                <TableCell className="text-xs">{overlap.memberName}</TableCell>
                <TableCell className="text-xs">{formatIsoDay(overlap.date)}</TableCell>
                <TableCell className="text-xs">
                  {absenceLabel[overlap.absenceType] ?? overlap.absenceType}
                </TableCell>
                <TableCell className="text-xs text-right tabular-nums">
                  {formatHours(overlap.bookedHours)}
                </TableCell>
                <TableCell className="text-xs font-mono max-w-[220px] truncate">
                  {overlap.projects.join(", ") || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {overlaps.length > limit && (
          <p className="pt-2 text-xs text-muted-foreground">
            {t.overlapMore.replace("{n}", String(overlaps.length - limit))}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
