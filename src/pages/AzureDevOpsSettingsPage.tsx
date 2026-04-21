import { useState, useEffect } from "react";
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
} from "lucide-react";
import { useLang } from "@/context/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { testTfsConnection, type TfsProjectInfo, type TfsError } from "@/services/tfs";
import { TfsErrorPanel } from "@/components/TfsErrorPanel";

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
  const [hasExisting, setHasExisting] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

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
      }
    };
    loadSettings();
  }, []);

  const resetStatus = () => {
    setConnectionStatus("idle");
    setTfsProject(null);
    setTfsError(null);
  };

  const handleTestConnection = async () => {
    if (!serverUrl.trim() || !collection.trim() || !project.trim() || !pat.trim()) {
      toast.error(t.adoFillAllFields);
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
    setHasExisting(false);
    setLastSynced(null);
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
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">{t.adoServerUrlHint}</p>
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
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">{t.adoCollectionHint}</p>
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
                className="mt-1"
              />
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
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">{t.adoTeamHint}</p>
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
              disabled={testing || !serverUrl || !collection || !project || !pat}
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
        className="flex gap-2"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Button
          onClick={handleSave}
          disabled={saving || connectionStatus !== "success"}
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
      </motion.div>
    </div>
  );
};

export default AzureDevOpsSettingsPage;
