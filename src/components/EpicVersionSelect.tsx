import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useLang } from "@/context/LanguageContext";
import { resolveEpicVersionColor } from "@/lib/epicVersionColors";
import type { EpicVersion } from "@/services/epicVersions";

const NONE = "__none__";

interface EpicVersionSelectProps {
  epicId: number | string;
  versions: EpicVersion[];
  versionId: string | null;
  canEdit: boolean;
  onAssign: (epicId: string, versionId: string | null) => Promise<void>;
  className?: string;
}

/** Read-only badge for visitors, dropdown selector for admins. */
export const EpicVersionSelect = ({
  epicId,
  versions,
  versionId,
  canEdit,
  onAssign,
  className,
}: EpicVersionSelectProps) => {
  const { t } = useLang();
  const [saving, setSaving] = useState(false);
  const current = versions.find((v) => v.id === versionId) ?? null;

  if (!canEdit) {
    if (!current) return <span className="text-xs text-muted-foreground">—</span>;
    const color = resolveEpicVersionColor(current.colorKey);
    return (
      <Badge
        variant="outline"
        className={cn("gap-1.5 text-[10px]", color.badge, className)}
        title={epicVersionAccessibleLabel(current.name, current.colorKey)}
      >
        <span aria-hidden className="leading-none">{color.symbol}</span>
        {current.name}
      </Badge>
    );
  }

  return (
    <Select
      value={versionId ?? NONE}
      disabled={saving || versions.length === 0}
      onValueChange={async (value) => {
        setSaving(true);
        try {
          await onAssign(String(epicId), value === NONE ? null : value);
          toast.success(t.epicVersionSaved);
        } catch (err) {
          toast.error(`${t.epicVersionErrorSaving}: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setSaving(false);
        }
      }}
    >
      <SelectTrigger
        className={cn("h-7 w-[150px] text-xs", className)}
        aria-label={t.epicVersionAssignLabel}
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue placeholder={t.epicVersionNone} />
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        <SelectItem value={NONE} className="text-xs">{t.epicVersionNone}</SelectItem>
        {versions.map((v) => {
          const color = resolveEpicVersionColor(v.colorKey);
          return (
            <SelectItem key={v.id} value={v.id} className="text-xs">
              <span className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", color.bar)} />
                {v.name}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};
