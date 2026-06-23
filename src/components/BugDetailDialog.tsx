import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Link2, Paperclip, GitBranch } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import { useLang } from "@/context/LanguageContext";
import { SeverityBadge } from "@/components/SeverityBadge";
import { TfsErrorPanel } from "@/components/TfsErrorPanel";
import { fetchTfsBugDetail, type TfsBug, type TfsBugDetail, type TfsError } from "@/services/tfs";
import { sanitizeRichText } from "@/lib/sanitizeHtml";

interface BugDetailDialogProps {
  bug: TfsBug | null;
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

const formatDate = (iso?: string): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const priorityVariant = (p?: number): "default" | "destructive" | "secondary" | "outline" => {
  if (p === 1) return "destructive";
  if (p === 2) return "default";
  if (p === 3) return "secondary";
  return "outline";
};

const relationIcon = (rel: string) => {
  if (rel === "Hyperlink") return <Link2 className="h-3.5 w-3.5" />;
  if (rel === "AttachedFile") return <Paperclip className="h-3.5 w-3.5" />;
  return <GitBranch className="h-3.5 w-3.5" />;
};

const relationLabel = (rel: string): string => {
  // Strip common ADO prefixes for readability.
  if (rel === "Hyperlink") return "Hyperlink";
  if (rel === "AttachedFile") return "Attachment";
  if (rel.startsWith("System.LinkTypes.")) return rel.replace("System.LinkTypes.", "");
  if (rel.startsWith("ArtifactLink")) return "Artifact";
  return rel;
};

export const BugDetailDialog = ({ bug, open, onOpenChange, connection }: BugDetailDialogProps) => {
  const { t } = useLang();
  const [detail, setDetail] = useState<TfsBugDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<TfsError | null>(null);

  useEffect(() => {
    if (!open || !bug || !connection) return;
    let cancelled = false;
    setDetail(null);
    setError(null);
    setLoading(true);
    fetchTfsBugDetail(connection, bug.id).then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      if (res.item) setDetail(res.item);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, bug, connection]);

  if (!bug) return null;

  const current = detail ?? bug;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle className="font-display text-lg leading-snug pr-8">
                <span className="font-mono text-sm text-muted-foreground mr-2">#{bug.id}</span>
                {current.title}
              </DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{current.workItemType}</Badge>
                <Badge variant="outline">{current.state}</Badge>
                {current.priority !== undefined && (
                  <Badge variant={priorityVariant(current.priority)}>
                    {t.bugDetailPriority}: {current.priority}
                  </Badge>
                )}
                {current.severity && <SeverityBadge severity={current.severity} />}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-5">
            {error && <TfsErrorPanel error={error} />}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">{t.bugsColumnAssignee}</div>
                <div>{current.assignedTo ?? <span className="italic text-muted-foreground">{t.bugsUnassigned}</span>}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t.bugDetailCreatedBy}</div>
                <div>{detail?.createdBy ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t.bugsColumnIteration}</div>
                <div className="font-mono text-xs">{current.iterationPath ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t.bugsColumnArea}</div>
                <div className="font-mono text-xs">{current.areaPath ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t.bugDetailCreated}</div>
                <div>{formatDate(detail?.createdDate)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t.bugDetailChanged}</div>
                <div>{formatDate(detail?.changedDate)}</div>
              </div>
            </div>

            {current.tags && current.tags.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1.5">{t.bugDetailTags}</div>
                <div className="flex flex-wrap gap-1.5">
                  {current.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            <div>
              <div className="text-xs text-muted-foreground mb-1.5">{t.bugDetailDescription}</div>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : detail?.description ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-sm [&_a]:text-primary"
                  // Sanitized via DOMPurify to neutralise stored XSS from ADO.
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(detail.description) }}
                />
              ) : (
                <p className="text-sm text-muted-foreground italic">{t.bugDetailNoDescription}</p>
              )}
            </div>

            {detail?.reproSteps && (
              <div>
                <div className="text-xs text-muted-foreground mb-1.5">{t.bugDetailReproSteps}</div>
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-sm [&_a]:text-primary"
                  // Sanitized via DOMPurify to neutralise stored XSS from ADO.
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(detail.reproSteps) }}
                />
              </div>
            )}

            <Separator />

            <div>
              <div className="text-xs text-muted-foreground mb-1.5">{t.bugDetailLinks}</div>
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
                <p className="text-sm text-muted-foreground italic">{t.bugDetailNoLinks}</p>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end pt-2 border-t">
          <Button asChild>
            <a href={current.htmlUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              {t.bugDetailOpenInAdo}
            </a>
          </Button>
        </div>

        {loading && (
          <div className="absolute top-3 right-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
