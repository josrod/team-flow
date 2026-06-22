import { XCircle, ShieldAlert, KeyRound, Search, Clock, Lock, AlertCircle } from "lucide-react";
import type { TfsError } from "@/services/tfs";
import { useLang } from "@/context/LanguageContext";
import { TfsCorsGuideDialog } from "./TfsCorsGuideDialog";

interface TfsErrorPanelProps {
  error: TfsError;
}

const iconForKind = (kind: TfsError["kind"]) => {
  switch (kind) {
    case "cors":
    case "mixed_content":
      return ShieldAlert;
    case "unauthorized":
    case "forbidden":
      return KeyRound;
    case "not_found":
      return Search;
    case "timeout":
      return Clock;
    case "http":
      return AlertCircle;
    default:
      return XCircle;
  }
};

const HintList = ({ items }: { items: string[] }) => (
  <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground mt-2">
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
);

export const TfsErrorPanel = ({ error }: TfsErrorPanelProps) => {
  const { t } = useLang();
  const Icon = iconForKind(error.kind);
  const showCorsGuide = error.kind === "cors" || error.kind === "mixed_content";
  const origin = window.location.origin;

  const titleForKind = (kind: TfsError["kind"]): string => {
    switch (kind) {
      case "cors":
        return t.tfsErrCors;
      case "mixed_content":
        return t.tfsErrMixed;
      case "unauthorized":
        return t.tfsErrUnauthorized;
      case "forbidden":
        return t.tfsErrForbidden;
      case "not_found":
        return t.tfsErrNotFound;
      case "timeout":
        return t.tfsErrTimeout;
      case "http":
        return t.tfsErrHttp;
      default:
        return t.tfsErrUnknown;
    }
  };

  const hintsForKind = (kind: TfsError["kind"]): string[] => {
    switch (kind) {
      case "cors":
        return [t.tfsHintCors1, t.tfsHintCors2, t.tfsHintCors3, t.tfsHintCors4];
      case "mixed_content":
        return [t.tfsHintMixed1, t.tfsHintMixed2];
      case "unauthorized":
        return [t.tfsHintUnauth1, t.tfsHintUnauth2, t.tfsHintUnauth3];
      case "forbidden":
        return [t.tfsHintForb1, t.tfsHintForb2];
      case "not_found":
        return [t.tfsHintNotFound1, t.tfsHintNotFound2, t.tfsHintNotFound3];
      case "timeout":
        return [t.tfsHintTimeout1, t.tfsHintTimeout2, t.tfsHintTimeout3];
      case "http":
        return [t.tfsHintHttp1, t.tfsHintHttp2];
      default:
        return [];
    }
  };

  const hints = hintsForKind(error.kind);

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Icon className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">{titleForKind(error.kind)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{error.message}</p>
        </div>
        {error.status && (
          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-destructive/10 text-destructive shrink-0">
            HTTP {error.status}
          </span>
        )}
      </div>

      <div className="space-y-1 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Lock className="h-3 w-3" />
          <span className="font-medium">{t.tfsErrUrlTested}</span>
        </div>
        <code className="block bg-muted/60 border rounded px-2 py-1 text-[11px] font-mono break-all">
          {error.url}
        </code>
      </div>

      {error.detail && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {t.tfsErrTechDetails}
          </summary>
          <pre className="mt-2 bg-muted/60 border rounded px-2 py-1.5 text-[11px] font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
            {error.detail}
          </pre>
        </details>
      )}

      {hints.length > 0 && <HintList items={hints} />}

      {showCorsGuide && (
        <div className="pt-2 border-t border-destructive/20">
          <TfsCorsGuideDialog origin={origin} />
        </div>
      )}
    </div>
  );
};
