import { useState, useEffect } from "react";
import { useLang } from "@/context/LanguageContext";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Users, CloudDownload, AlertCircle, Info, Search, History, ChevronDown, ChevronRight, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { listTfsTeamMembers, TfsTeamMemberIdentity, TfsConnection, TfsError } from "@/services/tfs";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TfsImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
}

interface HistoryMember {
  displayName: string;
  uniqueName: string;
}

interface HistoryEntry {
  id: string;
  created_at: string;
  imported_count: number;
  imported_members: HistoryMember[];
}

export function TfsImportDialog({ open, onOpenChange, teamId }: TfsImportDialogProps) {
  const { t } = useLang();
  const { user } = useAuth();
  const { members, addMember } = useApp();

  const [loading, setLoading] = useState(false);
  const [tfsMembers, setTfsMembers] = useState<TfsTeamMemberIdentity[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<{ title: string; message: string; hints: string[]; detail?: string } | null>(null);
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reviewEntry, setReviewEntry] = useState<HistoryEntry | null>(null);

  const buildError = (e: TfsError): { title: string; message: string; hints: string[]; detail?: string } => {
    const hintsByKind: Record<string, { title: string; hints: string[] }> = {
      cors: {
        title: t.importTfsErrCorsTitle,
        hints: [t.importTfsErrCorsHint1, t.importTfsErrCorsHint2],
      },
      mixed_content: {
        title: t.importTfsErrMixedTitle,
        hints: [t.importTfsErrMixedHint1],
      },
      timeout: {
        title: t.importTfsErrTimeoutTitle,
        hints: [t.importTfsErrTimeoutHint1, t.importTfsErrTimeoutHint2],
      },
      unauthorized: {
        title: t.importTfsErrUnauthorizedTitle,
        hints: [t.importTfsErrUnauthorizedHint1, t.importTfsErrUnauthorizedHint2],
      },
      forbidden: {
        title: t.importTfsErrForbiddenTitle,
        hints: [t.importTfsErrForbiddenHint1, t.importTfsErrForbiddenHint2],
      },
      not_found: {
        title: t.importTfsErrNotFoundTitle,
        hints: [t.importTfsErrNotFoundHint1, t.importTfsErrNotFoundHint2],
      },
      http: {
        title: t.importTfsErrHttpTitle.replace("{status}", String(e.status ?? "?")),
        hints: [t.importTfsErrHttpHint1],
      },
      unknown: {
        title: t.importTfsErrUnknownTitle,
        hints: [t.importTfsErrUnknownHint1],
      },
    };
    const info = hintsByKind[e.kind] ?? hintsByKind.unknown;
    return { title: info.title, message: e.message, hints: info.hints, detail: e.detail };
  };

  // We only load when the dialog opens
  useEffect(() => {
    if (!open || !user) return;

    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      setTfsMembers([]);
      setSelectedIds(new Set());
      setQuery("");

      try {
        const { data: config } = await supabase
          .from("azure_devops_settings")
          .select("server_url, collection, project, team, pat_encrypted")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!config?.server_url || !config?.collection || !config?.project || !config?.pat_encrypted || !config?.team) {
          if (isMounted) {
            setError({
              title: t.importTfsConfigureTitle,
              message: t.importTfsConfigureAlert,
              hints: [t.importTfsConfigureHint1],
            });
          }
          return;
        }

        const conn: TfsConnection = {
          serverUrl: config.server_url,
          collection: config.collection,
          project: config.project,
          team: config.team,
          pat: config.pat_encrypted,
        };

        const result = await listTfsTeamMembers(conn);
        if (isMounted) {
          if (result.error) {
            setError(buildError(result.error));
          } else {
            setTfsMembers(result.items);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          setError({
            title: t.importTfsErrUnknownTitle,
            message: msg,
            hints: [t.importTfsErrUnknownHint1],
          });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    loadHistory();

    return () => {
      isMounted = false;
    };
  }, [open, user, t]);

  // Normalize for robust duplicate detection (case, whitespace, accents, domain variants).
  const normalizeName = (s: string | null | undefined): string => {
    if (!s) return "";
    return s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // strip diacritics
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  };

  const normalizeLogin = (s: string | null | undefined): string => {
    if (!s) return "";
    let v = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    // Strip Windows-style domain prefix (DOMAIN\user)
    const slash = v.lastIndexOf("\\");
    if (slash >= 0) v = v.slice(slash + 1);
    // For emails, compare local-part too so "user@a.com" == "user@b.com" variants don't slip through
    return v;
  };

  const loginLocalPart = (s: string): string => {
    const at = s.indexOf("@");
    return at >= 0 ? s.slice(0, at) : s;
  };

  // Derive existing logins / names in the current Lovable team to disable duplicates
  const currentTeamMembers = members.filter((m) => m.teamId === teamId);
  const existingLogins = new Set<string>();
  const existingLoginLocals = new Set<string>();
  const existingNames = new Set<string>();
  for (const m of currentTeamMembers) {
    const login = normalizeLogin(m.loginName);
    if (login) {
      existingLogins.add(login);
      existingLoginLocals.add(loginLocalPart(login));
    }
    const name = normalizeName(m.name);
    if (name) existingNames.add(name);
  }

  const isDuplicate = (m: TfsTeamMemberIdentity) => {
    const login = normalizeLogin(m.uniqueName);
    const name = normalizeName(m.displayName);
    if (login && existingLogins.has(login)) return true;
    if (login && existingLoginLocals.has(loginLocalPart(login))) return true;
    if (name && existingNames.has(name)) return true;
    return false;
  };

  const handleToggle = (id: string, duplicate: boolean) => {
    if (duplicate) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const normalizedQuery = normalizeName(query);
  const filteredMembers = normalizedQuery
    ? tfsMembers.filter(
        (m) =>
          normalizeName(m.displayName).includes(normalizedQuery) ||
          normalizeName(m.uniqueName).includes(normalizedQuery),
      )
    : tfsMembers;

  const handleToggleAll = () => {
    const availableIds = filteredMembers.filter((m) => !isDuplicate(m)).map((m) => m.id);
    const allInViewSelected =
      availableIds.length > 0 && availableIds.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allInViewSelected) {
      for (const id of availableIds) next.delete(id);
    } else {
      for (const id of availableIds) next.add(id);
    }
    setSelectedIds(next);
  };

  const handleImport = () => {
    if (selectedIds.size === 0) return;
    
    let addedCount = 0;
    const toAdd = tfsMembers.filter((m) => selectedIds.has(m.id) && !isDuplicate(m));

    for (const m of toAdd) {
      addMember({
        name: m.displayName,
        loginName: m.uniqueName,
        role: "Team Member",
        teamId,
      });
      addedCount++;
    }

    toast.success(t.importTfsSuccess.replace("{count}", String(addedCount)));
    onOpenChange(false);
  };

  const availableInView = filteredMembers.filter((m) => !isDuplicate(m));
  const availableCount = availableInView.length;
  const allSelected =
    availableCount > 0 && availableInView.every((m) => selectedIds.has(m.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudDownload className="h-5 w-5" />
            {t.importTfsTeamMembersTitle}
          </DialogTitle>
          <DialogDescription>{t.importTfsTeamMembersDesc}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-[300px] my-2">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p>Consultando Azure DevOps...</p>
            </div>
          ) : error ? (
            <Alert variant="destructive" className="text-left">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{error.title}</AlertTitle>
              <AlertDescription className="text-sm space-y-2">
                <p>{error.message}</p>
                {error.hints.length > 0 && (
                  <ul className="list-disc pl-5 space-y-0.5">
                    {error.hints.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                )}
                {error.detail && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs opacity-80">
                      {t.importTfsErrShowDetail}
                    </summary>
                    <pre className="mt-1 text-xs whitespace-pre-wrap break-all opacity-80">
                      {error.detail}
                    </pre>
                  </details>
                )}
              </AlertDescription>
            </Alert>
          ) : tfsMembers.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm text-center">
              <Info className="h-10 w-10 mb-2 opacity-50" />
              <p>{t.importTfsNoMembers}</p>
            </div>
          ) : (
            <>
              <div className="relative mb-2">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.searchMember}
                  className="pl-8 h-9"
                />
              </div>
              <div className="flex items-center gap-2 px-1 mb-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleToggleAll}
                  disabled={availableCount === 0}
                  id="select-all"
                />
                <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                  Seleccionar todos los disponibles ({availableCount})
                </label>
              </div>
              <ScrollArea className="flex-1 border rounded-md p-1">
                <TooltipProvider>
                  <div className="flex flex-col gap-1">
                    {filteredMembers.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-6">
                        {t.noResults}
                      </div>
                    ) : filteredMembers.map((m) => {
                      const dup = isDuplicate(m);
                      const isChecked = selectedIds.has(m.id);
                      return (
                        <Tooltip key={m.id} delayDuration={300}>
                          <TooltipTrigger asChild>
                            <div
                              className={`flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors ${
                                dup ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                              }`}
                              onClick={() => handleToggle(m.id, dup)}
                            >
                              <Checkbox
                                checked={isChecked || dup}
                                disabled={dup}
                                className={dup ? "opacity-50" : ""}
                              />
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs">
                                  {m.displayName.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{m.displayName}</p>
                                <p className="text-xs text-muted-foreground truncate">{m.uniqueName}</p>
                              </div>
                            </div>
                          </TooltipTrigger>
                          {dup && (
                            <TooltipContent>
                              <p>{t.importTfsDuplicateTooltip}</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      );
                    })}
                  </div>
                </TooltipProvider>
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter className="mt-auto pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button
            onClick={handleImport}
            disabled={loading || !!error || tfsMembers.length === 0 || selectedIds.size === 0}
          >
            <Users className="h-4 w-4 mr-2" />
            {t.importTfsImportCount.replace("{count}", String(selectedIds.size))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
