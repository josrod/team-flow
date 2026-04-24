import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { Loader2, RefreshCw, Cloud, Database, Search, Layers, ListChecks, Users as UsersIcon, ExternalLink, Copy } from "lucide-react";
import { listTfsFeatures, listTfsTasks, type TfsWorkItem } from "@/services/tfs";
import { toast } from "sonner";

type DataSource = "tfs" | "local";

interface UnifiedFeature {
  id: string;
  title: string;
  state: string;
  assignee?: string;
  taskCount: number;
  doneCount: number;
}

interface UnifiedTask {
  id: string;
  title: string;
  state: string;
  type: string;
  assignee?: string;
  featureId?: string;
}

// Map a TFS state to a normalized bucket for charts/visuals
const normalizeState = (state: string): "active" | "pending" | "done" | "blocked" => {
  const s = state.toLowerCase();
  if (s.includes("done") || s.includes("closed") || s.includes("resolved") || s.includes("completed")) return "done";
  if (s.includes("block")) return "blocked";
  if (s.includes("active") || s.includes("progress") || s.includes("committed") || s.includes("doing")) return "active";
  return "pending";
};

const stateColorVar: Record<string, string> = {
  active: "hsl(var(--status-info))",
  pending: "hsl(var(--status-vacation))",
  done: "hsl(var(--status-available))",
  blocked: "hsl(var(--status-sick))",
};

const stateLabel: Record<string, string> = {
  active: "Activo",
  pending: "Pendiente",
  done: "Completado",
  blocked: "Bloqueado",
};

export default function FeaturesPage() {
  const { teams, members, workTopics } = useApp();
  const { user } = useAuth();

  const [source, setSource] = useState<DataSource>("local");
  const [loading, setLoading] = useState(false);
  const [tfsConnConfigured, setTfsConnConfigured] = useState(false);
  const [tfsFeatures, setTfsFeatures] = useState<TfsWorkItem[]>([]);
  const [tfsTasks, setTfsTasks] = useState<TfsWorkItem[]>([]);
  const [tfsError, setTfsError] = useState<string | null>(null);
  const [tfsBaseUrl, setTfsBaseUrl] = useState<string | null>(null);

  const [activeTeam, setActiveTeam] = useState<string>("all");
  const [activePerson, setActivePerson] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Detect TFS settings on mount
  useEffect(() => {
    const detect = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("azure_devops_settings")
        .select("server_url, collection, project, team, pat_encrypted")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.server_url && data?.collection && data?.project && data?.pat_encrypted) {
        setTfsConnConfigured(true);
        setSource("tfs");
        await loadFromTfs(data);
      }
    };
    detect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadFromTfs = async (
    presetSettings?: { server_url: string | null; collection: string | null; project: string; team: string | null; pat_encrypted: string },
  ) => {
    if (!user) return;
    setLoading(true);
    setTfsError(null);
    try {
      let settings = presetSettings;
      if (!settings) {
        const { data } = await supabase
          .from("azure_devops_settings")
          .select("server_url, collection, project, team, pat_encrypted")
          .eq("user_id", user.id)
          .maybeSingle();
        settings = data ?? undefined;
      }
      if (!settings?.server_url || !settings?.collection || !settings?.project || !settings?.pat_encrypted) {
        setTfsError("Configuración de Azure DevOps incompleta. Mostrando datos locales.");
        setSource("local");
        return;
      }
      const conn = {
        serverUrl: settings.server_url,
        collection: settings.collection,
        project: settings.project,
        team: settings.team ?? undefined,
        pat: settings.pat_encrypted,
      };
      // Build base URL for "Open in Azure DevOps" links
      const cleanServer = settings.server_url.replace(/\/+$/, "");
      const cleanCollection = settings.collection.replace(/^\/+|\/+$/g, "");
      const cleanProject = settings.project.replace(/^\/+|\/+$/g, "");
      setTfsBaseUrl(`${cleanServer}/${cleanCollection}/${encodeURIComponent(cleanProject)}`);
      const [featRes, taskRes] = await Promise.all([
        listTfsFeatures(conn),
        listTfsTasks(conn),
      ]);
      if (featRes.error) {
        setTfsError(featRes.error.message);
        toast.error(`TFS: ${featRes.error.message}`);
      }
      setTfsFeatures(featRes.items);
      setTfsTasks(taskRes.items);
    } catch (err) {
      setTfsError(err instanceof Error ? err.message : "Error desconocido");
      setSource("local");
    } finally {
      setLoading(false);
    }
  };

  // Build unified data depending on source
  const { features, tasks } = useMemo<{ features: UnifiedFeature[]; tasks: UnifiedTask[] }>(() => {
    if (source === "tfs" && tfsFeatures.length + tfsTasks.length > 0) {
      const feats: UnifiedFeature[] = tfsFeatures.map((f) => {
        const childTasks = tfsTasks.filter((t) => t.areaPath && f.areaPath && t.areaPath === f.areaPath);
        return {
          id: String(f.id),
          title: f.title,
          state: f.state,
          assignee: f.assignedTo,
          taskCount: childTasks.length,
          doneCount: childTasks.filter((t) => normalizeState(t.state) === "done").length,
        };
      });
      const tks: UnifiedTask[] = tfsTasks.map((t) => ({
        id: String(t.id),
        title: t.title,
        state: t.state,
        type: t.workItemType,
        assignee: t.assignedTo,
      }));
      return { features: feats, tasks: tks };
    }

    // Local fallback: derive "features" from teams (each team = a feature group)
    // and tasks from workTopics.
    const feats: UnifiedFeature[] = teams.map((team) => {
      const teamMemberIds = members.filter((m) => m.teamId === team.id).map((m) => m.id);
      const teamTopics = workTopics.filter((t) => teamMemberIds.includes(t.memberId));
      return {
        id: team.id,
        title: `${team.name} — Backlog`,
        state: teamTopics.some((t) => t.status === "in-progress") ? "Active" : "Pending",
        taskCount: teamTopics.length,
        doneCount: teamTopics.filter((t) => t.status === "completed").length,
      };
    });
    // Also add per-member "mini features" based on biggest topic
    const tks: UnifiedTask[] = workTopics.map((t) => {
      const owner = members.find((m) => m.id === t.memberId);
      return {
        id: t.id,
        title: t.name,
        state: t.status,
        type: "Topic",
        assignee: owner?.name,
        featureId: owner?.teamId,
      };
    });
    return { features: feats, tasks: tks };
  }, [source, tfsFeatures, tfsTasks, teams, members, workTopics]);

  // Filter people by selected team tab (for the dropdown)
  const peopleForTab = useMemo(() => {
    if (source === "tfs") {
      const set = new Set<string>();
      tasks.forEach((t) => t.assignee && set.add(t.assignee));
      features.forEach((f) => f.assignee && set.add(f.assignee));
      return Array.from(set).sort();
    }
    if (activeTeam === "all") return members.map((m) => m.name);
    return members.filter((m) => m.teamId === activeTeam).map((m) => m.name);
  }, [source, tasks, features, activeTeam, members]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // team filter (local mode only — TFS tasks don't have team mapping)
      if (source === "local" && activeTeam !== "all") {
        const owner = members.find((m) => m.name === t.assignee);
        if (owner?.teamId !== activeTeam) return false;
      }
      if (activePerson !== "all" && t.assignee !== activePerson) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tasks, activeTeam, activePerson, search, source, members]);

  // Stats for visuals
  const stateDistribution = useMemo(() => {
    const counts: Record<string, number> = { active: 0, pending: 0, done: 0, blocked: 0 };
    filteredTasks.forEach((t) => {
      counts[normalizeState(t.state)]++;
    });
    return Object.entries(counts).map(([key, value]) => ({
      key, name: stateLabel[key], value, fill: stateColorVar[key],
    }));
  }, [filteredTasks]);

  const workloadByPerson = useMemo(() => {
    const map: Record<string, { active: number; pending: number; done: number; blocked: number }> = {};
    filteredTasks.forEach((t) => {
      const name = t.assignee || "Sin asignar";
      if (!map[name]) map[name] = { active: 0, pending: 0, done: 0, blocked: 0 };
      map[name][normalizeState(t.state)]++;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v, total: v.active + v.pending + v.done + v.blocked }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [filteredTasks]);

  const filteredFeatures = useMemo(() => {
    if (source !== "local" || activeTeam === "all") return features;
    return features.filter((f) => f.id === activeTeam);
  }, [features, activeTeam, source]);

  // Reset person dropdown when tab changes
  useEffect(() => { setActivePerson("all"); }, [activeTeam]);

  const copyWorkItemLink = async (id: string, type: "feature" | "tarea") => {
    if (!tfsBaseUrl) return;
    const url = `${tfsBaseUrl}/_workitems/edit/${id}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      toast.success(`Enlace de la ${type} #${id} copiado`);
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Features & Tareas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visión general del trabajo en curso del proyecto.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5">
            {source === "tfs" ? <Cloud className="h-3 w-3" /> : <Database className="h-3 w-3" />}
            <span className="text-xs">{source === "tfs" ? "Azure DevOps" : "Datos locales"}</span>
          </Badge>
          {tfsConnConfigured && (
            <Button size="sm" variant="outline" onClick={() => loadFromTfs()} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Actualizar</span>
            </Button>
          )}
        </div>
      </div>

      {tfsError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">{tfsError}</CardContent>
        </Card>
      )}

      {/* KPI strip */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/50">
                <Layers className="h-4 w-4 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{features.length}</p>
                <p className="text-xs text-muted-foreground">Features</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/50">
                <ListChecks className="h-4 w-4 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{tasks.length}</p>
                <p className="text-xs text-muted-foreground">Tareas totales</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: `${stateColorVar.active}20` }}>
                <Loader2 className="h-4 w-4" style={{ color: stateColorVar.active }} />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {tasks.filter((t) => normalizeState(t.state) === "active").length}
                </p>
                <p className="text-xs text-muted-foreground">En ejecución</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: `${stateColorVar.done}20` }}>
                <ListChecks className="h-4 w-4" style={{ color: stateColorVar.done }} />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {tasks.filter((t) => normalizeState(t.state) === "done").length}
                </p>
                <p className="text-xs text-muted-foreground">Completadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Features section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="h-4 w-4" /> Features del proyecto
          </CardTitle>
          <CardDescription>Progreso por feature con tareas asociadas</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredFeatures.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No hay features para mostrar.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredFeatures.map((f) => {
                const norm = normalizeState(f.state);
                const pct = f.taskCount > 0 ? Math.round((f.doneCount / f.taskCount) * 100) : 0;
                return (
                  <div key={f.id} className="border border-border rounded-lg p-4 hover:border-primary/40 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-medium text-sm leading-snug line-clamp-2">{f.title}</h3>
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-[10px]"
                        style={{ background: `${stateColorVar[norm]}20`, color: stateColorVar[norm] }}
                      >
                        {stateLabel[norm]}
                      </Badge>
                    </div>
                    {f.assignee && (
                      <p className="text-xs text-muted-foreground mb-3 truncate">👤 {f.assignee}</p>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>{f.doneCount} / {f.taskCount} tareas</span>
                      <span className="font-medium">{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                    {source === "tfs" && tfsBaseUrl && (
                      <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="mt-3 h-7 px-2 text-xs w-full justify-center"
                      >
                        <a
                          href={`${tfsBaseUrl}/_workitems/edit/${f.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Abrir feature ${f.id} en Azure DevOps`}
                        >
                          <ExternalLink className="h-3 w-3" />
                          Abrir en Azure DevOps
                        </a>
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visual: what's running right now */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribución por estado</CardTitle>
            <CardDescription>Qué se está ejecutando ahora mismo</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={stateDistribution.filter((d) => d.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={80}
                  innerRadius={45}
                  paddingAngle={2}
                >
                  {stateDistribution.map((d) => (
                    <Cell key={d.key} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UsersIcon className="h-4 w-4" /> Carga por persona
            </CardTitle>
            <CardDescription>Top {workloadByPerson.length} con más tareas</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={workloadByPerson} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Bar dataKey="active" stackId="a" fill={stateColorVar.active} name="Activo" />
                <Bar dataKey="pending" stackId="a" fill={stateColorVar.pending} name="Pendiente" />
                <Bar dataKey="blocked" stackId="a" fill={stateColorVar.blocked} name="Bloqueado" />
                <Bar dataKey="done" stackId="a" fill={stateColorVar.done} name="Hecho" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tasks section: tabs por equipo + dropdown persona */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <ListChecks className="h-4 w-4" /> Tareas asignadas
              </CardTitle>
              <CardDescription>
                {filteredTasks.length} de {tasks.length} tareas mostradas
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar tarea..."
                  className="pl-8 h-9 w-56"
                />
              </div>
              <Select value={activePerson} onValueChange={setActivePerson}>
                <SelectTrigger className="w-52 h-9">
                  <SelectValue placeholder="Persona" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las personas</SelectItem>
                  {peopleForTab.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTeam} onValueChange={setActiveTeam}>
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              {teams.map((team) => (
                <TabsTrigger key={team.id} value={team.id}>{team.name}</TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={activeTeam} className="mt-4">
              {filteredTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No hay tareas que coincidan con los filtros.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[60px]">#</TableHead>
                        <TableHead>Título</TableHead>
                        <TableHead className="w-[100px]">Tipo</TableHead>
                        <TableHead className="w-[120px]">Estado</TableHead>
                        <TableHead className="w-[180px]">Asignado a</TableHead>
                        {source === "tfs" && tfsBaseUrl && (
                          <TableHead className="w-[60px] text-right">Acción</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTasks.slice(0, 100).map((t) => {
                        const norm = normalizeState(t.state);
                        return (
                          <TableRow key={t.id}>
                            <TableCell className="font-mono text-xs text-muted-foreground">{t.id}</TableCell>
                            <TableCell className="font-medium text-sm">{t.title}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">{t.type}</Badge>
                            </TableCell>
                            <TableCell>
                              <span
                                className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
                                style={{ background: `${stateColorVar[norm]}20`, color: stateColorVar[norm] }}
                              >
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: stateColorVar[norm] }} />
                                {t.state}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">
                              {t.assignee || <span className="text-muted-foreground italic">Sin asignar</span>}
                            </TableCell>
                            {source === "tfs" && tfsBaseUrl && (
                              <TableCell className="text-right">
                                <Button
                                  asChild
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  title="Abrir en Azure DevOps"
                                >
                                  <a
                                    href={`${tfsBaseUrl}/_workitems/edit/${t.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Abrir tarea ${t.id} en Azure DevOps`}
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {filteredTasks.length > 100 && (
                    <p className="text-xs text-muted-foreground text-center py-2 border-t">
                      Mostrando 100 de {filteredTasks.length} tareas — afina los filtros para ver más.
                    </p>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
