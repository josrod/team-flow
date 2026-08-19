import { useMemo, useState } from "react";
import { ClipboardCopy, Hourglass, Loader2, RefreshCw, Link2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { useLang } from "@/context/LanguageContext";
import { useWaitingBoard } from "@/hooks/use-waiting-board";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildDigestSummary,
  buildWeeklyDigestText,
  STALE_WAITING_DAYS,
} from "@/lib/waitingAlerts";
import { NO_THEME_KEY, UNASSIGNED_KEY } from "@/lib/waitingGroups";

const THRESHOLD_STORAGE_KEY = "rosen.digest.staleDays.v1";

const readStoredThreshold = (): number => {
  try {
    const raw = window.localStorage.getItem(THRESHOLD_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 90) return parsed;
  } catch {
    // Ignore unavailable storage and fall back to the default threshold.
  }
  return STALE_WAITING_DAYS;
};

const formatDate = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};

/**
 * Weekly status digest: proactive view of blocked dependencies that have not
 * moved, plus a copyable Markdown summary to paste into chat.
 */
export const DigestPage = () => {
  const { t } = useLang();
  const { items, baseUrl, loading, error, reload } = useWaitingBoard();
  const [thresholdDays, setThresholdDays] = useState<number>(readStoredThreshold);
  const generatedAt = useMemo(() => new Date(), [items, thresholdDays]);

  const summary = useMemo(
    () => buildDigestSummary(items, thresholdDays, generatedAt),
    [items, thresholdDays, generatedAt],
  );

  const digestText = useMemo(
    () =>
      buildWeeklyDigestText(summary, {
        generatedAt,
        thresholdDays,
        workItemUrl: baseUrl ? (id: string) => `${baseUrl}/_workitems/edit/${id}` : undefined,
      }),
    [summary, generatedAt, thresholdDays, baseUrl],
  );

  const updateThreshold = (value: number) => {
    const clamped = Math.min(90, Math.max(1, value));
    setThresholdDays(clamped);
    try {
      window.localStorage.setItem(THRESHOLD_STORAGE_KEY, String(clamped));
    } catch {
      // Persisting the preference is best-effort only.
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(digestText);
      toast.success(t.digestCopied);
    } catch {
      toast.error(t.digestCopyError);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <Hourglass className="h-5 w-5 text-status-vacation" />
            {t.digestTitle}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{t.digestDescription}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t.digestGenerated.replace("{date}", formatDate(generatedAt))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reload({ forceRefresh: true })}
            disabled={loading}
            className="gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t.bugsRefresh}
          </Button>
          <Button size="sm" onClick={() => void handleCopy()} className="gap-2">
            <ClipboardCopy className="h-4 w-4" />
            {t.digestCopy}
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t.waitingItemsTotal}</CardDescription>
            <CardTitle className="text-2xl">{summary.totalWaiting}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t.waitingDevelopersAffected}</CardDescription>
            <CardTitle className="text-2xl">{summary.developersAffected}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t.waitingThemesAffected}</CardDescription>
            <CardTitle className="text-2xl">{summary.themesAffected}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={summary.staleCount > 0 ? "border-destructive/40" : undefined}>
          <CardHeader className="pb-2">
            <CardDescription>{t.digestStaleCount}</CardDescription>
            <CardTitle className="text-2xl">{summary.staleCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="digest-threshold" className="text-xs">
            {t.digestThresholdLabel}
          </Label>
          <Input
            id="digest-threshold"
            type="number"
            min={1}
            max={90}
            value={thresholdDays}
            onChange={(e) => updateThreshold(Number.parseInt(e.target.value, 10) || STALE_WAITING_DAYS)}
            className="w-28"
          />
        </div>
        <p className="text-xs text-muted-foreground pb-2">
          {t.digestThresholdHint.replace("{n}", String(thresholdDays))}
        </p>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {t.digestStaleTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {summary.stale.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.digestEmpty}</p>
          ) : (
            <ul className="space-y-1.5">
              {summary.stale.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/40 px-3 py-2 text-sm"
                >
                  <Badge variant="secondary" className="text-[10px]">
                    {item.assignee?.trim() || t.waitingUnassigned}
                  </Badge>
                  <span className="flex-1 min-w-[12rem]">{item.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.theme && item.theme !== NO_THEME_KEY ? item.theme : t.waitingNoTheme}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-status-vacation/40 bg-status-vacation/10 px-2 py-0.5 text-[10px] text-status-vacation">
                    <Link2 className="h-3 w-3" />
                    {item.dependency ?? t.waitingDependencyUnknown}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {item.staleDays === undefined
                      ? t.digestStaleDaysUnknown
                      : t.digestStaleDays.replace("{n}", String(item.staleDays))}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {summary.dependencies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.digestByDependency}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {summary.dependencies.map((dep) => (
              <Badge key={dep.dependency} variant="outline" className="gap-1">
                {dep.dependency === "Unknown" ? t.digestDependencyUnknown : dep.dependency}
                <span className="font-semibold">{dep.count}</span>
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.digestPreview}</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-4 text-xs whitespace-pre-wrap">
            {digestText}
          </pre>
        </CardContent>
      </Card>

      <p className="sr-only">{UNASSIGNED_KEY}</p>
    </div>
  );
};
