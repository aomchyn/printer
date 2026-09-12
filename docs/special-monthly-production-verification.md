# Monthly Paper Reports production verification

Verified on 11–12 September 2026 (Asia/Bangkok). Repository: `aomchyn/printer`.

The approved database migration is applied. The current local frontend was tested against production Supabase. No hosted frontend release, commit, or push was performed.

## Deployment and verification results

| # | Requested verification | Result |
|---|---|---|
| 1 | Migration apply | Applied only `20260911000000_add_special_job_paper_reports.sql`. CLI dry run listed this migration alone; apply reported no unrelated migrations, seeds, or roles. |
| 2 | Live version | `20260911000000` appears exactly once in production history. |
| 3 | Product metadata | CARD: enabled/business_card. BROCHUREA4: enabled/brochure. Every other Product remains disabled. Immediately after migration, a hash of every pre-existing Product field matched the baseline. CARD/BROCHUREA4 names and original settings still match. |
| 4 | RLS and grants | RLS enabled. Only authenticated users have the narrow reporting-column SELECT grant, subject to manager RLS. No PUBLIC/anon/browser table mutation grants. Protected RPC execution is granted to authenticated only, with database role checks. Internal functions are not browser-callable. |
| 5 | Capture | NEW CARD and BROCHUREA4 reports captured with Product classification. Explicit metadata overrides matching notes. No retained historical reports were copied; initial snapshot count was zero. |
| 6 | Note matching | Thai คุณมิ้นท์ / มิ้นท์ / มิ้น and Mint / MINT / mint captured. Whitespace normalization verified. peppermint, minting, mint_123, Mint42 and unrelated notes did not capture. Manual remark and linked orders.notes were tested separately. |
| 7 | A3 | good_a3=8 plus waste_a3=2 produces exactly 10 A3. Two different note-based Products contributed 10+6=16 to one paper/category group. target_a3 was not used. |
| 8 | Cancellation | Live rollback-only test exercised source cleanup, undo reconciliation field changes and normal Order cancellation against existing production hooks. Snapshot and 10 A3 remained. Dashboard handlers match the original code. |
| 9 | Erroneous source deletion | Dedicated RPC removed the synthetic source and its matching snapshot. Unrelated snapshots remained. |
| 10 | Weekly reset preservation | Safely scoped synthetic source deletion exercised the production source-delete semantics and preserved monthly snapshots. Complete weekly reset regression ran locally; legitimate production reports and stock balances were never reset. |
| 11 | Monthly contributor deletion | Actual browser action reduced note group 16→6 and month 58→48. Five source reports and the linked Order remained. Assistant_moderator then deleted the remaining 6 A3 contributor, leaving month total 42. |
| 12 | No recreation | Real authenticated source edits after browser contributor deletion and month reset did not recreate snapshots. Live rollback tests also covered later note matches and order-note corrections. |
| 13 | Full-month reset | Assistant_moderator reset synthetic January 2091 through the UI. January became zero; February retained 5 A3. All five sources and the Order remained. |
| 14 | Protected detail | Actual UI displayed Bangkok date, saved Product name, paper, total A3 and classification. Live rollback test renamed a synthetic Product and verified the original saved name remained in the detail RPC. No raw note, LOT, employee or source-report identifier was returned for display. |
| 15 | Excel | Actual browser exports as moderator and assistant_moderator were parsed with ExcelJS. Three requested columns, January only, grouped values and totals 58/48 verified. No Product names/IDs, raw notes, source IDs, LOT or waste fields. |
| 16 | Moderator | Real Supabase Auth sign-in; summary/export, detail, monthly delete, month reset and erroneous-source-delete RPC authorization passed. Browser export and contributor deletion passed. |
| 17 | Assistant moderator | Real Supabase Auth sign-in; the same RPC permissions passed. Browser export, contributor deletion and populated full-month reset passed. |
| 18 | Operator / user | Real Auth sign-ins denied protected RPCs with 42501. Both actual Paper Reports pages showed Access Denied. Anonymous access was denied. Direct snapshot writes and direct Product-name-column reads were denied for all tested browser roles. |
| 19 | Desktop | Actual local Paper Reports route at 1440×900: successful summary, selector, groups, contributor details, export and confirmations. Document width=1440; no horizontal overflow. |
| 20 | Mobile | Same route at 390×844: readable contributor cards, long Product names, Cancel and confirmed deletion. Document width=390; no horizontal overflow. |
| 21 | Console/network | Zero console errors, page errors and unhandled rejections. All 24 recorded monthly HTTP responses succeeded; no recorded HTTP response was 4xx/5xx. One fetch interruption was recorded during role-switch navigation; its cause was not captured, so this is not a claim of zero transport interruptions. |
| 22 | Regression | Existing Paper Reports, Product, order/cancellation, paper/waste and export regression suites passed. Live rollback tests verified legitimate source-report and Order hashes were unchanged. Product hashes matched immediately after migration. Production activity continued during verification; final weekly totals are not expected to equal the initial snapshot. |
| 23 | Cleanup | Zero synthetic source reports, monthly snapshots, Orders, Products, public profiles, Auth accounts and QA business-audit records remained. Temporary frontend/proxy and disposable local PostgreSQL processes were stopped. Browser tab closed and viewport reset. Platform operational audit history was not treated as business fixture data. |
| 24 | Final monthly count | **0 rows: 0 legitimate captured rows and 0 QA rows at final readback.** Existing retained reports remain uncaptured. Final source Paper Reports count was 104 (1,182 good A3 + 15 waste A3); concurrent normal activity was preserved. |
| 25 | Tests/build | 328 tests / 30 files passed; 124 disposable local PostgreSQL checks passed; 42 live lifecycle checks passed and rolled back. TypeScript, production build, targeted feature ESLint and git diff --check passed. Existing lint findings in original pages remain outside the feature changes. |
| 26 | Git | No commit or push. Paper Reports and Product pages remain modified; feature components/helpers/tests, migration and documentation remain untracked. Pre-existing `.codex/` untouched. Dashboard production file matches HEAD. |
| 27 | Defects/limits | No feature security or data-integrity defect was established. Two harness issues were corrected (required Order actor context and invalid negative snapshot test ID). See live-data reconciliation and release scope below. |

## Exact deployed functions

- `get_special_job_paper_month(date)` — grouped summary and export source.
- `get_special_job_paper_details(date, text, text, bigint)` — protected contributor detail; internal snapshot ID supports deletion/pagination.
- `delete_special_job_paper_snapshot(bigint, date)` — single monthly snapshot only.
- `reset_special_job_paper_month(date)` — selected month only.
- `delete_paper_reports_individually(bigint[])` — explicit erroneous source deletion plus matching snapshot cleanup.
- `capture_special_job_paper_report()` and `sync_special_job_paper_report(paper_reports, text, boolean)` — atomic INSERT capture and existing-snapshot-only correction.
- `correct_special_job_order_note()` — existing snapshot correction from orders.notes.
- `special_monthly_note_matches(text)` — deterministic matcher.
- `protect_special_monthly_product_fields()` — metadata field protection.

The action guard is `auth.uid()` plus `is_user_manager()`, which reads stored `users.role` and accepts exactly moderator or assistant_moderator. Tests used real Supabase Auth sessions for four disposable QA accounts. Service-role credentials were confined to server-side QA account setup/cleanup; the tested frontend used the normal public client and authenticated sessions.

## Live-data reconciliation

Production remained active. The first post-migration hash of all original Product fields matched the pre-deployment hash exactly. Later checks detected an independently audited default-paper edit to an existing Product, plus a new Product and its subsequent configuration. A read-only reconstruction using the audit trail, excluding the newly created Product and restoring original audited fields in the query only, matched the original complete Product hash. No production edit was reverted. CARD/BROCHUREA4 original fields remained unchanged.

Synthetic database lifecycle checks ran inside a transaction ending with ROLLBACK. Browser fixtures used explicitly marked negative source IDs and isolated January/February 2091 months, then were removed by exact identifiers. No legitimate weekly reset or full-month reset was performed.

## Release scope and evidence

Database capture is active. Hosted frontend deployment remains pending: the user requested no commit or push. Browser QA used the actual current local production build against production Supabase, with a loopback test-session bootstrap and observational error/export instrumentation; it used no mocked reporting API.

Migration SHA-256: `afa501c325f37e40049ace801ee6c5f0df2abdb140c54c78de7630fffc9c30ab`.

Sanitized local verification results are in `/tmp/printer-production-verification/`: `postapply.json`, `lifecycle.json`, `auth-results.json`, `browser-results.json`, `excel-results.json`, `browser-source-check.json`, `browser-reset-check.json`, `cleanup.json`, `auth-cleanup.json`, `reconciled-product-check.json`, `final-live.json`, and test/build logs. Temporary account credentials were removed with the QA account manifest. Actual synthetic Excel exports are retained there for review.
