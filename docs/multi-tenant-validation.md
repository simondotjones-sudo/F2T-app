# Release 63 validation — 11 October 2026

Status: implementation and local validation complete; public source publication and production release after hosted checks were explicitly approved by Simon on 11 October 2026. This change is based on `c2f880cc1f6d2fa1c169a53746ac66d0ef1be2d8` in `simondotjones-sudo/eazysafe-LC4`. The original Primark repository, site, database and storage are outside this release.

## Delivered

- Primark client 1 retains this installation's existing data, uploaded course, blue theme and wordmark.
- EazySafe Internal client 2 starts with its own schema, one internal site, EazySAFE logo and red theme. Its learner and course records start empty.
- Global operator: Profile → Clients → add a client, upload its logo, choose an accent colour, edit branding and copy its portal link. Client administrators cannot access this global registry.
- Restricted database roles and separate file namespaces enforce client boundaries. Authentication, reporting, certificates, evidence, settings and scheduled processing use the selected client.
- Default entry is EazySafe Internal. Explicit portal links choose a client; switching clears learner authentication while preserving the global operator session. Stale-tab API calls are rejected.

## Completed verification

- `pnpm test`: the complete suite passed, including 31 course checks, 119 Netlify workflow checks, 30 credit/accounting checks, 19 renewal checks, email, pathways, assessment evidence, lifecycle, feature settings, imports, job roles and training recognition.
- All 13 multi-tenant integration groups passed against local PGlite. Coverage includes all 57 application tables and their foreign keys/functions, existing-data preservation, cross-schema denial, transaction cleanup, reused identities, client-management permissions, clean provisioning, SCORM/certificate isolation, file namespaces, email links, stale tabs, background contexts and password resets.
- Translation checks passed for 1,216 interface/message keys across 14 languages.
- `pnpm build`: production compilation and TypeScript checks passed.
- Browser validation used a disposable local database with the real migrations, a production Next build, local operator credentials and outbound jobs/email disabled. Checked default EazySAFE login, Clients desktop (1,440 px), branding editor and Clients mobile (390 px). Mobile document width matched the viewport exactly; no horizontal overflow and no browser errors.
- Browser flow created a third fixture client, uploaded a logo, selected a purple theme and opened its portal. The selected client and CSS theme matched. Switching back to Primark restored its portal.
- PGlite supports a single database session; only the generated local QA build limited database pools to one connection. This does not change committed application code. Hosted connection pooling is covered separately by role/transaction integration checks, not this browser fixture.

No real emails were sent, and no hosted database migration was applied during these checks. Temporary browser fixtures are not release data.

Hosted preflight: Netlify confirms automatic isolated database branches for pull requests, no user-defined database connection override, and `LMS_BACKGROUND_JOBS`/`LMS_EMAIL_DELIVERY` set to `disabled` in every context. Existing production backups and automatic on-publish backups are enabled. PR #1 is ready for review; its deployment-skip marker has been removed to allow the hosted rehearsal.

## Release gates

1. Review the branch/PR and obtain explicit approval for `main`/production, as required by `AGENTS.md`.
2. Take an EazySAFE database backup before the production schema change. An old application deploy is not a database rollback; any restore requires separate approval.
3. Use only an isolated database for a hosted preview. Confirm that the managed deployment role can create client schemas/roles and grant membership. Local success does not prove hosted permissions.
4. After the approved deployment, confirm migration success, both portal brands, operator access, the existing Primark course launch/resume/certificate and a clean EazySafe Internal client. Keep jobs/email disabled until separately configured and approved.

Custom domains, SSO, shared course distribution and cross-client learner membership are separate future work.
