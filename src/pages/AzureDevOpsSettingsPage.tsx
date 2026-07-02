import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Settings,
  Plug,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { useLang } from "@/context/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  testTfsConnection,
  runPatDiagnostics,
  listTfsCollections,
  listTfsProjects,
  listTfsTeams,
  listTfsClassificationNodes,
  clearTfsAreaPathCache,
  type TfsProjectInfo,
  type TfsError,
  type TfsDiagnosticResult,
} from "@/services/tfs";
import { TfsErrorPanel } from "@/components/TfsErrorPanel";
import { encryptPat, decryptPat } from "@/services/tfsPatVault";
import { TfsPatDiagnosticsPanel } from "@/components/TfsPatDiagnosticsPanel";
import { TfsFieldHint } from "@/components/TfsFieldHint";
import { TfsAutocompleteInput } from "@/components/TfsAutocompleteInput";
import { TfsMultiSelect } from "@/components/TfsMultiSelect";
import { evaluateSaveGuard, validateConnectionFields, validateServerUrl } from "@/lib/tfsValidation";
import { mapBugsQueryIdError } from "@/lib/supabaseErrorMapping";
import { cn } from "@/lib/utils";

export const AzureDevOpsSettingsPage = () => {
  const { t } = useLang();

  const [serverUrl, setServerUrl] = useState("");
  const [collection, setCollection] = useState("");
  const [organization, setOrganization] = useState("");
  const [project, setProject] = useState("");
  const [team, setTeam] = useState("");
  const [pat, setPat] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [syncInterval, setSyncInterval] = useState("30");
  const [areaPaths, setAreaPaths] = useState<string[]>([]);
  const [iterationPaths, setIterationPaths] = useState<string[]>([]);
  const [bugsQueryId, setBugsQueryId] = useState("");
  const [epicsQueryId, setEpicsQueryId] = useState("");
  const [epicsProject, setEpicsProject] = useState("");
  const [epicsTeam, setEpicsTeam] = useState("");
  const [epicsAreaPaths, setEpicsAreaPaths] = useState<string[]>([]);
  const [epicsIterationPaths, setEpicsIterationPaths] = useState<string[]>([]);
  const [epicsTags, setEpicsTags] = useState<string[]>([]);
  const [epicsTagInput, setEpicsTagInput] = useState("");


  
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");
  const [tfsProject, setTfsProject] = useState<TfsProjectInfo | null>(null);
  const [tfsError, setTfsError] = useState<TfsError | null>(null);
  const [diagnostics, setDiagnostics] = useState<TfsDiagnosticResult | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosticsAt, setDiagnosticsAt] = useState<string | null>(null);
  const [hasExisting, setHasExisting] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const autoSaveTimerRef = useRef<number | null>(null);

  const DRAFT_KEY = "ado_settings_draft";

  useEffect(() => {
    const loadSettings = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        hasLoadedRef.current = true;
        return;
      }

      const { data } = await supabase
        .from("azure_devops_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setServerUrl(data.server_url ?? "");
        setCollection(data.collection ?? "");
        setOrganization(data.organization ?? "");
        setProject(data.project);
        setTeam(data.team ?? "");
        // Decrypt PAT via the vault edge function. Legacy plaintext rows
        // (pat_iv = null) round-trip as-is, so existing users aren't broken.
        try {
          const patIv = (data as { pat_iv?: string | null }).pat_iv ?? null;
          const plainPat = await decryptPat(data.pat_encrypted, patIv);
          setPat(plainPat);
        } catch {
          setPat("");
          toast.error("Could not decrypt your saved PAT — please re-enter it.");
        }
        setAutoSync(data.auto_sync_enabled);
        setSyncInterval(String(data.sync_interval_minutes));
        const rawAreas = (data as { area_paths?: string[] | null }).area_paths;
        const rawIters = (data as { iteration_paths?: string[] | null }).iteration_paths;
        if (Array.isArray(rawAreas)) setAreaPaths(rawAreas);
        if (Array.isArray(rawIters)) setIterationPaths(rawIters);
        setBugsQueryId((data as { bugs_query_id?: string | null }).bugs_query_id ?? "");
        setEpicsQueryId((data as { epics_query_id?: string | null }).epics_query_id ?? "");
        setEpicsProject((data as { epics_project?: string | null }).epics_project ?? "");
        setEpicsTeam((data as { epics_team?: string | null }).epics_team ?? "");
        const rawEpicAreas = (data as { epics_area_paths?: string[] | null }).epics_area_paths;
        const rawEpicIters = (data as { epics_iteration_paths?: string[] | null }).epics_iteration_paths;
        if (Array.isArray(rawEpicAreas)) setEpicsAreaPaths(rawEpicAreas);
        if (Array.isArray(rawEpicIters)) setEpicsIterationPaths(rawEpicIters);
        const rawEpicTags = (data as { epics_tags?: string[] | null }).epics_tags;
        if (Array.isArray(rawEpicTags)) setEpicsTags(rawEpicTags);

        setLastSynced(data.last_synced_at);
        setHasExisting(true);
        setConnectionStatus("success");

        const rawDiag = (data as { last_diagnostic?: unknown }).last_diagnostic;
        if (rawDiag && typeof rawDiag === "object") {
          setDiagnostics(rawDiag as TfsDiagnosticResult);
        }
        const diagAt = (data as { last_diagnostic_at?: string | null }).last_diagnostic_at;
        if (diagAt) setDiagnosticsAt(diagAt);
      } else {
        // Restore unsaved draft (no PAT yet → not in DB).
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          if (raw) {
            const draft = JSON.parse(raw) as Partial<{
              serverUrl: string;
              collection: string;
              organization: string;
              project: string;
              team: string;
            }>;
            if (draft.serverUrl) setServerUrl(draft.serverUrl);
            if (draft.collection) setCollection(draft.collection);
            if (draft.organization) setOrganization(draft.organization);
            if (draft.project) setProject(draft.project);
            if (draft.team) setTeam(draft.team);
          }
        } catch {
          // Ignore corrupt draft.
        }
      }

      hasLoadedRef.current = true;
    };
    loadSettings();
  }, []);

  // Debounced auto-save: persists config changes ~800 ms after the user stops typing.
  useEffect(() => {
    if (!hasLoadedRef.current) return;

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(async () => {
      // Always keep a local draft so the form survives reloads even before connecting.
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            serverUrl: serverUrl.trim(),
            collection: collection.trim(),
            organization: organization.trim(),
            project: project.trim(),
            team: team.trim(),
          }),
        );
      } catch {
        // Ignore quota errors.
      }

      // Only sync to the backend when a row already exists (PAT was provided).
      if (!hasExisting) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("azure_devops_settings")
        .update({
          server_url: serverUrl.trim(),
          collection: collection.trim(),
          organization: organization.trim() || null,
          project: project.trim(),
          team: team.trim() || null,
          auto_sync_enabled: autoSync,
          sync_interval_minutes: Number(syncInterval),
          area_paths: areaPaths,
          iteration_paths: iterationPaths,
          bugs_query_id: bugsQueryId.trim() || null,
          epics_query_id: epicsQueryId.trim() || null,
          epics_project: epicsProject.trim() || null,
          epics_team: epicsTeam.trim() || null,
          epics_area_paths: epicsAreaPaths,
          epics_iteration_paths: epicsIterationPaths,
          epics_tags: epicsTags,
        })
        .eq("user_id", user.id);

      if (!error) setAutoSavedAt(new Date().toISOString());
    }, 800);


    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [serverUrl, collection, organization, project, team, autoSync, syncInterval, areaPaths, iterationPaths, bugsQueryId, epicsQueryId, epicsProject, epicsTeam, epicsAreaPaths, epicsIterationPaths, epicsTags, hasExisting]);

  const resetStatus = () => {
    setConnectionStatus("idle");
    setTfsProject(null);
    setTfsError(null);
    // Note: diagnostics are intentionally NOT cleared here — they persist until
    // the user runs a new diagnostic, so editing a field doesn't wipe results.
  };

  // Real-time validation of connection fields. Recomputed on every keystroke.
  const fieldValidation = useMemo(
    () => validateConnectionFields({ serverUrl, collection, project, team, bugsQueryId, epicsQueryId }),
    [serverUrl, collection, project, team, bugsQueryId, epicsQueryId],
  );


  const inputStateClass = (status: "empty" | "valid" | "invalid") =>
    cn(
      "mt-1",
      status === "invalid" && "border-destructive focus-visible:ring-destructive",
      status === "valid" && "border-emerald-500/60 focus-visible:ring-emerald-500/40",
    );

  const handleAdvancedCheck = async () => {
    if (!serverUrl.trim() || !collection.trim() || !project.trim() || !pat.trim()) {
      toast.error(t.adoFillAllFields);
      return;
    }
    if (!fieldValidation.allRequiredValid) {
      toast.error("Corrige los campos marcados antes de ejecutar el diagnóstico.");
      return;
    }
    setDiagnosing(true);
    setDiagnostics(null);
    try {
      const result = await runPatDiagnostics({
        serverUrl: serverUrl.trim(),
        collection: collection.trim(),
        project: project.trim(),
        team: team.trim() || undefined,
        pat: pat.trim(),
      });
      setDiagnostics(result);
      const now = new Date().toISOString();
      setDiagnosticsAt(now);

      // Persist the diagnostic so it survives reloads and other devices.
      if (hasExisting) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("azure_devops_settings")
            .update({
              last_diagnostic: result as unknown as never,
              last_diagnostic_at: now,
            })
            .eq("user_id", user.id);
        }
      }

      if (result.allPassed) {
        toast.success("✅ Todos los permisos del PAT verificados");
      } else if (result.missingScopes.length > 0) {
        toast.error(`Faltan scopes: ${result.missingScopes.join(", ")}`);
      } else {
        toast.error("Algunas comprobaciones fallaron — revisa el panel");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error en diagnóstico");
    } finally {
      setDiagnosing(false);
    }
  };

  const handleTestConnection = async () => {
    if (!serverUrl.trim() || !collection.trim() || !project.trim() || !pat.trim()) {
      toast.error(t.adoFillAllFields);
      return;
    }
    if (!fieldValidation.allRequiredValid) {
      toast.error("Corrige los campos marcados antes de probar la conexión.");
      return;
    }

    setTesting(true);
    resetStatus();

    try {
      const result = await testTfsConnection({
        serverUrl: serverUrl.trim(),
        collection: collection.trim(),
        project: project.trim(),
        team: team.trim() || undefined,
        pat: pat.trim(),
      });

      if (result.success && result.project) {
        setConnectionStatus("success");
        setTfsProject(result.project);
        toast.success(`✅ ${t.adoConnectionOk}`);
      } else {
        setConnectionStatus("error");
        setTfsError(
          result.error ?? {
            kind: "unknown",
            url: "",
            message: "Error desconocido",
          },
        );
      }
    } catch (err: unknown) {
      setConnectionStatus("error");
      setTfsError({
        kind: "unknown",
        url: "",
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const guard = evaluateSaveGuard({
      connectionStatus,
      bugsQueryId: fieldValidation.bugsQueryId,
      epicsQueryId: fieldValidation.epicsQueryId,
    });
    if (!guard.canSave) {
      if (guard.reason === "not-tested") {
        toast.error(t.adoTestFirst);
      } else if (guard.reason === "invalid-bugs-query") {
        toast.error("Corrige el campo 'Query de Bugs' antes de guardar.");
      } else if (guard.reason === "invalid-epics-query") {
        toast.error("Corrige el campo 'Query de Epics' antes de guardar.");
      }
      return;
    }


    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error(t.adoLoginRequired);
        return;
      }

      // Encrypt the PAT server-side before persisting. The plaintext never
      // touches the database, so a DB compromise alone cannot leak ADO tokens.
      const { ciphertext, iv } = await encryptPat(pat.trim());

      const payload = {
        user_id: user.id,
        server_url: serverUrl.trim(),
        collection: collection.trim(),
        organization: organization.trim() || null,
        project: project.trim(),
        team: team.trim() || null,
        pat_encrypted: ciphertext,
        pat_iv: iv,
        auto_sync_enabled: autoSync,
        sync_interval_minutes: Number(syncInterval),
        area_paths: areaPaths,
        iteration_paths: iterationPaths,
        bugs_query_id: bugsQueryId.trim() || null,
        epics_query_id: epicsQueryId.trim() || null,
        epics_project: epicsProject.trim() || null,
        epics_team: epicsTeam.trim() || null,
        epics_area_paths: epicsAreaPaths,
        epics_iteration_paths: epicsIterationPaths,
        epics_tags: epicsTags,
      };


      if (hasExisting) {
        const { error } = await supabase
          .from("azure_devops_settings")
          .update(payload)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("azure_devops_settings").insert(payload);
        if (error) throw error;
        setHasExisting(true);
      }

      // Settings changed → invalidate cached team area paths so the next
      // dashboard load picks up the new team/project mapping.
      clearTfsAreaPathCache();

      // Saved → drop the local draft, the DB is the source of truth now.
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Ignore.
      }
      setAutoSavedAt(new Date().toISOString());

      toast.success(`💾 ${t.adoSettingsSaved}`);
    } catch (err: unknown) {
      const mapped = mapBugsQueryIdError(err);
      if (mapped) {
        toast.error(mapped);
      } else {
        const msg = err instanceof Error ? err.message : "Error saving";
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("azure_devops_settings")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    clearTfsAreaPathCache();

    setServerUrl("");
    setCollection("");
    setOrganization("");
    setProject("");
    setTeam("");
    setPat("");
    setAutoSync(false);
    setSyncInterval("30");
    setAreaPaths([]);
    setIterationPaths([]);
    setBugsQueryId("");
    
    
    setConnectionStatus("idle");
    setTfsProject(null);
    setTfsError(null);
    setDiagnostics(null);
    setDiagnosticsAt(null);
    setHasExisting(false);
    setLastSynced(null);
    setAutoSavedAt(null);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Ignore.
    }
    toast.success(`🗑️ ${t.adoSettingsDeleted}`);
  };

  return (
    <div className="space-y-6 w-full max-w-2xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-7 w-7" />
          {t.adoTitle}
        </h1>
        <p className="text-muted-foreground mt-1">{t.adoDesc}</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2"
      >
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {t.adoNetworkWarningTitle}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{t.adoNetworkWarningBody}</p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <Plug className="h-5 w-5" />
              {t.adoConnection}
            </CardTitle>
            <CardDescription>{t.adoConnectionDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="ado-server">{t.adoServerUrl}</Label>
              <Input
                id="ado-server"
                placeholder="https://tfs.empresa.net/tfs"
                value={serverUrl}
                onChange={(e) => {
                  setServerUrl(e.target.value);
                  resetStatus();
                }}
                aria-invalid={fieldValidation.serverUrl.status === "invalid"}
                className={inputStateClass(fieldValidation.serverUrl.status)}
              />
              <TfsFieldHint
                validation={fieldValidation.serverUrl}
                defaultHint={t.adoServerUrlHint}
              />
            </div>

            <div>
              <Label htmlFor="ado-collection">{t.adoCollection}</Label>
              <TfsAutocompleteInput
                id="ado-collection"
                value={collection}
                onChange={(v) => {
                  setCollection(v);
                  resetStatus();
                }}
                placeholder="RNDCollection"
                ariaInvalid={fieldValidation.collection.status === "invalid"}
                inputClassName={inputStateClass(fieldValidation.collection.status)}
                enabled={
                  validateServerUrl(serverUrl).status === "valid" && pat.trim().length > 0
                }
                disabledReason="Introduce primero la URL del servidor y el PAT."
                loadSuggestions={async () => {
                  const result = await listTfsCollections(serverUrl, pat);
                  return {
                    items: result.items.map((c) => ({ id: c.id || c.name, name: c.name })),
                    errorMessage: result.error?.message,
                  };
                }}
              />
              <TfsFieldHint
                validation={fieldValidation.collection}
                defaultHint={t.adoCollectionHint}
              />
            </div>

            <div>
              <Label htmlFor="ado-project">{t.adoProject}</Label>
              <TfsAutocompleteInput
                id="ado-project"
                value={project}
                onChange={(v) => {
                  setProject(v);
                  resetStatus();
                }}
                placeholder="SDES"
                ariaInvalid={fieldValidation.project.status === "invalid"}
                inputClassName={inputStateClass(fieldValidation.project.status)}
                enabled={
                  validateServerUrl(serverUrl).status === "valid" &&
                  collection.trim().length > 0 &&
                  pat.trim().length > 0
                }
                disabledReason="Introduce servidor, colección y PAT para listar proyectos."
                loadSuggestions={async () => {
                  const result = await listTfsProjects(serverUrl, collection, pat);
                  return {
                    items: result.items.map((p) => ({
                      id: p.id || p.name,
                      name: p.name,
                      description: p.description,
                    })),
                    errorMessage: result.error?.message,
                  };
                }}
              />
              <TfsFieldHint validation={fieldValidation.project} />
            </div>

            <div>
              <Label htmlFor="ado-team">{t.adoTeam}</Label>
              <TfsAutocompleteInput
                id="ado-team"
                value={team}
                onChange={(v) => {
                  setTeam(v);
                  resetStatus();
                }}
                placeholder="Rodat"
                ariaInvalid={fieldValidation.team.status === "invalid"}
                inputClassName={inputStateClass(fieldValidation.team.status)}
                enabled={
                  validateServerUrl(serverUrl).status === "valid" &&
                  collection.trim().length > 0 &&
                  project.trim().length > 0 &&
                  pat.trim().length > 0
                }
                disabledReason="Introduce servidor, colección, proyecto y PAT para listar equipos."
                loadSuggestions={async () => {
                  const result = await listTfsTeams(serverUrl, collection, project, pat);
                  return {
                    items: result.items.map((t) => ({
                      id: t.id || t.name,
                      name: t.name,
                      description: t.description,
                    })),
                    errorMessage: result.error?.message,
                  };
                }}
              />
              <TfsFieldHint
                validation={fieldValidation.team}
                defaultHint={t.adoTeamHint}
                hideValid
              />
            </div>

            <Separator />

            <div>
              <Label htmlFor="ado-org">{t.adoOrganization}</Label>
              <Input
                id="ado-org"
                placeholder="my-organization"
                value={organization}
                onChange={(e) => {
                  setOrganization(e.target.value);
                  resetStatus();
                }}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">{t.adoOrgHint}</p>
            </div>

            <Separator />

            <div>
              <Label htmlFor="ado-pat">{t.adoPat}</Label>
              <div className="flex gap-2 mt-1">
                <div className="relative flex-1">
                  <Input
                    id="ado-pat"
                    type={showPat ? "text" : "password"}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={pat}
                    onChange={(e) => {
                      setPat(e.target.value);
                      resetStatus();
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full w-9"
                    onClick={() => setShowPat(!showPat)}
                  >
                    {showPat ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t.adoPatHint}</p>
            </div>

            <Button
              onClick={handleTestConnection}
              disabled={
                testing ||
                !pat ||
                !fieldValidation.allRequiredValid
              }
              variant="outline"
              className="w-full"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plug className="h-4 w-4 mr-2" />
              )}
              {t.adoTestConnection}
            </Button>

            <Button
              onClick={handleAdvancedCheck}
              disabled={
                diagnosing ||
                !pat ||
                !fieldValidation.allRequiredValid
              }
              variant="outline"
              className="w-full"
            >
              {diagnosing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-2" />
              )}
              Comprobación avanzada del PAT
            </Button>

            {!fieldValidation.allRequiredValid &&
              (serverUrl.trim() || collection.trim() || project.trim() || team.trim()) && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Corrige los campos marcados antes de probar la conexión.
                </p>
              )}

            {connectionStatus === "success" && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    {t.adoConnectionOk}
                  </p>
                  {tfsProject && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {tfsProject.name} — {tfsProject.state}
                      {tfsProject.description && ` — ${tfsProject.description.slice(0, 80)}`}
                    </p>
                  )}
                </div>
              </div>
            )}

            {connectionStatus === "error" && tfsError && <TfsErrorPanel error={tfsError} />}

            {diagnostics && (
              <div className="space-y-2">
                {diagnosticsAt && (
                  <p className="text-xs text-muted-foreground">
                    Último diagnóstico: {new Date(diagnosticsAt).toLocaleString()}
                  </p>
                )}
                <TfsPatDiagnosticsPanel result={diagnostics} />
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Alcance del equipo RODAT
            </CardTitle>
            <CardDescription>
              Selecciona las áreas e iteraciones de Azure DevOps que se usarán al cargar
              Features y Tareas. Si no eliges nada, se usan los valores por defecto
              (<span className="font-mono">SDES\Rodat</span> y{" "}
              <span className="font-mono">SDES\Rodat\4.4</span>).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label htmlFor="ado-areas">Áreas (Features y Tareas)</Label>
              <div className="mt-1">
                <TfsMultiSelect
                  id="ado-areas"
                  value={areaPaths}
                  onChange={setAreaPaths}
                  placeholder="Selecciona una o varias áreas…"
                  emptyHint="No se encontraron áreas para este proyecto."
                  disabled={
                    validateServerUrl(serverUrl).status !== "valid" ||
                    !collection.trim() ||
                    !project.trim() ||
                    !pat.trim()
                  }
                  disabledReason="Configura servidor, colección, proyecto y PAT para cargar las áreas."
                  loadOptions={async () => {
                    const res = await listTfsClassificationNodes(
                      serverUrl,
                      collection,
                      project,
                      pat,
                      "areas",
                    );
                    return {
                      items: res.items.map((n) => ({
                        path: n.path,
                        name: n.name,
                        depth: n.depth,
                      })),
                      errorMessage: res.error?.message,
                    };
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Las features y tareas se filtrarán a estas áreas (incluye descendientes).
              </p>
            </div>

            <Separator />

            <div>
              <Label htmlFor="ado-iterations">Iteraciones (solo Tareas)</Label>
              <div className="mt-1">
                <TfsMultiSelect
                  id="ado-iterations"
                  value={iterationPaths}
                  onChange={setIterationPaths}
                  placeholder="Selecciona una o varias iteraciones…"
                  emptyHint="No se encontraron iteraciones para este proyecto."
                  disabled={
                    validateServerUrl(serverUrl).status !== "valid" ||
                    !collection.trim() ||
                    !project.trim() ||
                    !pat.trim()
                  }
                  disabledReason="Configura servidor, colección, proyecto y PAT para cargar las iteraciones."
                  loadOptions={async () => {
                    const res = await listTfsClassificationNodes(
                      serverUrl,
                      collection,
                      project,
                      pat,
                      "iterations",
                    );
                    return {
                      items: res.items.map((n) => ({
                        path: n.path,
                        name: n.name,
                        depth: n.depth,
                      })),
                      errorMessage: res.error?.message,
                    };
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Las tareas se filtrarán a estas iteraciones (incluye descendientes).
              </p>
              {iterationPaths.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {iterationPaths.map((path) => (
                    <span
                      key={path}
                      className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                    >
                      {path}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <div>
              <Label htmlFor="ado-bugs-query">Query de Bugs (ID o ruta)</Label>
              <Input
                id="ado-bugs-query"
                placeholder="p. ej. 12345678-1234-1234-1234-123456789012 o Shared Queries/Equipo/Bugs"
                value={bugsQueryId}
                onChange={(e) => setBugsQueryId(e.target.value)}
                aria-invalid={fieldValidation.bugsQueryId.status === "invalid"}
                className={cn("mt-1", inputStateClass(fieldValidation.bugsQueryId.status))}
              />
              <TfsFieldHint
                validation={fieldValidation.bugsQueryId}
                defaultHint="ID (GUID) o ruta de una query existente en Azure DevOps que devuelve los bugs a mostrar en la página Bugs."
                hideValid
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">{t.adoEpicsSectionTitle}</h3>
                <p className="text-xs text-muted-foreground">{t.adoEpicsSectionDesc}</p>
              </div>
              <div>
                <Label htmlFor="ado-epics-project">{t.adoEpicsProjectLabel}</Label>
                <Select
                  value={epicsProject.trim() === "" ? "__main__" : epicsProject}
                  onValueChange={(v) => setEpicsProject(v === "__main__" ? "" : v)}
                >
                  <SelectTrigger id="ado-epics-project" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__main__">{t.adoEpicsProjectSameAsMain}</SelectItem>
                    <SelectItem value="Software">Software</SelectItem>
                    <SelectItem value="SDES">RODAT (SDES)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1.5">{t.adoEpicsProjectHint}</p>
              </div>
              <div>
                <Label htmlFor="ado-epics-query">{t.adoEpicsQueryIdLabel}</Label>
                <Input
                  id="ado-epics-query"
                  placeholder={t.adoEpicsQueryIdPlaceholder}
                  value={epicsQueryId}
                  onChange={(e) => setEpicsQueryId(e.target.value)}
                  aria-invalid={fieldValidation.epicsQueryId.status === "invalid"}
                  className={cn("mt-1", inputStateClass(fieldValidation.epicsQueryId.status))}
                />
                <TfsFieldHint
                  validation={fieldValidation.epicsQueryId}
                  defaultHint={t.adoEpicsQueryIdHint}
                  hideValid
                />
              </div>
              <div>
                <Label htmlFor="ado-epics-tags">{t.adoEpicsTagsLabel}</Label>
                <Input
                  id="ado-epics-tags"
                  placeholder={t.adoEpicsTagsPlaceholder}
                  value={epicsTagInput}
                  onChange={(e) => setEpicsTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      const value = epicsTagInput.trim().replace(/,+$/, "");
                      if (value && !epicsTags.includes(value)) {
                        setEpicsTags([...epicsTags, value]);
                      }
                      setEpicsTagInput("");
                    } else if (e.key === "Backspace" && epicsTagInput === "" && epicsTags.length > 0) {
                      setEpicsTags(epicsTags.slice(0, -1));
                    }
                  }}
                  onBlur={() => {
                    const value = epicsTagInput.trim();
                    if (value && !epicsTags.includes(value)) {
                      setEpicsTags([...epicsTags, value]);
                    }
                    setEpicsTagInput("");
                  }}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1.5">{t.adoEpicsTagsHint}</p>
                {epicsTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {epicsTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => setEpicsTags(epicsTags.filter((t) => t !== tag))}
                          className="hover:text-destructive"
                          aria-label={`Remove ${tag}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display">{t.adoEpicsScopeTitle}</CardTitle>
            <CardDescription>{t.adoEpicsScopeDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label htmlFor="ado-epics-team">{t.adoEpicsTeamLabel}</Label>
              <Input
                id="ado-epics-team"
                placeholder={t.adoEpicsTeamPlaceholder}
                value={epicsTeam}
                onChange={(e) => setEpicsTeam(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1.5">{t.adoEpicsTeamHint}</p>
            </div>

            <Separator />

            <div>
              <Label htmlFor="ado-epics-areas">{t.adoEpicsAreaPathsLabel}</Label>
              <div className="mt-1">
                <TfsMultiSelect
                  id="ado-epics-areas"
                  value={epicsAreaPaths}
                  onChange={setEpicsAreaPaths}
                  placeholder="Selecciona una o varias áreas…"
                  emptyHint="No se encontraron áreas para este proyecto."
                  disabled={
                    validateServerUrl(serverUrl).status !== "valid" ||
                    !collection.trim() ||
                    !(epicsProject.trim() || project).trim() ||
                    !pat.trim()
                  }
                  disabledReason="Configura servidor, colección, proyecto y PAT para cargar las áreas."
                  loadOptions={async () => {
                    const res = await listTfsClassificationNodes(
                      serverUrl,
                      collection,
                      epicsProject.trim() || project,
                      pat,
                      "areas",
                    );
                    return {
                      items: res.items.map((n) => ({ path: n.path, name: n.name, depth: n.depth })),
                      errorMessage: res.error?.message,
                    };
                  }}
                />
              </div>
            </div>

            <Separator />

            <div>
              <Label htmlFor="ado-epics-iterations">{t.adoEpicsIterationPathsLabel}</Label>
              <div className="mt-1">
                <TfsMultiSelect
                  id="ado-epics-iterations"
                  value={epicsIterationPaths}
                  onChange={setEpicsIterationPaths}
                  placeholder="Selecciona una o varias iteraciones…"
                  emptyHint="No se encontraron iteraciones para este proyecto."
                  disabled={
                    validateServerUrl(serverUrl).status !== "valid" ||
                    !collection.trim() ||
                    !(epicsProject.trim() || project).trim() ||
                    !pat.trim()
                  }
                  disabledReason="Configura servidor, colección, proyecto y PAT para cargar las iteraciones."
                  loadOptions={async () => {
                    const res = await listTfsClassificationNodes(
                      serverUrl,
                      collection,
                      epicsProject.trim() || project,
                      pat,
                      "iterations",
                    );
                    return {
                      items: res.items.map((n) => ({ path: n.path, name: n.name, depth: n.depth })),
                      errorMessage: res.error?.message,
                    };
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{t.adoEpicsScopeHint}</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>





      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              {t.adoSyncSettings}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t.adoAutoSync}</p>
                <p className="text-xs text-muted-foreground">{t.adoAutoSyncDesc}</p>
              </div>
              <Switch checked={autoSync} onCheckedChange={setAutoSync} />
            </div>

            {autoSync && (
              <div>
                <Label>{t.adoSyncInterval}</Label>
                <Select value={syncInterval} onValueChange={setSyncInterval}>
                  <SelectTrigger className="mt-1 w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 {t.adoMinutes}</SelectItem>
                    <SelectItem value="30">30 {t.adoMinutes}</SelectItem>
                    <SelectItem value="60">1 {t.adoHour}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {lastSynced && (
              <p className="text-xs text-muted-foreground">
                {t.adoLastSync}: {new Date(lastSynced).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        className="space-y-2"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={
              saving ||
              connectionStatus !== "success" ||
              !fieldValidation.allRequiredValid
            }
            className="flex-1"
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {hasExisting ? t.adoUpdateSettings : t.adoSaveSettings}
          </Button>
          {hasExisting && (
            <Button variant="destructive" onClick={handleDelete}>
              {t.adoDisconnect}
            </Button>
          )}
        </div>
        {autoSavedAt && hasExisting && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            Cambios guardados automáticamente · {new Date(autoSavedAt).toLocaleTimeString()}
          </p>
        )}
      </motion.div>
    </div>
  );
};

export default AzureDevOpsSettingsPage;
