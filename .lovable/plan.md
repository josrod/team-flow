## Goal

Currently the Tasks view already supports drag & drop reordering plus priority levels (High/Medium/Low/None), but the order is stored as a single global map per browser. The user wants the manual order to belong to **the developer whose tasks are being shown** (the active "Assigned to" filter), so each developer has their own independent ranking that persists across reloads and is the same for anyone viewing that developer's board.

## What changes

### 1. Scope priorities by developer key
- Change the storage shape from a flat `Record<taskId, entry>` to `Record<developerKey, Record<taskId, entry>>`.
- `developerKey` = the active developer filter value (e.g. member id or normalized display name). When "All / no filter" is active, fall back to a shared `__all__` bucket so the feature is still usable.
- Bump storage key to `rosen.taskPriorities.v2` and write a one-time migration that moves the existing v1 flat map into the `__all__` bucket so nothing is lost.

### 2. Hook API
- `useTaskPriorities(developerKey: string)` returns the same surface (`priorities`, `setLevel`, `move`, `reset`, `exportJson`, `importJson`) but every read/write is scoped to that developer's bucket.
- Cross-tab `storage` listener keeps working; it just re-reads the active bucket.
- `reset` clears only the current developer. Export/import work on the current developer's bucket (filename includes the developer slug, e.g. `prioridades-tareas-jdoe-2026-06-22.json`).

### 3. Wire into FeaturesPage
- Pass the currently selected developer filter into `useTaskPriorities(...)`.
- When the developer filter changes, the table re-renders against the new bucket; drag, priority selector and sort behave per-developer automatically.
- Small UI hint near the priority menu: "Order saved for {developerName}" (translated, EN/ES) so users understand the scope.

### 4. Sorting
- `sortByPriority` stays unchanged — it operates on whichever map the hook returns, which is now developer-scoped. Default level remains Medium.

### 5. Tests
- Update `src/test/task-priority.test.ts` for the migration helper and bucket-scoped read/write.
- Add a small test that two different developer keys keep independent orders.

## Technical details

Files touched:
- `src/lib/taskPriority.ts` — new types `BucketedPriorityMap`, `STORAGE_KEY_V2`, helpers `loadBuckets`, `saveBuckets`, `migrateV1ToV2`, `getBucket`, `setBucket`. Existing pure helpers (`setPriorityLevel`, `moveTo`, `sortByPriority`, export/import payload) stay as-is and continue to work on a single bucket.
- `src/hooks/use-task-priorities.ts` — accept `developerKey`, read/write the right bucket, scope export filename, scope reset.
- `src/pages/FeaturesPage.tsx` — pass the active developer filter value (normalized) into the hook; add the small "scope" label next to the priority menu.
- `src/context/LanguageContext.tsx` — two new keys: `priorityScopeFor` (EN: "Order saved for {name}", ES: "Orden guardado para {name}") and `priorityScopeAll` (EN: "Order saved for everyone", ES: "Orden guardado para todos").
- `src/test/task-priority.test.ts` — migration + per-bucket isolation tests.

Out of scope (not changing now):
- Syncing to Lovable Cloud / cross-device persistence.
- Grouping rows visually by priority level.
- Changing the drag & drop UX itself (still `SortableRows`).
