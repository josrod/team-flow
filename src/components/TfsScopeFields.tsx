import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { TfsMultiSelect } from "@/components/TfsMultiSelect";
import { listTfsClassificationNodes } from "@/services/tfs";
import { validateServerUrl } from "@/lib/tfsValidation";

interface TfsScopeFieldsProps {
  /** Prefix used for input IDs so multiple instances can coexist. */
  idPrefix: string;
  serverUrl: string;
  collection: string;
  project: string;
  pat: string;
  areaPaths: string[];
  onAreaPathsChange: (paths: string[]) => void;
  iterationPaths: string[];
  onIterationPathsChange: (paths: string[]) => void;
  areasLabel: string;
  iterationsLabel: string;
  areasHint?: string;
  iterationsHint?: string;
  areasPlaceholder?: string;
  iterationsPlaceholder?: string;
  disabledReason?: string;
}

/**
 * Reusable pair of TFS multi-selects for Area Paths + Iteration Paths.
 * Shared by the RODAT scope card and the Software/Epics scope card so both
 * behave identically when loading classification nodes from Azure DevOps.
 */
export const TfsScopeFields = ({
  idPrefix,
  serverUrl,
  collection,
  project,
  pat,
  areaPaths,
  onAreaPathsChange,
  iterationPaths,
  onIterationPathsChange,
  areasLabel,
  iterationsLabel,
  areasHint,
  iterationsHint,
  areasPlaceholder = "Selecciona una o varias áreas…",
  iterationsPlaceholder = "Selecciona una o varias iteraciones…",
  disabledReason = "Configura servidor, colección, proyecto y PAT para cargar los datos.",
}: TfsScopeFieldsProps) => {
  const disabled =
    validateServerUrl(serverUrl).status !== "valid" ||
    !collection.trim() ||
    !project.trim() ||
    !pat.trim();

  return (
    <>
      <div>
        <Label htmlFor={`${idPrefix}-areas`}>{areasLabel}</Label>
        <div className="mt-1">
          <TfsMultiSelect
            id={`${idPrefix}-areas`}
            value={areaPaths}
            onChange={onAreaPathsChange}
            placeholder={areasPlaceholder}
            emptyHint="No se encontraron áreas para este proyecto."
            disabled={disabled}
            disabledReason={disabledReason}
            loadOptions={async () => {
              const res = await listTfsClassificationNodes(
                serverUrl,
                collection,
                project,
                pat,
                "areas",
              );
              return {
                items: res.items.map((n) => ({
                  path: n.path,
                  name: n.name,
                  depth: n.depth,
                })),
                errorMessage: res.error?.message,
              };
            }}
          />
        </div>
        {areasHint && (
          <p className="text-xs text-muted-foreground mt-1.5">{areasHint}</p>
        )}
      </div>

      <Separator />

      <div>
        <Label htmlFor={`${idPrefix}-iterations`}>{iterationsLabel}</Label>
        <div className="mt-1">
          <TfsMultiSelect
            id={`${idPrefix}-iterations`}
            value={iterationPaths}
            onChange={onIterationPathsChange}
            placeholder={iterationsPlaceholder}
            emptyHint="No se encontraron iteraciones para este proyecto."
            disabled={disabled}
            disabledReason={disabledReason}
            loadOptions={async () => {
              const res = await listTfsClassificationNodes(
                serverUrl,
                collection,
                project,
                pat,
                "iterations",
              );
              return {
                items: res.items.map((n) => ({
                  path: n.path,
                  name: n.name,
                  depth: n.depth,
                })),
                errorMessage: res.error?.message,
              };
            }}
          />
        </div>
        {iterationsHint && (
          <p className="text-xs text-muted-foreground mt-1.5">{iterationsHint}</p>
        )}
      </div>
    </>
  );
};
