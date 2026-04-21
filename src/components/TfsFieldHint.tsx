import { CheckCircle2, AlertCircle } from "lucide-react";
import type { FieldValidation } from "@/lib/tfsValidation";
import { cn } from "@/lib/utils";

interface TfsFieldHintProps {
  validation: FieldValidation;
  /** Default hint shown when the field is empty (replaces the muted helper text). */
  defaultHint?: string;
  /** When true, valid status renders nothing (useful for optional fields like team). */
  hideValid?: boolean;
}

export const TfsFieldHint = ({
  validation,
  defaultHint,
  hideValid = false,
}: TfsFieldHintProps) => {
  if (validation.status === "empty") {
    if (!defaultHint) return null;
    return <p className="text-xs text-muted-foreground mt-1">{defaultHint}</p>;
  }

  if (validation.status === "valid") {
    if (hideValid) return null;
    return (
      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Formato correcto
      </p>
    );
  }

  return (
    <p
      className={cn(
        "text-xs mt-1 flex items-center gap-1",
        "text-destructive",
      )}
    >
      <AlertCircle className="h-3 w-3" />
      {validation.message}
    </p>
  );
};
