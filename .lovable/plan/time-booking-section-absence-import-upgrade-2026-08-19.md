# Time booking section + absence import upgrade

Bring the validated INVENT Excel import rules from the Planning Data Hub prototype into this app: harden the existing absence import and add a brand-new Time booking section with shared, backend-stored data.

## What you get

### 1. New "Time booking" section
- Sidebar entry and page at `/time-booking`, read-only for visitors, importable by the admin.
- Summary cards: booked hours, records, people, projects, tasks, distinct delivery numbers, last import date.
- Charts: hours by project and hours by person (top 8 each), matching the existing dashboard visual style.
- Searchable, paginated table with filters: person, project code, task, activity kind, exact delivery number, and an inclusive date range. Filters persist in the URL-free local state like the other views.
- Import dialog (admin only): drop an INVENT Time Booking `.xlsx`, see a preview and a result summary (records imported, people, projects, warnings list per discarded row).
- People are matched against team members by login name / full name, and the raw INVENT name is always kept. Unmatched people are listed in a panel so the admin can fix logins, reusing the existing unmatched-assignee pattern.

### 2. Absence import improvements
- Row-level warnings with the real Excel row number ("Row 42: discarded because required values are missing") instead of a silent skipped counter.
- `Home Office` added to the ignored activity kinds (alongside Public Holiday, Training, Working hours) so it never counts as an absence.
- Import result summary: records created, distinct people, warnings — shown in the dialog after import.
- Daily hours are stored per absence, so partial days are visible in the absences views instead of being lost.
- More tolerant value parsing per the spec: European decimal comma, Excel date serials, `DD/MM/YYYY` and `DD.MM.YYYY` text dates.

### 3. Re-import safety
Re-importing the same export does not duplicate anything: bookings are keyed by person + work date + booking number, absences by person + work date.

## Technical details

**Database (new tables, admin-write / authenticated-read like the rest of the app)**
- `time_bookings`: `id`, `work_date`, `person` (raw), `member_id` (nullable FK to `members`), `booking_no`, `duration`, `organization`, `project_code`, `task_name`, `activity_kind`, `activity_group`, `activity_type`, `remarks`, `delivery_no`, `delivery_position`, timestamps. Unique index on `(person, work_date, booking_no)` for idempotent upserts; indexes on `work_date`, `project_code`, `member_id`.
- `time_booking_imports`: import audit row (file name, imported count, people, projects, warnings JSON, `user_id`, `created_at`).
- `absences` gains a nullable `hours` column (daily total) plus `activities text[]` for the accumulated activity kinds of the day.
- RLS: SELECT for `authenticated`, INSERT/UPDATE/DELETE only for `has_role(auth.uid(), 'admin')`. GRANTs issued in the same migration.

**Parsing layer (pure, testable)**
- `src/lib/inventValues.ts`: shared normalizers — text, number (European comma), optional integer (`0` = absent), date (native Date, Excel serial epoch 1899-12-30, `DD/MM/YYYY`, `DD.MM.YYYY`, ISO), all stored as ISO.
- `src/services/inventTimeBookingParser.ts`: positional column mapping exactly as in the spec (A workDate, B person, C bookingNo, D duration, E organization, F projectCode, G taskName, J activityKind, K activityGroup, L activityType, M remarks, R deliveryNo, S deliveryPosition), plus header validation, empty-row skipping, warning per incomplete row, and synthetic ids.
- `src/services/inventAbsentParser.ts`: extended to emit `ImportWarning[]` with Excel row numbers, ignore `Home Office`, and carry the per-day duration and activity list through into `ParsedAbsence`.
- `src/services/timeBookingService.ts`: service layer for list/filter/paginate/upsert against the database (no `fetch` from components), plus aggregation helpers for the KPI cards and charts.

**UI**
- `src/pages/TimeBookingPage.tsx`, `src/components/TimeBookingImportDialog.tsx`, route in `App.tsx`, sidebar link in `AppSidebar.tsx`.
- Absence dialog (`AbsenceImportDialog.tsx`) shows the new counters and the warnings list.
- All new copy goes through `LanguageContext` in English and Spanish; dates rendered `DD/MM/YYYY` and hours with a decimal comma (`8,50 h`).

**Tests**
- Unit tests for the value normalizers, the time booking parser (Excel serial dates, comma decimals, blank and incomplete rows, `deliveryNo` = 0), the absence warning/grouping changes, and the filter/pagination helpers.
