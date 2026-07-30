import { CheckCircle2, XCircle, AlertCircle, MinusCircle, Radio } from "lucide-react";
import { useLang } from "@/context/LanguageContext";
import type { ProxyCheck, ProxyCheckId, ProxyCheckStatus, ProxyDiagnosticsResult } from "@/services/proxyDiagnostics";

interface ProxyDiagnosticsPanelProps {
  result: ProxyDiagnosticsResult;
}

const statusStyles: Record<ProxyCheckStatus, { Icon: typeof CheckCircle2; color: string; badge: string }> = {
  ok: { Icon: CheckCircle2, color: "text-emerald-500", badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  warning: { Icon: AlertCircle, color: "text-amber-500", badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  error: { Icon: XCircle, color: "text-destructive", badge: "bg-destructive/10 text-destructive" },
  skipped: { Icon: MinusCircle, color: "text-muted-foreground", badge: "bg-muted text-muted-foreground" },
};

const CheckRow = ({ check, label, detailLabel }: { check: ProxyCheck; label: string; detailLabel: string }) => {
  const { Icon, color, badge } = statusStyles[check.status];

  return (
    <div className="rounded-md border bg-card/50 p-3 space-y-1.5">
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium">{label}</p>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${badge}`}>
              {check.status.toUpperCase()}
            </span>
            {typeof check.durationMs === "number" && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {check.durationMs} ms
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{check.message}</p>
        </div>
      </div>

      {check.detail && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{detailLabel}</summary>
          <pre className="mt-1 bg-muted/60 border rounded px-2 py-1 font-mono whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
            {check.detail}
          </pre>
        </details>
      )}
    </div>
  );
};

export const ProxyDiagnosticsPanel = ({ result }: ProxyDiagnosticsPanelProps) => {
  const { t } = useLang();

  const labels: Record<ProxyCheckId, string> = {
    public_config: t.proxyDiagCheckPublicConfig,
    shared_connection: t.proxyDiagCheckSharedConnection,
    proxy_reachable: t.proxyDiagCheckProxyReachable,
    collection_visible: t.proxyDiagCheckCollection,
    project_visible: t.proxyDiagCheckProject,
    write_blocked: t.proxyDiagCheckWriteBlocked,
  };

  const okCount = result.checks.filter((c) => c.status === "ok").length;
  const totalActive = result.checks.filter((c) => c.status !== "skipped").length;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Radio className={`h-5 w-5 shrink-0 mt-0.5 ${result.allPassed ? "text-emerald-500" : "text-amber-500"}`} />
        <div className="flex-1">
          <p className="text-sm font-medium">
            {t.proxyDiagSummary} — {okCount}/{totalActive}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {result.allPassed ? t.proxyDiagAllOk : t.proxyDiagIssues}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {result.checks.map((check) => (
          <CheckRow
            key={check.id}
            check={check}
            label={labels[check.id]}
            detailLabel={t.proxyDiagDetailLabel}
          />
        ))}
      </div>
    </div>
  );
};
