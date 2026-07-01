import { useEffect, useState } from "react";
import { ExternalLink, Link2, Paperclip, GitBranch, History, Loader2 } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import { useLang } from "@/context/LanguageContext";
import { TfsErrorPanel } from "@/components/TfsErrorPanel";
import {
  fetchTfsEpicDetail,
  humanizeEpicHistoryField,
  type TfsEpic,
  type TfsEpicDetail,
  type TfsError,
} from "@/services/tfs";
import { sanitizeRichText } from "@/lib/sanitizeHtml";

interface EpicDetailDrawerProps {
  epic: TfsEpic | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: {
    serverUrl: string;
    collection: string;
    project: string;
    team?: string;
    pat: string;
  } | null;
}

const formatDate = (iso?: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const formatDateTime = (iso?: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDate(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const relationIcon = (rel: string) => {
  if (rel === "Hyperlink") return <Link2 className="h-3.5 w-3.5" />;
  if (rel === "AttachedFile") return <Paperclip className="h-3.5 w-3.5" />;
  return <GitBranch className="h-3.5 w-3.5" />;
};

const relationLabel = (rel: string): string => {
  if (rel === "Hyperlink") return "Hyperlink";
  if (rel === "AttachedFile") return "Attachment";
  if (rel.startsWith("System.LinkTypes.")) return rel.replace("System.LinkTypes.", "");
  if (rel.startsWith("ArtifactLink")) return "Artifact";
  return rel;
};

const truncate = (value: string | undefined, max = 120): string => {
  if (!value) return "—";
  const clean = value.replace(/<[^>]+>/g, "").trim();
  if (clean.length <= max) return clean || "—";
  return `${clean.slice(0, max)}…`;
};

export const EpicDetailDrawer = ({ epic, open, onOpenChange, connection }: EpicDetailDrawerProps) => {
  const { t } = useLang();
  const [detail, setDetail] = useState<TfsEpicDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<TfsError | null>(null);

  useEffect(() => {
    if (!open || !epic || !connection) return;
    const controller = new AbortController();
    setDetail(null);
    setError(null);
    setLoading(true);
    fetchTfsEpicDetail(connection, epic.id, controller.signal).then((res) => {
      if (controller.signal.aborted) return;
      if (res.error) setError(res.error);
      if (res.item) setDetail(res.item);
      setLoading(false);
    });
    return () => controller.abort();
  }, [open, epic, connection]);

  if (!epic) return null;
  const current = detail ?? epic;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-3 border-b">
          <SheetTitle className="font-display text-lg leading-snug pr-8">
            <span className="font-mono text-sm text-muted-foreground mr-2">#{epic.id}</span>
            {current.title}
          </SheetTitle>
          <SheetDescription className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline">Epic</Badge>
            <Badge variant="outline">{current.state}</Badge>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-5">
            {error && <TfsErrorPanel error={error} />}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">{t.epicsColAssignee}</div>
                <div>{current.assignedTo ?? <span className="italic text-muted-foreground">{t.epicsUnassigned}</span>}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t.epicDetailCreatedBy}</div>
                <div>{detail?.createdBy ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t.epicsColTargetDate}</div>
                <div className="font-mono text-xs">{formatDate(current.targetDate)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t.epicDetailStartDate}</div>
                <div className="font-mono text-xs">{formatDate(current.startDate)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t.epicDetailCreated}</div>
                <div className="font-mono text-xs">{formatDate(detail?.createdDate)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t.epicsColChangedDate}</div>
                <div className="font-mono text-xs">{formatDate(current.changedDate)}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">{t.epicsColArea}</div>
                <div className="font-mono text-xs truncate">{current.areaPath ?? "—"}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">{t.epicDetailIteration}</div>
                <div className="font-mono text-xs truncate">{current.iterationPath ?? "—"}</div>
              </div>
            </div>

            {current.tags && current.tags.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1.5">{t.epicsColTags}</div>
                <div className="flex flex-wrap gap-1.5">
                  {current.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            <div>
              <div className="text-xs text-muted-foreground mb-1.5">{t.epicDetailDescription}</div>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : detail?.description ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-sm [&_a]:text-primary"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(detail.description) }}
                />
              ) : (
                <p className="text-sm text-muted-foreground italic">{t.epicDetailNoDescription}</p>
              )}
            </div>

            <Separator />

            <div>
              <div className="text-xs text-muted-foreground mb-1.5">{t.epicDetailLinks}</div>
              {loading ? (
                <Skeleton className="h-8 w-full" />
              ) : detail && detail.links.length > 0 ? (
                <ul className="space-y-1.5">
                  {detail.links.map((l, idx) => (
                    <li key={`${l.rel}-${idx}`} className="flex items-start gap-2 text-sm">
                      <span className="mt-1 text-muted-foreground">{relationIcon(l.rel)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-muted-foreground">{relationLabel(l.rel)}</div>
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline break-all"
                        >
                          {l.name || l.url}
                        </a>
                        {l.comment && <div className="text-xs text-muted-foreground">{l.comment}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground italic">{t.epicDetailNoLinks}</p>
              )}
            </div>

            <Separator />

            <div>
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" />
                {t.epicDetailHistory}
              </div>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : detail && detail.revisions.length > 0 ? (
                <ol className="relative border-l border-border/60 pl-4 space-y-4">
                  {detail.revisions.map((rev) => (
                    <li key={rev.rev} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">{rev.revisedBy ?? "—"}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {formatDateTime(rev.revisedDate)}
                        </span>
                      </div>
                      <ul className="mt-1 space-y-1">
                        {rev.changes.map((c, i) => (
                          <li key={`${rev.rev}-${i}`} className="text-xs">
                            <span className="font-medium text-foreground">{humanizeEpicHistoryField(c.field)}</span>:{" "}
                            <span className="text-muted-foreground line-through">{truncate(c.oldValue, 80)}</span>{" "}
                            <span className="text-muted-foreground">→</span>{" "}
                            <span className="text-foreground">{truncate(c.newValue, 80)}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground italic">{t.epicDetailNoHistory}</p>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="px-6 py-3 border-t flex justify-end">
          <Button asChild>
            <a href={current.htmlUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              {t.epicDetailOpenInAdo}
            </a>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
