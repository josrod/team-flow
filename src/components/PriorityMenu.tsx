import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Upload, Flag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/context/LanguageContext";

interface PriorityMenuProps {
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
  onReset: () => void;
  count: number;
  scopeLabel?: string;
}

export const PriorityMenu = ({ onExport, onImport, onReset, count, scopeLabel }: PriorityMenuProps) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { t } = useLang();

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await onImport(file);
      toast.success(t.prioritiesImported);
    } catch (err) {
      const message = err instanceof Error ? err.message : t.importFileError;
      toast.error(message);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 gap-1.5">
            <Flag className="h-3.5 w-3.5" />
            {t.prioritiesBtn}
            {count > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                {count}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {scopeLabel && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground border-b mb-1">
              {scopeLabel}
            </div>
          )}
          <DropdownMenuItem
            onClick={() => {
              onExport();
              toast.success(t.fileDownloaded);
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            {t.exportToJson}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            {t.importFromJson}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setConfirmOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t.clearPriorities}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFile}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.clearPrioritiesTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.clearPrioritiesDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancelBtn}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onReset();
                toast.success(t.prioritiesCleared);
              }}
            >
              {t.clearBtn}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
