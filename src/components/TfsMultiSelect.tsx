import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Loader2, RefreshCw, X } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface TfsMultiSelectOption {
  /** Full TFS path (used as the value). */
  path: string;
  /** Leaf name. */
  name: string;
  /** Tree depth — used for indentation. */
  depth: number;
}

interface TfsMultiSelectProps {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  loadOptions: () => Promise<{ items: TfsMultiSelectOption[]; errorMessage?: string }>;
  placeholder: string;
  emptyHint: string;
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * Searchable multi-select for TFS classification nodes (areas / iterations).
 * Loads the full tree on first open and caches it for the lifetime of the
 * mounted component. The user can refresh on demand.
 */
export const TfsMultiSelect = ({
  id,
  value,
  onChange,
  loadOptions,
  placeholder,
  emptyHint,
  disabled,
  disabledReason,
}: TfsMultiSelectProps) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<TfsMultiSelectOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const ensureLoaded = async (force = false) => {
    if (!force && options !== null) return;
    setLoading(true);
    setError(null);
    try {
      const res = await loadOptions();
      setOptions(res.items);
      if (res.errorMessage) setError(res.errorMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredOptions = useMemo(() => {
    if (!options) return [];
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.path.toLowerCase().includes(q));
  }, [options, search]);

  const toggle = (path: string) => {
    if (value.includes(path)) {
      onChange(value.filter((p) => p !== path));
    } else {
      onChange([...value, path]);
    }
  };

  const remove = (path: string) => onChange(value.filter((p) => p !== path));

  return (
    <div className="space-y-2">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) void ensureLoaded();
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            title={disabled ? disabledReason : undefined}
            className="w-full justify-between font-normal"
          >
            <span className="truncate text-left">
              {value.length === 0
                ? placeholder
                : `${value.length} seleccionado${value.length === 1 ? "" : "s"}`}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <div className="flex items-center gap-2 border-b p-2">
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="h-8"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              title="Recargar"
              onClick={() => void ensureLoaded(true)}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="max-h-72 overflow-auto py-1">
            {loading && options === null && (
              <div className="px-3 py-4 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
              </div>
            )}
            {!loading && options !== null && filteredOptions.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground">{emptyHint}</div>
            )}
            {filteredOptions.map((opt) => {
              const selected = value.includes(opt.path);
              return (
                <button
                  key={opt.path}
                  type="button"
                  onClick={() => toggle(opt.path)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent",
                    selected && "bg-accent/50",
                  )}
                  style={{ paddingLeft: `${0.75 + opt.depth * 0.75}rem` }}
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="font-mono truncate">{opt.path}</span>
                </button>
              );
            })}
          </div>
          {error && (
            <p className="border-t px-3 py-2 text-xs text-destructive">{error}</p>
          )}
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((p) => (
            <Badge key={p} variant="secondary" className="gap-1 font-mono text-[11px]">
              {p}
              <button
                type="button"
                onClick={() => remove(p)}
                className="ml-0.5 hover:text-destructive"
                aria-label={`Quitar ${p}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};
