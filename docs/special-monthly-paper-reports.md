# Additional monthly paper summary

Status: production migration applied on 11 September 2026; verified on 11–12 September against the current local frontend. No backfill. No commit, push, or hosted frontend release. See [production verification](special-monthly-production-verification.md).

## Inspected current behavior

- Paper Reports page access and its weekly-reset button permit a signed-in user only when `users.role` is exactly `moderator` or `assistant_moderator`. No extra reset-button condition exists. `paper_reports` RLS permits those same roles. Stock transaction mutations use `is_user_manager()`, whose migration definition checks exactly those two roles.
- Generic Product edits are available to authenticated users. The existing paper settings (`qty_per_a3`, `default_paper_type`) and Product-ID renames are restricted to those two roles by the page and database. New reporting metadata uses that paper-settings restriction; ordinary Product edits keep their current permissions.
- Manual Paper Reports use `mdRemarks` → `paper_reports.remark`, labelled หมายเหตุทั่วไป. The same report editor can add/edit that general remark on linked reports.
- Order entry/edit uses `orders.notes`. Dashboard reconciliation does not copy it to `paper_reports`. A linked report checks BOTH its general `remark` and its linked order's `notes`. Either may match. Waste remarks are never eligibility sources. Editing `orders.notes` refreshes only existing captured snapshots.
- The existing weekly reset deletes transactions, deletes `paper_reports WHERE id > 0`, and inserts stock carry-forward balances. It is deliberately unchanged.
- Explicit erroneous Paper Report group deletion uses the atomic source-delete RPC. Dashboard order cancellation requires undoing reconciliation first; both Dashboard handlers are restored to their original implementation, including the OUT-only transaction deletion and source-report cleanup. Neither invokes the snapshot-delete RPC, so monthly usage survives.
- The baseline migration ends by granting broad defaults on new tables, sequences, and functions. The new migration explicitly revokes inherited privileges on every new object. It does not change defaults globally.

## Data and lifecycle

Migration: `supabase/migrations/20260911000000_add_special_job_paper_reports.sql`.

Product metadata:

- `special_monthly_report_enabled boolean NOT NULL DEFAULT false`
- `special_monthly_job_type text NULL`, limited to `business_card` / `brochure`; enabled requires a supported type.
- Seed only CARD → business_card and BROCHUREA4 → brochure. Other Products remain disabled.
- Existing Product audit events now include these fields and detect metadata-only changes.

`special_job_paper_reports` stores generated `id`, unique immutable `source_paper_report_id`, Bangkok `report_date`, controlled `source_kind` / `job_type`, Product ID/name snapshots, actual `paper_type`, nonnegative `paper_used_a3`, and generated `created_at`. There is no raw-note column, editable month, waste column, or source/Product foreign key.

INSERT captures atomically with the source. Explicit Product metadata wins; otherwise a general note match produces `note_matched` / `note_based`. Matching trims/normalizes whitespace, accepts คุณมิ้นท์ / มิ้นท์ / มิ้น, and matches English mint case-insensitively with alphanumeric/underscore boundaries. It does not match peppermint, minting, mint_123 or Mint42. No Product-name inference.

A3 used is exactly `coalesce(good_a3, 0)::bigint + coalesce(waste_a3, 0)::bigint`. A negative resulting total aborts the eligible source insert/update. Target A3 and piece waste are not used.

UPDATE first locks an existing snapshot. Without one, it returns. Existing snapshots follow quantity, paper, Product and general-note corrections; lost eligibility deletes a snapshot. Correcting the Product reclassifies it. Captured Product classification/name remains stable across master-only renames/settings changes. There is no trigger on Product edits that rewrites monthly history. Source ID, capture timestamp and original Bangkok report date remain unchanged.

Order-note reads during source capture/correction take a share lock on the order to serialize with note edits. Independent order-note corrections never write to source reports or insert snapshots.

The erroneous-source-delete RPC accepts explicit Paper Report IDs only and removes corresponding snapshots, source reports and associated stock transactions in one transaction. It only resolves snapshot IDs through currently existing source reports. Weekly reset uses its original raw delete and cannot delete monthly snapshots: there is no DELETE trigger or cascading/restrictive source FK.

The separate `delete_special_job_paper_snapshot(snapshot ID, selected month)` RPC deletes one monthly contribution only. It leaves source reports, orders, Product metadata, and other contributions untouched. Both individual monthly deletion and full-month reset leave a missing snapshot that later source UPDATE cannot recreate.

Monthly reset deletes only `[selected first day, next first day)` from the snapshot table. It cannot affect source reports, other months, Products or weekly data. Later UPDATE never recreates a removed snapshot. Later eligible INSERT can capture normally.

## Permissions and presentation

The aggregate-read/export, protected-detail-read, monthly-row-delete, monthly-reset, and erroneous-source-delete RPCs require `auth.uid()` and `is_user_manager()`. Anonymous callers have no EXECUTE grants. Internal functions cannot be called by anon, authenticated or service_role. Snapshot browser writes and sequence access are revoked. RLS and a narrow column SELECT grant permit eligible users to read only reporting dimensions/measures; source/Product IDs and raw notes are not browser-readable. The protected `get_special_job_paper_details` RPC additionally returns the snapshotted Product name, date, paper, A3 and classification, plus an internal snapshot ID for deletion. It filters by month/category/paper and uses keyset pagination. Product names are not granted via direct table SELECT and are not available to anonymous or ineligible callers.

The compact section sits outside the weekly empty-state condition, so retained monthly history remains visible after weekly reset. The page's existing access gate controls visibility. Export re-reads the selected month through the authorized RPC instead of trusting cached UI data. Reset confirmation focuses Cancel and refreshes only monthly state.

The aggregate UI and Excel show job category, actual paper type and total A3 only, grouped by category + paper type. Note-based Products sharing a paper type aggregate together. No waste, piece counts, Product identifiers/names, raw notes, lots or employee details are exported. The Excel file contains the selected month, matching grouped rows and a final total, using existing ExcelJS/file-saver dependencies.

The non-destructive ดูรายการ action opens an inline contributor panel. It uses a table on desktop and readable cards on mobile. Each contributor displays its saved Product name without looking up the live Product, Bangkok report date, paper type, total A3, category and a delete button. Confirmation uses text (not HTML interpolation) and defaults focus to Cancel. Deleting refreshes monthly aggregates/details only. Full-month reset remains a separate action.

## Validation and release

- `npm test`: feature UI/Excel tests, existing Product/order/paper metric suites, and direct regression execution of existing manual calculation, weekly calculation/reset and Excel functions.
- `node scripts/test-special-monthly-db.mjs`: real migration/trigger/RLS tests in a disposable database on the fixed local socket `/tmp/printer-special-monthly-socket`, port 55439. The runner never reads application environment files or connects to production. The fixture loads current relevant baseline tables, policies, Product protections and audit definitions; Supabase auth claims are represented by local functions. It is not a full Supabase deployment test.
- `scripts/qa-special-monthly-browser.mjs`: actual React components and extracted current Dashboard handlers, with a synthetic in-memory Supabase adapter; 1440×900 and 390×844. This browser fixture is separate from the real local PostgreSQL tests and does not access production records. Screenshots/results are saved under `/tmp/printer-monthly-browser-qa`. Provide `PLAYWRIGHT_MODULE_PATH` when Playwright comes from the bundled workspace runtime.
- `npx tsc --noEmit`, `npm run build`, targeted ESLint and `git diff --check`.
- Existing lint findings in the original pages are unchanged from HEAD. The Dashboard production file now matches HEAD exactly. New feature/test files pass targeted lint.

Release the migration and matching frontend together. Existing individual-delete/Product settings writes now require the new RPCs/columns. Migration creates its insert trigger last, within the same transaction as metadata setup. Do not deploy the frontend alone. Production database application and verification are now complete; hosted frontend release remains pending the user’s separate release instruction. Never copy retained reports into the new table.

Existing stock writes around manual saves/reconciliation are still separate requests; only the source report/snapshot pair (and the new individual-delete RPC) is atomic. This change does not refactor that pre-existing stock workflow.
