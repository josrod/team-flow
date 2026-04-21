import { XCircle, ShieldAlert, KeyRound, Search, Clock, Lock, AlertCircle } from "lucide-react";
import type { TfsError } from "@/services/tfs";
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

const titleForKind = (kind: TfsError["kind"]): string => {
  switch (kind) {
    case "cors":
      return "Bloqueado por CORS o red";
    case "mixed_content":
      return "Bloqueado por contenido mixto (HTTP en página HTTPS)";
    case "unauthorized":
      return "Autenticación rechazada";
    case "forbidden":
      return "Permisos insuficientes";
    case "not_found":
      return "Recurso no encontrado";
    case "timeout":
      return "Tiempo de espera agotado";
    case "http":
      return "Error HTTP del servidor";
    default:
      return "Error de conexión";
  }
};

const HintList = ({ items }: { items: string[] }) => (
  <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground mt-2">
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
);

const Hints = ({ kind }: { kind: TfsError["kind"] }) => {
  switch (kind) {
    case "cors":
      return (
        <HintList
          items={[
            "Confirma que estás en la red corporativa o VPN: abre la URL del TFS en otra pestaña; si carga, la red es accesible.",
            "Abre DevTools → pestaña Network → busca la petición fallida y mira la consola por el mensaje exacto (CORS, ERR_CONNECTION_REFUSED, ERR_CERT_…).",
            "Si dice 'CORS': hay que añadir las cabeceras Access-Control-Allow-Origin en el IIS o reverse proxy del TFS.",
            "Si dice 'CERT': el certificado del TFS no es de confianza para tu navegador.",
          ]}
        />
      );
    case "mixed_content":
      return (
        <HintList
          items={[
            "La app se sirve por HTTPS, pero la URL del TFS empieza por HTTP. Los navegadores bloquean siempre esta combinación.",
            "Solución: pon el TFS detrás de HTTPS (recomendado) o accede a la app por HTTP (no aplicable en producción).",
          ]}
        />
      );
    case "unauthorized":
      return (
        <HintList
          items={[
            "Genera un nuevo PAT en TFS → Perfil → Personal Access Tokens.",
            "Comprueba que no esté caducado y que pertenece al mismo dominio que el TFS.",
            "Algunas instalaciones antiguas de TFS no aceptan PAT y requieren credenciales NTLM.",
          ]}
        />
      );
    case "forbidden":
      return (
        <HintList
          items={[
            "El PAT necesita los scopes: Work Items (Read), Project & Team (Read), Work (Read).",
            "Confirma que tu usuario tiene acceso al proyecto desde la web del TFS.",
          ]}
        />
      );
    case "not_found":
      return (
        <HintList
          items={[
            "Verifica que la URL del servidor incluye /tfs si tu instalación lo usa (ej. https://tfs.empresa.net/tfs).",
            "Comprueba el nombre exacto de la colección y el proyecto (sensible a mayúsculas).",
            "Abre la URL completa en el navegador para descartar typos.",
          ]}
        />
      );
    case "timeout":
      return (
        <HintList
          items={[
            "¿Estás conectado a la VPN? Si no, no puedes alcanzar el TFS interno.",
            "Un firewall corporativo puede estar bloqueando peticiones desde el navegador.",
            "Comprueba que el servidor TFS está operativo abriendo la URL directamente.",
          ]}
        />
      );
    case "http":
      return (
        <HintList
          items={[
            "El servidor respondió con un código inesperado. Revisa los logs del TFS.",
            "Verifica que la versión de API (5.0) es compatible con tu instalación de TFS.",
          ]}
        />
      );
    default:
      return null;
  }
};

export const TfsErrorPanel = ({ error }: TfsErrorPanelProps) => {
  const Icon = iconForKind(error.kind);
  const showCorsGuide = error.kind === "cors" || error.kind === "mixed_content";
  const origin = window.location.origin;

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
          <span className="font-medium">URL probada:</span>
        </div>
        <code className="block bg-muted/60 border rounded px-2 py-1 text-[11px] font-mono break-all">
          {error.url}
        </code>
      </div>

      {error.detail && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Detalles técnicos
          </summary>
          <pre className="mt-2 bg-muted/60 border rounded px-2 py-1.5 text-[11px] font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
            {error.detail}
          </pre>
        </details>
      )}

      <Hints kind={error.kind} />

      {showCorsGuide && (
        <div className="pt-2 border-t border-destructive/20">
          <TfsCorsGuideDialog origin={origin} />
        </div>
      )}
    </div>
  );
};
