import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useLang } from "@/context/LanguageContext";
import { resolveEpicVersionColor } from "@/lib/epicVersionColors";
import type { EpicVersion } from "@/services/epicVersions";

interface EpicVersionLegendProps {
  versions: EpicVersion[];
  /** version id -> number of epics */
  counts: Record<string, number>;
  /** Epics without any version assigned. */
  noVersionCount: number;
  canEdit: boolean;
  /** Currently selected version keys (version id or the "no version" key). */
  selected: readonly string[];
  noVersionKey: string;
  onToggle: (key: string) => void;
  onEditVersion: (id: string) => void;
}

/** Visible legend explaining each colour and its delivery version. */
export const EpicVersionLegend = ({
  versions,
  counts,
  noVersionCount,
  canEdit,
  selected,
  noVersionKey,
  onToggle,
  onEditVersion,
}: EpicVersionLegendProps) => {
  const { t } = useLang();
  if (versions.length === 0) return null;

  return (
    <div className="rounded-md border bg-muted/10 px-3 py-2.5 space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-xs font-medium">{t.epicVersionLegendTitle}</p>
        <p className="text-[11px] text-muted-foreground">{t.epicVersionLegendHint}</p>
      </div>
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-wrap items-center gap-2">
          {versions.map((version) => {
            const color = resolveEpicVersionColor(version.colorKey);
            const isSelected = selected.includes(version.id);
            return (
              <div
                key={version.id}
                className={cn(
                  "flex items-center gap-1 rounded-md border px-1.5 py-1 transition-colors",
                  isSelected ? "border-primary bg-accent/40" : "border-transparent",
                )}
              >
                <button
                  type="button"
                  onClick={() => onToggle(version.id)}
                  aria-pressed={isSelected}
                  className="flex items-center gap-1.5 text-xs hover:text-primary"
                >
                  <span className={cn("h-3 w-3 rounded-sm", color.bar)} aria-hidden />
                  <span className="font-medium">{version.name}</span>
                  <Badge variant="outline" className={cn("px-1 py-0 text-[10px]", color.badge)}>
                    {counts[version.id] ?? 0}
                  </Badge>
                </button>
                {canEdit && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => onEditVersion(version.id)}
                        aria-label={`${t.epicVersionLegendEdit}: ${version.name}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {t.epicVersionLegendEdit}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => onToggle(noVersionKey)}
            aria-pressed={selected.includes(noVersionKey)}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs hover:text-primary",
              selected.includes(noVersionKey) ? "border-primary bg-accent/40" : "border-transparent",
            )}
          >
            <span className="h-3 w-3 rounded-sm border border-muted-foreground/50" aria-hidden />
            <span className="font-medium">{t.epicVersionNone}</span>
            <Badge variant="outline" className="px-1 py-0 text-[10px]">
              {noVersionCount}
            </Badge>
          </button>
        </div>
      </TooltipProvider>
    </div>
  );
};
