# Add Closed date & Changed date columns to Tasks view

Show two new columns in the Tasks view (`/tasks`) so each row (task or bug) displays:
- **Changed date** — last modification in Azure DevOps (`System.ChangedDate`)
- **Closed date** — when the item was closed/resolved (`Microsoft.VSTS.Common.ClosedDate`)

Both fields come from the existing TFS connector; only the list query currently omits them.

## Scope

- Applies only when the data source is TFS/Azure DevOps. For the local/mock source the columns render `—`.
- Only the Tasks view tables are touched. Features view and Workload view are untouched.
- Dates formatted as `DD/MM/YYYY` (per project convention). Empty values render as `—`.

## Changes

1. **`src/services/tfs.ts`**
   - Extend `TfsWorkItem` with `changedDate?: string` and `closedDate?: string`.
   - In `mapRawToWorkItem`, read `System.ChangedDate` and `Microsoft.VSTS.Common.ClosedDate` from `fields`.
   - In `listTfsTasks` (and, for symmetry, `listTfsFeatures`), add `"System.ChangedDate"` and `"Microsoft.VSTS.Common.ClosedDate"` to the requested fields array passed into `runWiqlAndFetch`.

2. **`src/pages/FeaturesPage.tsx`**
   - Extend `UnifiedTask` with `changedDate?: string` and `closedDate?: string`.
   - In the TFS branch of the `{ features, tasks }` `useMemo` (~line 706), map both fields from the TFS item into the unified task.
   - Add two `TableHead` cells in the Tasks-view table header (around line 1627, after the Iteration column) labelled with the new i18n keys.
   - Render the dates in the corresponding `TableCell`s using a small `formatDate` helper (returns `DD/MM/YYYY` or `—`).
   - Update the `colSpan` math in `TaskRowWithHandover` (currently `7 + …`) to account for the two extra columns, and add the two cells in its row template as well — used by the per-person grouping table around line 1904.

3. **`src/context/LanguageContext.tsx`**
   - Add new keys in both Spanish and English blocks:
     - `changedDateColumn`: "Modificado" / "Changed"
     - `closedDateColumn`: "Cerrado" / "Closed"

## Technical notes

- WIQL `SELECT` clause is `[System.Id]` only — Azure DevOps returns the requested fields via the second `workitems` batch call, which is driven by the `fields` array passed into `runWiqlAndFetch`. Adding the two field names there is sufficient; the WIQL string itself does not need to change.
- `Microsoft.VSTS.Common.ClosedDate` is populated by Azure DevOps when an item transitions to `Closed` (and for Bugs also when `Resolved`, depending on process template). It will be `undefined` for active items — that's the intended `—` case.
- `formatDate` lives next to the table render block (small local helper, no new file). Parses ISO string with `new Date(...)`; if `Number.isNaN(date.getTime())` return `—`.

## Out of scope

- Sorting/filtering by these new columns.
- Showing them in `BugDetailDialog` (already shows "Changed" separately).
- Mobile-specific layout tweaks; existing horizontal scroll on the table wrapper handles overflow.
