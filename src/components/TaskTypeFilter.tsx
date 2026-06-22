import { cn } from "@/lib/utils";
import { getTaskTypeColor } from "@/lib/taskTypeFilter";
import { useLang } from "@/context/LanguageContext";

interface TaskTypeFilterProps {
  /** Types available in the current dataset (already view-filtered). */
  types: readonly string[];
  /** Currently selected type set. */
  selected: ReadonlySet<string>;
  /** Per-type counts (after applying all other filters). */
  counts: Readonly<Record<string, number>>;
  /** Toggle a single type. */
  onToggle: (type: string) => void;
  /** Clear the selection. */
  onClear: () => void;
  /** Optional aria-label override. */
  label?: string;
}

/**
 * Single source of truth for rendering the task type filter chips.
 * Used across every view (Tasks, Bugs, Features…) so that Task and Bug
 * always look and behave the same way.
 */
export const TaskTypeFilter = ({
  types,
  selected,
  counts,
  onToggle,
  onClear,
  label,
}: TaskTypeFilterProps) => {
  const { t } = useLang();
  if (types.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label ?? t.filterByType}>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">{t.typeShort}</span>
      {types.map((type) => {
        const active = selected.has(type);
        const color = getTaskTypeColor(type);
        const count = counts[type] ?? 0;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onToggle(type)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              active
                ? "border-transparent text-foreground"
                : "border-border/60 text-muted-foreground hover:bg-muted/40",
            )}
            style={active ? { background: `${color}25`, color } : undefined}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
            {type} ({count})
          </button>
        );
      })}
      {selected.size > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline ml-1"
        >
          {t.clearShort}
        </button>
      )}
    </div>
  );
};
