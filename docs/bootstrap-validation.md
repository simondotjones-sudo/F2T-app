# Bootstrap validation — 11 October 2026

## Source and change boundary

- Verified source: Primark release 60, commit `a7fdd6af055aa8e5a2e8020d22e92896153ac6f9`.
- Netlify published that commit successfully at `2026-10-11T08:53:07.253Z`.
- All 463 original tracked files retained; 37 migration checksums unchanged.
- Changed runtime behavior: default-off scheduled job gate, separate email activation
  switch, EazySAFE storage namespaces, package name and bootstrap version 61.
- Primark UI, dependencies, lockfile and application workflow implementation retained.
- Original repository and Netlify deployment were read only throughout this work.

## Checks completed

- Frozen-lockfile installation succeeded.
- `corepack pnpm build` succeeded, including TypeScript, static generation,
  restored-video checksum verification and the bundled storage edge function.
- All 20 test suites passed across the initial run and resumed/rerun suites after
  correcting inherited test fixtures. No claim is made that the initial test command
  passed without interruption.
- New bootstrap checks exercised all five job handlers: no database work by default,
  no processing in previews/local contexts, explicit production activation required.
- Email checks verify the original project's switch cannot enable this installation.
  Existing password recovery and notification suites pass with the new switch.
- Storage checks verify new namespace selection with the current site's runtime identity.
  Existing streamed-file and assessment-evidence integration checks pass.
- Regression coverage includes 31 course checks, 119 Netlify migration checks,
  30 accounting checks, translations, expiry/renewals, assessor controls, pathways,
  lifecycle/audit, bulk imports, email, evidence, features, job roles and RPL.
- Three test-only portability corrections: explicit dated fixtures for credit sorting;
  UTC instant assertions for pathway deadlines; explicit UTC RPL deadline fixture.
  No application reporting/deadline logic was changed to satisfy those tests.
- Staged-file inspection found no database dumps, local environment credentials,
  `.netlify` link state, node_modules or generated Next output. A targeted scan found
  no private keys, GitHub tokens, credentialed Postgres URLs or AWS access keys.
- Original source whitespace at nine file endings was retained; no new whitespace
  issues were introduced. This does not affect build or runtime behavior.

## Limits / next gates (bootstrap record; superseded where noted below)

Local validation ran under Node 24.19.0; Netlify remains configured for Node 22.
The new site `d79310e0-876d-4b6c-b5bf-a397b3520df9` deployed release 61 successfully
on Node 22. Deploy `6acb587ad67e57bd0753d454` applied all 37 database migrations.
The subsequent configuration deploy `6acb5e27200ed9e818943771` published at
2026-10-11T10:01:24.917Z from commit `b55c8c3e143001fc4bd1c7e9e5a6c6fefbedfaf8`.
Homepage, unauthenticated session and store-directory endpoints returned 200;
the configured-admin check passed and the administrator confirmed successful login.

No live database or uploaded asset counts have been inspected or reconciled. No live
records/files were copied, no email was sent and no background jobs were enabled.
This source release does not implement multi-client isolation or SSO. See the
architecture proposal and migration runbook before importing data or adding tenants.

## Release 62 migration preparation

- Added an explicit, default-off migration hold at the HTTP, database, storage,
  scheduled-job and email-delivery boundaries. No import endpoint or access-control
  bypass was added. No schema migration changed.
- The expanded bootstrap suite passed: hold overrides enabled jobs/email, denies
  cached database and transaction access, blocks stored-file handlers before their
  application call, returns uncached 503 responses (including HEAD), and resumes
  normal behavior when disabled. It also checks Netlify runtime-variable precedence.
- Production build and TypeScript validation passed locally.
- Source Netlify deployment remains the original recorded release-60 commit. The
  source `primark-files` store was visible with `objects`, `parts` and `sizes` folders.
  Detailed row/object inventories and database-identity comparison remain pending.
- CLI status reported `NOT_LOGGED_IN`. The supported CLI authorisation screen asks
  for team-wide project-management access. Automatic approval review rejected the
  attempted authorisation handoff as broader than this migration's existing scope.
  Explicit approval of that scope is required before trying it again. No grant was
  accepted, and no token was extracted from browser or local configuration files.
- The destination's production database control currently allows external tools
  read-only access. Any temporary import write permission must be explicitly scoped
  to this destination and removed when the transfer is complete.
- The hold must be enabled and verified on the hosted deployment, and older deploy
  access addressed, before private data is imported. No live transfer was performed.

## Fresh database decision and access cleanup — 11 October 2026

This section supersedes the earlier pending-transfer and access-status notes.

- Release 62 deployed successfully as `6acb63d977415900080c13bb`, from commit
  `5a1a2e1bb175c3db85244567433d2d42d206d2ab`; no migration was added.
- Simon explicitly approved account-wide Netlify CLI authorisation for the transfer
  and temporary external-tool writes to EazySAFE's production database. Both were
  enabled successfully. Official CLI status confirmed distinct source/destination
  database hosts and the same 37 applied migrations, with none pending.
- The workspace's direct database connections failed with `getaddrinfo EAI_AGAIN`.
  Simon's Windows TCP checks passed for both hosts. No rows were exported/imported;
  temporary connection-detail files were removed. A read-only Windows preflight kit
  was prepared, but is no longer required under the new scope.
- Simon then confirmed there are no real source users to migrate and only one
  active course to retain. He adopted the fresh EazySAFE database approach and
  reported uploading the course directly into EazySAFE.
- A read-only inventory of the destination's `eazysafe-files` store returned
  415 object manifests, 445 chunks and 445 chunk-size entries (1,305 total).
  The source inventory before the scope change had 607/698/698 respectively.
  Equality is neither expected nor claimed: no bulk source-store copy was made.
- This verifies uploaded storage entries, not their contents, complete course
  processing, publication, or SCORM playback. Browser credential-protection
  restrictions prevented inspection of the app's course-admin screen. Launch,
  resume, completion and certificate acceptance remain pending.
- EazySAFE's external-tool production write option was unchecked and saved back to
  read-only. The transfer-only Netlify CLI authorisation was revoked; the authorised
  applications list no longer contains Netlify CLI. Existing Netlify MCP access
  remains in place. Source access controls and data were not changed.
- No application code, migrations, live training records, email or scheduled-job
  settings were changed for this scope update. Migration hold was not activated.
- Tenant architecture remains a proposal. A fresh database does not itself provide
  tenant isolation; no second real client should be added before the required tests.


## Dummy learner certificate check — 11 October 2026

- Simon confirmed the uploaded course opens and saves progress in EazySAFE, then
  explicitly requested completion for the dummy learner `markpenney@easysafe.com`
  so he can inspect the certificate. This is user-reported playback evidence.
- Added `20261011160000_eazysafe-dummy-learner-completion`, a destination-only DML
  migration. It matches that exact email case-insensitively and requires one active
  published assignment with its original ready package. An absent target is a
  logged no-op for fresh installations. Ambiguous or ineligible targets abort.
- The migration retains existing resume data, scores, learning time and completion
  timestamps, completes remaining lessons, invalidates this dummy course's open
  launches, and calls the existing certificate function. Quiz and assessor gates
  remain enforced. Audit events explicitly identify a dummy certificate test,
  not actual training. No assessment scores or assessor declarations are invented.
- The same transaction asserts complete lessons, completed assignment/theory and
  exactly one active certificate. SQL notices distinguish an absent target from
  `EazySAFE dummy completion verified: one learner, one course assignment, all lessons complete, one active certificate.`
- Local PGlite verification against all 37 existing migrations passed: exact email
  (including rejecting the similar `eazysafe.com` domain), unique assignment,
  active learner, ready package, quiz/assessor guards, versioned certificate,
  audit reason, preserved evidence, unchanged credits and unrelated records, and
  idempotent replay. The application release remains 62; this is a data update.
- Certificate appearance remains Simon's acceptance check. No source project,
  external-tool database permissions, CLI authorisation, email or job settings
  are changed by this update.

- Production deploy `6acb6fd0104cd90008066a3e` published commit
  `ceb365618f86d2908b92a5553f2c6caf9fcbe718` at
  `2026-10-11T11:16:41.964Z`. Netlify reports the new migration as applied
  successfully to the production database branch. Its deploy log does not expose
  the SQL notice or row counts; direct post-update learner/certificate inspection
  remains with Simon. This is deployment confirmation, not a claimed UI check.
