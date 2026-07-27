## Goal

Add a dedicated "Waiting" column right next to the "Priority" column in the Tasks view tables, so that when an accordion group is expanded you can immediately see which tasks/bugs carry the `waiting` tag — the same way priority is visible at a glance.

## What gets built

1. **New column header**: In `src/pages/FeaturesPage.tsx`, add `<TableHead className="w-[90px]">{t.waitingColumn}</TableHead>` immediately after the Priority header, in both table variants:
   - the flat/ungrouped table (header block around line 1750-1766)
   - the per-developer grouped table (header block around line 2141-2157)

2. **New cell in rows**:
   - Grouped rows render through `TaskRowWithHandover` (line ~2383): add a cell after the `PrioritySelect` cell.
   - Flat rows render inline (around line 1793-1830): add the same cell after the priority cell.
   - Content: if `hasWaitingTag(task.tags)` is true, show a clear waiting marker — an `Hourglass` icon plus the short "Waiting" label in an amber-toned badge (using existing semantic tokens, consistent with the group-header waiting badge). If false, render a muted `—` so the column reads cleanly like Priority does.
   - Accessibility: the badge gets a `title`/`aria-label` with the localized "Waiting" text.

3. **Reuse of existing pieces**: use the existing `WaitingBadge` component (`src/components/WaitingBadge.tsx`) for the cell content instead of duplicating markup; it is currently unused after the earlier refactor, so this brings it back in a single place.

4. **Localization**: add a `waitingColumn` key to `src/context/LanguageContext.tsx` ("Waiting" / "En espera"). Reuse existing waiting label keys for the badge text.

## Notes

- No changes to filtering, WIP calculation, or the group-header waiting badge — those stay as they are.
- Column widths for the surrounding columns are unchanged; the new column is narrow (90px) and sits between Priority and Assigned to / Handover.
- Verification: run `tsgo` typecheck, ESLint, and the existing task-related tests (`tasks-state`, `waiting-badge`).
