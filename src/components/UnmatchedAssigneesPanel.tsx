import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronDown, UserPlus, Link as LinkIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/context/LanguageContext";
import { useApp } from "@/context/AppContext";
import type { Team, TeamMember } from "@/types";
import { buildAssigneeIndex, resolveMember } from "@/lib/assigneeMatch";

interface UnmatchedTask {
  assignee?: string;
  assigneeUniqueName?: string;
}

interface Props {
  tasks: UnmatchedTask[];
  members: TeamMember[];
  teams: Team[];
  isAdmin: boolean;
}

interface UnmatchedRow {
  key: string;
  displayName: string;
  uniqueName?: string;
  count: number;
}

export const UnmatchedAssigneesPanel = ({
  tasks,
  members,
  teams,
  isAdmin,
}: Props) => {
  const { lang } = useLang();
  const isEs = lang === "es";
  const { updateMember, addMember } = useApp();
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [teamPick, setTeamPick] = useState<Record<string, string>>({});
  const [linkPick, setLinkPick] = useState<Record<string, string>>({});

  const unmatched = useMemo<UnmatchedRow[]>(() => {
    const index = buildAssigneeIndex(members);
    const map = new Map<string, UnmatchedRow>();
    tasks.forEach((t) => {
      const name = (t.assignee ?? "").trim();
      if (!name) return;
      if (resolveMember(name, t.assigneeUniqueName, index)) return;
      const key = `${name}\u0001${t.assigneeUniqueName ?? ""}`;
      const row = map.get(key);
      if (row) row.count += 1;
      else map.set(key, { key, displayName: name, uniqueName: t.assigneeUniqueName, count: 1 });
    });
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [tasks, members]);

  if (!isAdmin || unmatched.length === 0) return null;

  const title = isEs
    ? "Assignees sin equipo"
    : "Assignees without a team";
  const description = isEs
    ? "Estas personas aparecen en TFS pero no coinciden con ningún miembro registrado, por eso no aparecen al filtrar por equipo."
    : "These people appear in TFS but don't match any registered member, so they are missing from team filters.";
  const linkLabel = isEs ? "Vincular a miembro existente" : "Link to existing member";
  const createLabel = isEs ? "Crear miembro" : "Create member";
  const teamLabel = isEs ? "Equipo" : "Team";
  const savedMsg = isEs ? "Vinculación guardada" : "Link saved";
  const createdMsg = isEs ? "Miembro creado" : "Member created";

  const handleLink = async (row: UnmatchedRow) => {
    const memberId = linkPick[row.key];
    if (!memberId) return;
    const target = members.find((m) => m.id === memberId);
    if (!target) return;
    setBusyKey(row.key);
    try {
      const loginFromUnique = row.uniqueName
        ? (() => {
            const trimmed = row.uniqueName!.trim();
            const at = trimmed.indexOf("@");
            const local = at >= 0 ? trimmed.slice(0, at) : trimmed;
            const slash = local.lastIndexOf("\\");
            return slash >= 0 ? local.slice(slash + 1) : local;
          })()
        : row.displayName;
      await updateMember({ ...target, loginName: loginFromUnique });
      toast.success(savedMsg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  };

  const handleCreate = async (row: UnmatchedRow) => {
    const teamId = teamPick[row.key];
    if (!teamId) return;
    setBusyKey(row.key);
    try {
      const loginFromUnique = row.uniqueName
        ? (() => {
            const trimmed = row.uniqueName!.trim();
            const at = trimmed.indexOf("@");
            const local = at >= 0 ? trimmed.slice(0, at) : trimmed;
            const slash = local.lastIndexOf("\\");
            return slash >= 0 ? local.slice(slash + 1) : local;
          })()
        : undefined;
      await addMember({
        name: row.displayName,
        role: "",
        teamId,
        loginName: loginFromUnique,
      });
      toast.success(createdMsg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  };

  // Silence unused import warning in some build configs.
  void supabase;

  return (
    <Alert className="border-amber-500/40 bg-amber-500/5">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="flex items-center gap-2">
        {title}
        <Badge variant="secondary" className="ml-1">{unmatched.length}</Badge>
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-sm text-muted-foreground">{description}</p>
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              {open ? (isEs ? "Ocultar" : "Hide") : (isEs ? "Mostrar detalle" : "Show details")}
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="rounded-md border bg-background/50 divide-y">
              {unmatched.map((row) => (
                <div key={row.key} className="p-3 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium text-sm">{row.displayName}</span>
                    {row.uniqueName && (
                      <span className="text-xs text-muted-foreground">{row.uniqueName}</span>
                    )}
                    <Badge variant="outline" className="ml-auto">{row.count}</Badge>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {/* Link to existing member */}
                    <div className="flex items-center gap-2">
                      <Select
                        value={linkPick[row.key] ?? ""}
                        onValueChange={(v) => setLinkPick((p) => ({ ...p, [row.key]: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder={linkLabel} />
                        </SelectTrigger>
                        <SelectContent>
                          {members.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 gap-1"
                        disabled={!linkPick[row.key] || busyKey === row.key}
                        onClick={() => handleLink(row)}
                      >
                        <LinkIcon className="h-3.5 w-3.5" />
                        {isEs ? "Vincular" : "Link"}
                      </Button>
                    </div>
                    {/* Create new member in selected team */}
                    <div className="flex items-center gap-2">
                      <Select
                        value={teamPick[row.key] ?? ""}
                        onValueChange={(v) => setTeamPick((p) => ({ ...p, [row.key]: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder={teamLabel} />
                        </SelectTrigger>
                        <SelectContent>
                          {teams.map((tm) => (
                            <SelectItem key={tm.id} value={tm.id}>
                              {tm.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="h-8 gap-1"
                        disabled={!teamPick[row.key] || busyKey === row.key}
                        onClick={() => handleCreate(row)}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        {createLabel}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </AlertDescription>
    </Alert>
  );
};
