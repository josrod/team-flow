import { useMemo } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { previewImportJson, type ImportPreview } from "@/lib/validation";
import { useLang } from "@/context/LanguageContext";

interface ImportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  json: string | null;
  onConfirm: (json: string) => void;
}

export function ImportPreviewDialog({
  open,
  onOpenChange,
  json,
  onConfirm,
}: ImportPreviewDialogProps) {
  const { t } = useLang();

  const preview = useMemo<ImportPreview | null>(
    () => (json == null ? null : previewImportJson(json)),
    [json],
  );

  const totalRecords = preview?.ok
    ? Object.values(preview.counts).reduce((sum, n) => sum + n, 0)
    : 0;
  const canConfirm = preview?.ok === true && totalRecords > 0;

  const countLabels: Array<{ key: keyof typeof labels; count: number }> =
    preview?.ok
      ? [
          { key: "teams", count: preview.counts.teams },
          { key: "members", count: preview.counts.members },
          { key: "workTopics", count: preview.counts.workTopics },
          { key: "absences", count: preview.counts.absences },
          { key: "handovers", count: preview.counts.handovers },
        ]
      : [];

  const labels = {
    teams: t.importPreviewCountTeams,
    members: t.importPreviewCountMembers,
    workTopics: t.importPreviewCountTopics,
    absences: t.importPreviewCountAbsences,
    handovers: t.importPreviewCountHandovers,
  } as const;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {preview?.ok ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            )}
            {t.importPreviewTitle}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {preview?.ok
              ? totalRecords > 0
                ? t.importPreviewDescOk
                : t.importPreviewNoRecords
              : t.importPreviewDescError}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {preview?.ok && totalRecords > 0 && (
          <ul className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3 text-sm">
            {countLabels.map(({ key, count }) => (
              <li
                key={key}
                className="flex items-center justify-between rounded px-2 py-1"
              >
                <span className="text-muted-foreground">{labels[key]}</span>
                <span className="font-medium tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        )}

        {preview && !preview.ok && (
          <ScrollArea className="max-h-64 rounded-md border">
            <ul className="divide-y">
              {preview.issues.map((issue, idx) => (
                <li key={idx} className="px-3 py-2 text-sm">
                  <code className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                    {issue.path}
                  </code>
                  <span className="text-muted-foreground">{issue.message}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{t.importPreviewCancel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm}
            onClick={() => {
              if (canConfirm && json) onConfirm(json);
            }}
          >
            {t.importPreviewConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
