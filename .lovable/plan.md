

# Add new absence types

The system currently only supports **vacation** and **sick-leave**. We need to add three new types: **work-travel**, **other-project**, and **parental-leave**.

## Files to modify

### 1. Types and validation
- **`src/types/index.ts`** — Extend `AbsenceType` to `"vacation" | "sick-leave" | "work-travel" | "other-project" | "parental-leave"`. Extend `MemberStatus` similarly.
- **`src/lib/validation.ts`** — Update the `absenceSchema` `type` enum to include the 3 new values.

### 2. Theme (colors)
- **`src/index.css`** — Add 3 new CSS variables in both `:root` and `.dark`: `--status-work-travel` (blue-ish, e.g. `210 70% 50%`), `--status-other-project` (purple, e.g. `270 60% 55%`), `--status-parental-leave` (pink, e.g. `330 65% 55%`).
- **`tailwind.config.ts`** — Add `"work-travel"`, `"other-project"`, `"parental-leave"` to the `status` color map.

### 3. UI components
- **`src/components/StatusBadge.tsx`** — Add entries in `statusConfig` and `topicStatusConfig` for the 3 new types with appropriate labels and colors.
- **`src/components/HandoverCard.tsx`** — Update any absence type label mapping.
- **`src/components/AnalyticsPanel.tsx`** — Add new types to the PieChart data/colors.

### 4. Absences page
- **`src/pages/AbsencesPage.tsx`**:
  - Add 3 new summary cards with icons (`Plane`, `FolderKanban`, `Baby` from lucide-react).
  - Update the `summary` computation to count `workTravelDays`, `otherProjectDays`, `parentalLeaveDays`.
  - Add new `<SelectItem>` entries in both add and edit dialogs.
  - Update timeline color rendering for the 3 new types.
  - Update CSV export type label mapping.

### 5. Import dialog
- **`src/components/AbsenceImportDialog.tsx`** — Extend `normalizeType()` to recognize strings like "travel", "viaje de trabajo", "otro proyecto", "other project", "baja maternal", "maternity", "paternity", "parental leave" → map to the new types.

### 6. Translations
- **`src/context/LanguageContext.tsx`** — Add translation keys: `workTravel`, `otherProject`, `parentalLeave` in both `es` and `en`.

### 7. Mock data
- **`src/data/mock-data.ts`** — Add sample absences using the new types so they appear in the dashboard.

## Summary
Roughly 10 files touched. The changes are additive — no breaking changes to existing data. Existing `vacation` and `sick-leave` absences continue to work unchanged.

