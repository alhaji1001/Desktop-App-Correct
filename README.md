# GDSS Dutse Results Desktop App

An offline Windows desktop app for managing school records and results locally with SQLite.

## What’s included

- School identity, sessions and terms, classes and streams, subjects, grading settings, traits, and student promotion.
- Student records with CSV/XLSX imports and templates; CA/Exam score entry, templates, validation, and imports.
- Computed results, class rankings, student details, broadsheets, exports, and print views.
- PDF report cards for a class or an individual student, with bundled DejaVu fonts and licence.
- A local SQLite database with manual backup and restore; restore makes a safety copy first.
- An Electron/React desktop app, regression tests, and a Windows x64 NSIS installer build.

## Windows GitHub Actions build

The `Windows Desktop Build` workflow runs on pushes and can also be started manually. It sets up Node.js 22, installs dependencies, runs `npm test`, builds the Windows installer with `npm run dist`, and uploads the installer as the `GDSS-Dutse-Windows-Installer` artifact. npm caching is intentionally disabled until a lockfile is committed; this avoids the setup-node failure caused by enabling caching when no npm lockfile exists.

## Step 6 — Students and spreadsheet import

The Students page supports class filtering, global-search matching on student name/admission number, add/edit/delete, M/F gender, optional unique admission numbers, active/inactive state, and moving a student by changing their class. Deletion is confirmed and SQLite cascades the student's linked scores/remarks/ratings.

Student imports support `.xlsx` and `.csv` (comma or semicolon, quoted fields, escaped quotes, UTF-8 BOM). The preview checks duplicate admission numbers across the school and duplicate names in the selected class, plus missing names and invalid genders. Only rows marked `OK` are sent to the import transaction after explicit confirmation. Legacy `.xls` files receive a friendly conversion message. The template is written through the Windows Save dialog; XLSX includes a navy header, frozen header row, M/F dropdown, and example rows prefixed `EXAMPLE:`. Example rows are ignored by the importer so they cannot accidentally become student records.

Tests added in `tests/studentImport.test.ts` cover the Android `CsvStudentParserTest.kt` cases, validation statuses, XLSX template round-trip, and messy XLSX rows. Run `npm test` and `npm run build` in an environment with dependencies installed.

## Step 7B — Excel score template and score import
- Scores has a **Template** dialog for all subjects or one selected subject, with `.xlsx` as the default and `.csv` as an alternative. Templates list all active students and existing scores for the selected class/term.
- XLSX templates use `exceljs`, a wrapped navy header, blue CA and green Exam headers, frozen header and first two columns, wide name/subject columns, and 0–30 / 0–70 decimal validation.
- **Import scores** accepts `.xlsx` and UTF-8 CSV using comma or semicolon delimiters. Old `.xls` files are rejected with a friendly conversion message. Preview happens before saving.
- Matching prioritizes admission number, then case/spacing-insensitive names; ambiguous names require an admission number. Subject score columns support `<Subject> CA` / `<Subject> Exam`, optionally `(30)` / `(70)`. Plain CA/Exam use the currently selected subject. Unmatched subject columns are warned and skipped.
- Blank cells are ignored. The **Replace scores already entered** switch defaults on; turning it off fills only empty score fields. Valid score cells are written in one SQLite transaction and a summary is shown.
- Added CSV parser port tests, XLSX template/validation tests, and a template-fill-parse-SQLite round-trip test in `tests/scoreImport.test.ts`.


## Step 8 — Results & Reports

- Results are computed from saved CA/Exam values at view time; no result totals or positions are stored.
- Class Results includes ordinal positions (ties share ranks and the next rank is skipped), total, two-decimal average, subject completion, class statistics, search, top-three highlighting, and incomplete-score warnings. Students with incomplete subject scores are not ranked.
- Student Detail includes subject CA/Exam/total/grade/remark, trait ratings, class master/director remarks, marks obtained out of subjects × 100, average, and position relative to class size.
- Broadsheet includes students, subject totals, overall total/average/position, a frozen first column, Excel/CSV export, and printing. The PDF button is intentionally not included yet.
- Tests cover tie positions, incomplete scores, and empty results.


## Step 9 — Report-card PDF

- Added the Report-card PDF workspace under **Results & Reports**. Select a class and any term, then generate whole-class reports (alphabetical or position order) or search for a single student.
- Ported the Android `ReportCardPdfService.kt` page layout to PDFKit: A4 portrait pages, school logo/vector fallback emblem, navy/gold frame and banner, student/term details, subject and skills/behaviour grids, summary, typed or handwriting remarks, signature lines and motto.
- Scores, grades, marks obtainable, averages and positions are computed from saved local records. Empty scores remain blank; incomplete students are not ranked; ties share positions. Single-student reports retain the student's whole-class position and class size.
- PDF generation runs in an Electron utility process with progress updates and cancellation. After saving, use Open PDF, Show in folder, or Print. Individual PDFs can be saved to a chosen folder.
- Bundles DejaVu Sans regular/bold fonts and their licence in `build/report-assets/fonts`; packaged builds copy these assets into `resources/report-assets`.
- Added report-card tests for tied positions, incomplete scores, single-student class ranking and multi-file output.

**Verification note:** dependency installation could not complete in this environment, so the full TypeScript build and Vitest suite were not run. Source files were syntax-transpiled with the available TypeScript compiler.

## Step 10 — Release audit and final polish

### Feature audit (Tasks 1–11 and project inventory)

| Feature | Status | Audit notes |
|---|---|---|
| Task 1 — app shell, theme, launcher icon and local project setup | **Kept** | Electron/React shell, navy-and-gold theme, offline-only security policy, Windows icon and installer. |
| Task 2 — login, roles, forced password change and account sessions | **Removed on purpose** | The requested desktop version has no accounts or authentication; it is one local school-management workspace. |
| Task 3 — dashboard statistics and score-entry progress | **Kept — fixed in Step 10** | Live figures and progress now come from SQLite instead of placeholders. |
| Task 3 — Form Master accounts, assignments and password controls | **Removed on purpose** | There is no Form Master dashboard or role/account management in the single-admin offline desktop version. |
| Task 4 — classes, streams, subjects, ordering and copy-to-class | **Kept** | Class streams, subject add/rename/delete/reorder/copy and class-master assignment are local. |
| Task 5 — student records and CSV/XLSX import | **Kept** | Student CRUD, M/F, admission number, active status, class moves, preview and templates are local. |
| Task 6 — sessions/terms, school identity/logo, grades, traits and promotion | **Kept** | Settings persists these records in SQLite; promotion moves active students and preserves past scores. |
| Task 7 — subject-first/student-first score entry and validation | **Kept** | CA/Exam validation, autosave, keyboard navigation, ratings and remarks are local. |
| Task 8 — results, ties, incomplete scores, student detail and broadsheet | **Kept** | Computed results, Excel/CSV export and print are included; totals and positions are not stored. |
| Task 9 — bulk report-card PDF | **Kept** | PDFKit worker, Unicode fonts/licence, progress/cancel, combined or individual files and open/folder/print actions. |
| Task 10 — polish, security, backup, release and tests | **Kept — backup page completed in Step 10** | Local-only CSP/network blocking, SQLite, daily backups, manual backup/restore, release checks and regression tests. |
| Task 11 — Excel score template and score import | **Kept** | XLSX/CSV template, validation, preview, matching, replace toggle, blank-cell protection and one-transaction import. |
| Supabase, Edge Functions, RLS, online sync queue and offline banner | **Removed on purpose** | No backend is used; the local database is the source of truth and the app blocks outgoing network requests. |
| Backup & Data page | **MISSING — fixed in Step 10** | Create a chosen `.db` backup and restore a selected backup after confirmation; a safety copy is made first. |
| First-run setup persistence | **MISSING — fixed in Step 10** | Wizard now writes school identity, session/current term and initial classes to SQLite, not only browser storage. |

### Release identity and data preservation

- Product version is `1.0.0`; the Windows x64 NSIS installer artifact name is configured as **`GDSS Dutse Results Setup 1.0.0.exe`**.
- The bundled `build/icon.ico` is a navy square with a gold graduation cap and is used by the Windows executable and installer.
- The database remains at Electron's stable `app.getPath('userData')/gdss-dutse-results.db` location under the unchanged application ID `com.gdss.dutse.desktop`. An in-place newer-version installation therefore uses the same local database. The NSIS configuration does not delete app data on uninstall. Keep separate backups regardless; uninstall/reinstall and upgrade behaviour still needs a Windows acceptance test before production use.
- Manual backup/restore now uses a Windows file dialog. Before restoring, the app confirms the destructive replacement and creates a safety copy of the current database. After restore the UI reloads the saved records.

### Verification status

The source-level release audit and static regression checks are included in `tests/project.test.ts`. This environment previously could not complete dependency installation, so the complete Vitest suite, TypeScript production build, Windows installer creation, and real Windows upgrade/data-retention test remain **unverified**. Run `npm ci`, `npm test`, and `npm run dist` on Windows (or use the repository's Windows GitHub Actions workflow) before distributing the installer. Do not describe the release as fully build-verified until those checks pass.
