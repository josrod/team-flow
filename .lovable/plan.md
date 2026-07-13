# Waiting badge on rows

Add a small "Waiting" badge next to the title of each task/bug row in the Tasks view (`src/pages/FeaturesPage.tsx`) whenever the item has the `waiting` tag (case-insensitive).

## Changes

1. **`src/pages/FeaturesPage.tsx`**
   - In the row renderer (both flat and grouped `SortableTaskRows` views), after the title, detect `parseTfsTags(item.tags).some(t => t.toLowerCase() === "waiting")`.
   - Render a compact `<Badge variant="outline">` with amber styling (`border-status-vacation/40 text-status-vacation bg-status-vacation/10`) and an `Hourglass` icon (already imported for the WIP metric) to stay consistent with the existing "Waiting" stat card.
   - Label uses new i18n key `t.tagWaiting` → "Waiting" / "En espera".

2. **`src/context/LanguageContext.tsx`**
   - Add `tagWaiting` key (EN: "Waiting", ES: "En espera").

## Out of scope

- No changes to filtering, sorting, or the existing Waiting stat card.
- No change to Bugs page (only the Tasks view was requested).
