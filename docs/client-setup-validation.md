# Release 64 — client setup wizard

Built on Release 63 (`1fa5c15762f93d63ac948d71a886cbad82c9f7c6`) in `simondotjones-sudo/eazysafe-LC4` on 11 October 2026. Build and branch/PR preparation were requested by Simon. Production release requires separate approval under `AGENTS.md`; the earlier approval was specifically for Release 63.

## Delivered

Global operator → Clients → Add client opens six steps: branding, sites/departments, first administrator, registration, features and review. Provisioning creates all records atomically. A request ID makes a repeated submission safe; changed payloads and duplicate portal addresses are rejected.

The first administrator has organisation access only in the new client, no global or client platform-admin grant. A private activation link expires after seven days, is single-use, is bound to that client and requires a password of at least 16 characters. The operator can replace an unused link from the client card; replacement invalidates the previous link. No invitation or activation email is sent.

New clients default to administrator-provided accounts. If self-registration is enabled, the operator sets a registration code and chooses the employee-ID label and whether it is required. Departments are optional and do not grant permissions. Organisation administrators can maintain registration and departments afterwards; department archival preserves existing assignments. User Details can assign or change a department.

Feature availability is explicit. Enabled features start as optional; disabled features remain unavailable until the platform changes their policy. If credits are enabled, the chosen amount is both each site's opening balance and its 28-day top-up target. Course content is not copied into the client.

Existing clients retain their registration codes, open registration and required employee IDs. Primark retains the Workday ID label. The additive migration covers all existing client schemas plus the clean template; the application table inventory grows from 57 to 59. It also adds department references to learners and setup metadata to the global registry.

## Verification

- Full `pnpm test` passed, including all existing workflow checks and 22 multi-tenant integration groups on local PGlite.
- Nine new integration groups cover migration preservation/permissions, operator and same-origin authorization, input validation, complete provisioning, idempotence, atomic rollback, activation replacement/client binding/password strength/replay, registration settings and department isolation, archived departments, required IDs and stale settings.
- `pnpm build` passed production compilation and TypeScript checks.
- Translation coverage passed for 1,307 interface/message keys across 14 languages, including placeholders and RTL.
- Browser access to the local server is unavailable (`ERR_CONNECTION_REFUSED`). The authenticated wizard has integration and source review coverage; a live operator walkthrough is still required on the hosted preview.

All integration fixtures are local. Email delivery and scheduled jobs remain disabled. The original Primark repository, site, database and storage are outside this work. Custom domains, SSO, shared courses and outbound email setup remain separate work.

## Hosted release gate

Use the PR's isolated Netlify database preview to apply `20261011180000_client-setup` through the normal deployment. Confirm the existing clients' public registration configuration and authorization boundaries. Then review the complete wizard while signed in as the global operator before approving a release to `main`. Do not apply hosted SQL manually or use a preview that shares the production database. Automatic production backups are already enabled.

## Hosted rehearsal — 11 October 2026

PR #2: https://github.com/simondotjones-sudo/eazysafe-LC4/pull/2

Preview: https://deploy-preview-2--eazysafe-lc4.netlify.app

Initial hosted build `6acb87fc60060400081e613c` succeeded on commit `4ebbab0d6a2bb7c1aeed560170088fbca3d0bf11`. Netlify confirmed one database migration applied to the separate `feature/client-setup-wizard` database branch. GitHub's Netlify preview check passed.

Hosted HTTP checks passed: both existing clients return their preserved public registration settings (Primark uses Workday ID, EazySafe Internal uses Employee ID; both retain required IDs and open registration); neither response discloses the registration code; responses are private/no-store. Anonymous setup, administrator activation and registration-management requests return 403. A stale client-selection header returns 409.

Browser inspection confirmed the EazySAFE login page renders correctly with the dynamic employee-ID label. Opening `/admin/clients` redirects to the operator login with its return path preserved. No operator credentials were available in this browser, so authenticated wizard interaction remains a user acceptance step. No real client or account was created in the hosted preview.

A follow-up UI polish changes the missing activation-link message to direct the user to the platform administrator; it also makes a null activation request return the existing validation error. Translation coverage and the production build pass after this polish. Final preview deployment status is recorded on PR #2.
