import { useEffect, useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useLang } from "@/context/LanguageContext";
import {
  EPIC_VERSION_COLORS,
  nextEpicVersionColorKey,
  resolveEpicVersionColor,
} from "@/lib/epicVersionColors";
import type { EpicVersion } from "@/services/epicVersions";

interface EpicVersionManagerProps {
  versions: EpicVersion[];
  counts: Record<string, number>;
  canEdit: boolean;
  onAdd: (name: string, colorKey: string) => Promise<void>;
  onEdit: (id: string, patch: { name?: string; colorKey?: string }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

const ColorPicker = ({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (key: string) => void;
  label: string;
}) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label={label}>
        <span className={cn("h-4 w-4 rounded-full", resolveEpicVersionColor(value).bar)} />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-2" align="start">
      <div className="grid grid-cols-5 gap-1.5">
        {EPIC_VERSION_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-label={c.key}
            onClick={() => onChange(c.key)}
            className={cn(
              "h-6 w-6 rounded-full ring-offset-2 ring-offset-background transition-shadow",
              c.bar,
              value === c.key && "ring-2 ring-foreground",
            )}
          />
        ))}
      </div>
    </PopoverContent>
  </Popover>
);

export const EpicVersionManager = ({
  versions,
  counts,
  canEdit,
  onAdd,
  onEdit,
  onRemove,
}: EpicVersionManagerProps) => {
  const { t } = useLang();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(() => nextEpicVersionColorKey([]));
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await onAdd(name, newColor);
      setNewName("");
      setNewColor(nextEpicVersionColorKey([...versions.map((v) => v.colorKey), newColor]));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (version: EpicVersion) => {
    setEditingId(version.id);
    setEditName(version.name);
  };

  const commitEdit = async (version: EpicVersion) => {
    const name = editName.trim();
    setEditingId(null);
    if (!name || name === version.name) return;
    await onEdit(version.id, { name });
  };

  return (
    <div className="rounded-md border bg-muted/10 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t.epicVersionsTitle}</p>
          <p className="text-xs text-muted-foreground">{t.epicVersionsDescription}</p>
        </div>
      </div>

      {versions.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t.epicVersionsEmpty}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {versions.map((version) => {
            const color = resolveEpicVersionColor(version.colorKey);
            const count = counts[version.id] ?? 0;
            if (editingId === version.id && canEdit) {
              return (
                <div key={version.id} className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
                  <ColorPicker
                    value={version.colorKey}
                    label={t.epicVersionColor}
                    onChange={(colorKey) => onEdit(version.id, { colorKey })}
                  />
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitEdit(version);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-8 w-32 text-xs"
                    autoFocus
                  />
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => void commitEdit(version)} aria-label={t.epicVersionSave}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)} aria-label={t.epicsFilterClear}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            }
            return (
              <div key={version.id} className="flex items-center gap-1">
                <Badge variant="outline" className={cn("gap-1.5 text-[11px]", color.badge)}>
                  <span className={cn("h-2 w-2 rounded-full", color.bar)} />
                  {version.name}
                  <span className="opacity-70">· {count}</span>
                </Badge>
                {canEdit && (
                  <>
                    <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(version)} aria-label={t.epicVersionRename}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive"
                      onClick={() => {
                        if (window.confirm(t.epicVersionDeleteConfirm)) void onRemove(version.id);
                      }}
                      aria-label={t.epicVersionDelete}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <div className="flex items-center gap-2">
          <ColorPicker value={newColor} onChange={setNewColor} label={t.epicVersionColor} />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAdd();
            }}
            placeholder={t.epicVersionNamePlaceholder}
            className="h-8 w-48 text-xs"
          />
          <Button type="button" size="sm" className="h-8" onClick={() => void handleAdd()} disabled={busy || !newName.trim()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            {t.epicVersionAdd}
          </Button>
        </div>
      )}
    </div>
  );
};
