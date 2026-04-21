import { CheckCircle2, XCircle, AlertCircle, MinusCircle, ShieldCheck, KeyRound } from "lucide-react";
import type { TfsDiagnosticResult, TfsScopeCheck, TfsScopeStatus } from "@/services/tfs";

interface TfsPatDiagnosticsPanelProps {
  result: TfsDiagnosticResult;
}

const statusStyles: Record<
  TfsScopeStatus,
  { Icon: typeof CheckCircle2; color: string; label: string }
> = {
  ok: { Icon: CheckCircle2, color: "text-emerald-500", label: "OK" },
  unauthorized: { Icon: KeyRound, color: "text-destructive", label: "401" },
  forbidden: { Icon: XCircle, color: "text-destructive", label: "403" },
  not_found: { Icon: AlertCircle, color: "text-amber-500", label: "404" },
  network: { Icon: AlertCircle, color: "text-amber-500", label: "Red" },
  skipped: { Icon: MinusCircle, color: "text-muted-foreground", label: "—" },
};

const ScopeRow = ({ check }: { check: TfsScopeCheck }) => {
  const { Icon, color, label } = statusStyles[check.status];

  return (
    <div className="rounded-md border bg-card/50 p-3 space-y-1.5">
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium">{check.label}</p>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {check.requiredScope}
            </span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                check.status === "ok"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : check.status === "skipped"
                    ? "bg-muted text-muted-foreground"
                    : "bg-destructive/10 text-destructive"
              }`}
            >
              {check.httpStatus ? `HTTP ${check.httpStatus}` : label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{check.message}</p>
        </div>
      </div>

      {check.url && (
        <code className="block text-[10px] font-mono bg-muted/60 border rounded px-2 py-1 break-all text-muted-foreground">
          {check.url}
        </code>
      )}

      {check.detail && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Respuesta del servidor
          </summary>
          <pre className="mt-1 bg-muted/60 border rounded px-2 py-1 font-mono whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
            {check.detail}
          </pre>
        </details>
      )}
    </div>
  );
};

export const TfsPatDiagnosticsPanel = ({ result }: TfsPatDiagnosticsPanelProps) => {
  const okCount = result.checks.filter((c) => c.status === "ok").length;
  const totalActive = result.checks.filter((c) => c.status !== "skipped").length;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start gap-2">
        <ShieldCheck
          className={`h-5 w-5 shrink-0 mt-0.5 ${
            result.allPassed ? "text-emerald-500" : "text-amber-500"
          }`}
        />
        <div className="flex-1">
          <p className="text-sm font-medium">
            Diagnóstico avanzado del PAT — {okCount}/{totalActive} permisos verificados
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {result.allPassed
              ? "El PAT tiene todos los permisos necesarios."
              : "Revisa los permisos marcados en rojo. Cada fila muestra el endpoint exacto y el código HTTP devuelto."}
          </p>
        </div>
      </div>

      {result.missingScopes.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
          <p className="text-xs font-medium text-destructive">
            Scopes que faltan en el PAT:
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {result.missingScopes.map((scope) => (
              <span
                key={scope}
                className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-destructive/10 text-destructive"
              >
                {scope}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Regenera el PAT en TFS → Perfil → Personal Access Tokens, marcando los scopes anteriores.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {result.checks.map((check) => (
          <ScopeRow key={check.id} check={check} />
        ))}
      </div>
    </div>
  );
};
