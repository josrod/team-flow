import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, ChevronDown, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface TfsSuggestion {
  /** Stable id; falls back to the name when the API doesn't return one. */
  id: string;
  /** Value written into the input when chosen. */
  name: string;
  /** Optional secondary line shown under the name. */
  description?: string;
}

export type TfsAutocompleteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; items: TfsSuggestion[] }
  | { status: "error"; message: string };

interface TfsAutocompleteInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Visual state coming from the parent's validation logic. */
  inputClassName?: string;
  /** Async loader called when the popover opens or when the user clicks refresh. */
  loadSuggestions: () => Promise<{ items: TfsSuggestion[]; errorMessage?: string }>;
  /** True when prerequisites (server/collection/PAT/etc.) are met. */
  enabled: boolean;
  /** Hint shown inside the popover when prerequisites are missing. */
  disabledReason?: string;
  ariaInvalid?: boolean;
}

/**
 * Plain input + "▾" trigger that opens a popover listing matching suggestions
 * fetched from the TFS REST API. The user can always type a free value, so a
 * failed discovery never blocks them from continuing.
 */
export const TfsAutocompleteInput = ({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  inputClassName,
  loadSuggestions,
  enabled,
  disabledReason,
  ariaInvalid,
}: TfsAutocompleteInputProps) => {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<TfsAutocompleteState>({ status: "idle" });
  const lastLoadedKeyRef = useRef<string>("");

  const fetchSuggestions = async (force = false) => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }
    // Avoid re-fetching unless forced — caches per "enabled" snapshot.
    const key = enabled ? "enabled" : "disabled";
    if (!force && state.status === "ready" && lastLoadedKeyRef.current === key) {
      return;
    }
    setState({ status: "loading" });
    try {
      const { items, errorMessage } = await loadSuggestions();
      if (errorMessage) {
        setState({ status: "error", message: errorMessage });
      } else {
        setState({ status: "ready", items });
        lastLoadedKeyRef.current = key;
      }
    } catch (err: unknown) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "No se pudo cargar la lista.",
      });
    }
  };

  // When user toggles the popover open, lazily fetch suggestions.
  useEffect(() => {
    if (open) void fetchSuggestions(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // If the prerequisites change (e.g. collection cleared while listing projects),
  // wipe cached results so the next open re-fetches.
  useEffect(() => {
    lastLoadedKeyRef.current = "";
    if (state.status === "ready" || state.status === "error") {
      setState({ status: "idle" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const filtered =
    state.status === "ready"
      ? state.items.filter((item) =>
          value.trim().length === 0
            ? true
            : item.name.toLowerCase().includes(value.trim().toLowerCase()),
        )
      : [];

  return (
    <div className="relative mt-1">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        aria-invalid={ariaInvalid}
        className={cn("pr-9", inputClassName)}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label="Mostrar sugerencias"
            className="absolute right-0 top-0 h-full w-9 text-muted-foreground hover:text-foreground"
          >
            {state.status === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[--radix-popover-trigger-width] min-w-[260px] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              Sugerencias
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void fetchSuggestions(true)}
              disabled={!enabled || state.status === "loading"}
              aria-label="Recargar sugerencias"
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  state.status === "loading" && "animate-spin",
                )}
              />
            </Button>
          </div>

          {!enabled && (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              {disabledReason ?? "Completa los campos previos y el PAT para ver sugerencias."}
            </p>
          )}

          {enabled && state.status === "loading" && (
            <p className="px-3 py-4 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Consultando al servidor TFS…
            </p>
          )}

          {enabled && state.status === "error" && (
            <div className="px-3 py-3 space-y-2">
              <p className="text-xs text-destructive flex items-start gap-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{state.message}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Puedes seguir escribiendo el valor manualmente.
              </p>
            </div>
          )}

          {enabled && state.status === "ready" && filtered.length === 0 && (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              {state.items.length === 0
                ? "Sin resultados desde el servidor."
                : "Ningún elemento coincide con lo escrito."}
            </p>
          )}

          {enabled && state.status === "ready" && filtered.length > 0 && (
            <ul className="max-h-64 overflow-y-auto py-1">
              {filtered.slice(0, 50).map((item) => {
                const isSelected = item.name === value.trim();
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors",
                        isSelected && "bg-accent/50 font-medium",
                      )}
                      onClick={() => {
                        onChange(item.name);
                        setOpen(false);
                      }}
                    >
                      <span className="block truncate">{item.name}</span>
                      {item.description && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};
