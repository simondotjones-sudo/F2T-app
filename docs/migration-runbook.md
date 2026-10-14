# Fresh database setup — bulk transfer cancelled

## Current status

On 11 October 2026 Simon confirmed that the source is a demo with no real users
to preserve and only one active course. He chose the fresh EazySAFE database path
and uploaded that course through the destination application. No source database
rows or source blob store were transferred by the agent.

The destination is `eazysafe-lc4` (`d79310e0-876d-4b6c-b5bf-a397b3520df9`), at
https://eazysafe-lc4.netlify.app, with release 62 and all original 37 migrations.
The site and database host differ from Primark. The destination's own upload store
now has 415 object manifests, 445 chunks and 445 size entries. File contents,
course publication and learner playback have not been independently verified.

Temporary external-tool production write access was returned to read-only after
the bulk transfer was cancelled. The account-wide CLI grant was approved only for
that transfer; cleanup is recorded in the validation record. Application uploads
continue to use the site's runtime access. Keep jobs and email disabled.

## Current acceptance work

1. Confirm the uploaded course is ready and published, with the intended countries,
   language, induction designation, expiry/refresher rules and assessment settings.
2. Use a disposable learner to verify launch, nested assets, save/resume, completion
   and certificate behavior; use no real email recipients.
3. Review any custom feature policies, credit settings, pathways, job roles, stores
   and artwork to retain. Configure them on EazySAFE instead of importing demo history.
4. Continue the tenant architecture work with Primark as the first organisation.
   No second real client may be added before isolation tests pass.

The original Primark application remains unchanged. The Windows preflight kit and
full-transfer steps below are superseded for this setup.

## Archived bulk-transfer procedure — use only for a future requested transfer

The following is a contingency plan, not an active task or evidence of migration.
Do not route imports through application endpoints to bypass database access controls.

## 1. Establish and verify the destination

- Record the new site ID and database identity privately; compare them with the source
  site recorded in `source-baseline.json`. Abort if either database or site is shared.
- Keep `LMS_BACKGROUND_JOBS` and `LMS_EMAIL_DELIVERY` disabled. Keep Postmark unset.
- Use distinct recovery credentials. Do not transfer hosting, database or API secrets
  in source control, chat or logs. Check team-scoped variables for unintended inheritance.
- Leave the original demo running. Record the export timestamp and source commit;
  later demo edits are not automatically synchronised.
- Protect the destination during import. Scheduled-job guards do not disable writes
  from UI actions, login, learner course listing or SQL triggers. First rehearse using
  an inaccessible destination or a migration freeze enforced before serving the data.

### Migration hold (release 62)

- Set `LMS_MIGRATION_HOLD=enabled` in Functions scope (or all scopes), for every
  deploy context that can serve imported records, and deploy the release containing
  this guard. Confirm the production permalink and main URL return 503 on `/`,
  `/api/prototype?view=me`, `/admin/courses`, and a stored-file route before importing.
- The guard stops interactive routes before handlers run and rejects application
  database/storage access. It overrides job/email switches even if those are enabled.
  Stored-file edge responses are covered separately. Public bundled static assets
  remain accessible. There is no secret URL, header or administrator bypass.
- This is a runtime application hold, not a database lock. It does not stop SQL
  triggers during an import, external clients, old deploy permalinks, or operations
  already in flight. Restrict access to old deploys and allow existing work to finish;
  rehearse and validate trigger effects separately before touching destination data.
- Netlify captures environment values per deploy; changing a variable requires a
  new deploy. Do not open the destination by setting the flag back to disabled until
  the import and sanitisation checks have passed. Keep jobs and email disabled when
  reopening the UI for acceptance checks.
- Revoke temporary destination write access after import. No change to the original
  Primark application, database access controls or storage is needed for this guard.

## 2. Inventory and transfer the database

- Use a supported private database export/import workflow. Compare server versions,
  extensions, schema, sequences, SQL functions, triggers and applied migration ledger.
  Use a consistent snapshot. Do not put dumps into this public repository.
- Reconcile all 57 source tables, including learners, courses/packages/files, assignments,
  SCORM progress, completion history, certificates, pathways, assessor records, evidence,
  audit history, credits, site directory, permissions, job roles and settings.
- Fresh deploys seed Primark reference courses, stores and accounting settings. Do not
  append a full source dump over those seeds: rehearse a clean restore strategy that
  avoids duplicate keys and preserves the migration ledger.
- The sample-completion migration is historical. Do not replay it on an imported
  non-empty database independently of its migration history. Do not edit its checksum.
- Exclude or invalidate sessions, admin sessions, password-reset records, invitation
  tokens, login rate-limit state and recovered hosting-admin credentials. Preserve
  learner password hashes only as an explicit account-continuity decision. Keep a new
  independent configured admin regardless.
- Do not copy queued/sending email work as executable jobs. Preserve delivered email
  audit history if needed, while cancelling pending delivery and expiring invitation
  tokens. Restore notification settings to off and require a deliberate new activation.
- Freeze automatic assignment/refresher/archive/top-up behavior during comparison,
  including SQL-triggered and page-triggered paths. Capture original settings for
  controlled reactivation. Implement this before importing accessible live data.
- Record counts, orphan checks and key aggregates before and after sanitisation;
  explain every expected difference. Validate sequences after import.

## 3. Transfer uploaded assets

Source production store: `primark-files`, in the original site.
Destination production store: `eazysafe-files`, in the new site.

The adapter hashes logical keys. Each object comprises `objects/<hash>` metadata,
`parts/<hash>/<index>` binary chunks and `sizes/<hash>/<index>` chunk metadata.
Copy the complete representation with metadata. A manifest-only copy is not a file copy.

- Inventory all SCORM assets, source packages where retained, practical evidence,
  shot-list photos/thumbnails and other uploads referenced by database records.
- Verify counts, byte lengths and content checksums, including every referenced chunk.
- Confirm playable SCORM entry paths and nested resources, authenticated downloads,
  private evidence permissions, HEAD requests and partial-content/range streaming.
- Do not configure fallback access to the original site's storage. Remove any absolute
  old-host links found in DB content or uploaded packages, or explicitly resolve them.
- Static fonts, branding and chunked chapter-one video are already repository assets;
  `scripts/restore-assets.mjs` checks and restores the video at build time.

## 4. Acceptance and future reconciliation

- Login as the new configured admin and a migrated test learner; old sessions/reset
  links/invitations must fail. No real email may be sent.
- Confirm required training records and certification/renewal dates are preserved.
- Test SCORM launch/resume/completion, assignment/credits, assessor evidence, pathways,
  import/export and role-scoped reporting in the new environment.
- Record changes made in the original demo after the snapshot. Agree configuration
  and content to retain versus disposable test activity before any final transfer.
- Validate backup restoration into an isolated environment. Production recovery uses
  reviewed forward fixes; no automatic source retirement, domain switch or cutover.

Tenant-isolation and the fictional second-client checks follow the architecture plan.
Re-enable each automation only after reviewing copied schedules, historical candidates,
recipient scope and deduplication. Never enable all jobs simply because deployment built.
