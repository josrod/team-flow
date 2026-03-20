import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Settings, Plug, CheckCircle2, XCircle, Loader2, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useLang } from "@/context/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface AzureProject {
  name: string;
  id: string;
  state: string;
  description: string;
}

export default function AzureDevOpsSettingsPage() {
  const { t } = useLang();

  const [organization, setOrganization] = useState("");
  const [project, setProject] = useState("");
  const [pat, setPat] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [syncInterval, setSyncInterval] = useState("30");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");
  const [azureProject, setAzureProject] = useState<AzureProject | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasExisting, setHasExisting] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [patMasked, setPatMasked] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase.functions.invoke("azure-devops-settings", {
      method: "GET",
    });

    if (error || !data?.data) return;

    const settings = data.data;
    setOrganization(settings.organization);
    setProject(settings.project);
    setPat(""); // Never show real PAT; user must re-enter to update
    setAutoSync(settings.auto_sync_enabled);
    setSyncInterval(String(settings.sync_interval_minutes));
    setLastSynced(settings.last_synced_at);
    setHasExisting(true);
    setConnectionStatus("success");
    setPatMasked(settings.pat_masked ?? "");
  };

  const handleTestConnection = async () => {
    if (!organization.trim() || !project.trim() || !pat.trim()) {
      toast.error(t.adoFillAllFields);
      return;
    }

    setTesting(true);
    setConnectionStatus("idle");
    setAzureProject(null);
    setErrorMessage("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error(t.adoLoginRequired);
        setTesting(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("azure-devops-test", {
        body: { organization: organization.trim(), project: project.trim(), pat: pat.trim() },
      });

      if (error) {
        setConnectionStatus("error");
        setErrorMessage(error.message);
        return;
      }

      if (data.success) {
        setConnectionStatus("success");
        setAzureProject(data.project);
        toast.success(`✅ ${t.adoConnectionOk}`);
      } else {
        setConnectionStatus("error");
        setErrorMessage(data.error ?? "Unknown error");
      }
    } catch (err: unknown) {
      setConnectionStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Network error");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (connectionStatus !== "success") {
      toast.error(t.adoTestFirst);
      return;
    }
    if (!pat.trim()) {
      toast.error(t.adoFillAllFields);
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("azure-devops-settings", {
        method: "POST",
        body: {
          organization: organization.trim(),
          project: project.trim(),
          pat: pat.trim(),
          auto_sync_enabled: autoSync,
          sync_interval_minutes: Number(syncInterval),
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error ?? "Save failed");

      setHasExisting(true);
      setPat("");
      setPatMasked(organization.slice(0, 4) + "****");
      toast.success(`💾 ${t.adoSettingsSaved}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const { data, error } = await supabase.functions.invoke("azure-devops-settings", {
      method: "DELETE",
    });

    if (error || !data?.success) {
      toast.error(error?.message ?? "Delete failed");
      return;
    }

    setOrganization("");
    setProject("");
    setPat("");
    setPatMasked("");
    setAutoSync(false);
    setSyncInterval("30");
    setConnectionStatus("idle");
    setAzureProject(null);
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
              <Label htmlFor="ado-org">{t.adoOrganization}</Label>
              <Input
                id="ado-org"
                placeholder="my-organization"
                value={organization}
                onChange={(e) => { setOrganization(e.target.value); setConnectionStatus("idle"); }}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">{t.adoOrgHint}</p>
            </div>

            <div>
              <Label htmlFor="ado-project">{t.adoProject}</Label>
              <Input
                id="ado-project"
                placeholder="MyProject"
                value={project}
                onChange={(e) => { setProject(e.target.value); setConnectionStatus("idle"); }}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="ado-pat">{t.adoPat}</Label>
              <div className="flex gap-2 mt-1">
                <div className="relative flex-1">
                  <Input
                    id="ado-pat"
                    type={showPat ? "text" : "password"}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={pat}
                    onChange={(e) => { setPat(e.target.value); setConnectionStatus("idle"); }}
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
              <p className="text-xs text-muted-foreground mt-1">
                {hasExisting && patMasked ? `Current: ${patMasked} — ` : ""}
                {t.adoPatHint}
              </p>
            </div>

            <Button
              onClick={handleTestConnection}
              disabled={testing || !organization || !project || !pat}
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
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{t.adoConnectionOk}</p>
                  {azureProject && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {azureProject.name} — {azureProject.state}
                      {azureProject.description && ` — ${azureProject.description.slice(0, 80)}`}
                    </p>
                  )}
                </div>
              </div>
            )}

            {connectionStatus === "error" && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
                <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">{t.adoConnectionFailed}</p>
                  <p className="text-xs text-muted-foreground mt-1">{errorMessage}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
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
}
