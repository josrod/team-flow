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
  type TfsProjectInfo,
  type TfsError,
  type TfsDiagnosticResult,
} from "@/services/tfs";
import { TfsErrorPanel } from "@/components/TfsErrorPanel";
import { TfsPatDiagnosticsPanel } from "@/components/TfsPatDiagnosticsPanel";
import { TfsFieldHint } from "@/components/TfsFieldHint";
import { validateConnectionFields } from "@/lib/tfsValidation";
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
        setPat(data.pat_encrypted);
        setAutoSync(data.auto_sync_enabled);
        setSyncInterval(String(data.sync_interval_minutes));
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
        })
        .eq("user_id", user.id);

      if (!error) setAutoSavedAt(new Date().toISOString());
    }, 800);

    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [serverUrl, collection, organization, project, team, autoSync, syncInterval, hasExisting]);

  const resetStatus = () => {
    setConnectionStatus("idle");
    setTfsProject(null);
    setTfsError(null);
    // Note: diagnostics are intentionally NOT cleared here — they persist until
    // the user runs a new diagnostic, so editing a field doesn't wipe results.
  };

  // Real-time validation of connection fields. Recomputed on every keystroke.
  const fieldValidation = useMemo(
    () => validateConnectionFields({ serverUrl, collection, project, team }),
    [serverUrl, collection, project, team],
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
    if (connectionStatus !== "success") {
      toast.error(t.adoTestFirst);
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

      const payload = {
        user_id: user.id,
        server_url: serverUrl.trim(),
        collection: collection.trim(),
        organization: organization.trim() || null,
        project: project.trim(),
        team: team.trim() || null,
        pat_encrypted: pat.trim(),
        auto_sync_enabled: autoSync,
        sync_interval_minutes: Number(syncInterval),
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

      // Saved → drop the local draft, the DB is the source of truth now.
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Ignore.
      }
      setAutoSavedAt(new Date().toISOString());

      toast.success(`💾 ${t.adoSettingsSaved}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving";
      toast.error(msg);
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

    setServerUrl("");
    setCollection("");
    setOrganization("");
    setProject("");
    setTeam("");
    setPat("");
    setAutoSync(false);
    setSyncInterval("30");
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
              <Input
                id="ado-collection"
                placeholder="RNDCollection"
                value={collection}
                onChange={(e) => {
                  setCollection(e.target.value);
                  resetStatus();
                }}
                aria-invalid={fieldValidation.collection.status === "invalid"}
                className={inputStateClass(fieldValidation.collection.status)}
              />
              <TfsFieldHint
                validation={fieldValidation.collection}
                defaultHint={t.adoCollectionHint}
              />
            </div>

            <div>
              <Label htmlFor="ado-project">{t.adoProject}</Label>
              <Input
                id="ado-project"
                placeholder="SDES"
                value={project}
                onChange={(e) => {
                  setProject(e.target.value);
                  resetStatus();
                }}
                aria-invalid={fieldValidation.project.status === "invalid"}
                className={inputStateClass(fieldValidation.project.status)}
              />
              <TfsFieldHint validation={fieldValidation.project} />
            </div>

            <div>
              <Label htmlFor="ado-team">{t.adoTeam}</Label>
              <Input
                id="ado-team"
                placeholder="Rodat"
                value={team}
                onChange={(e) => {
                  setTeam(e.target.value);
                  resetStatus();
                }}
                aria-invalid={fieldValidation.team.status === "invalid"}
                className={inputStateClass(fieldValidation.team.status)}
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
