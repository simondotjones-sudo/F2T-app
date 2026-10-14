# Release 79 — HR / payroll integration

Baseline: Release 78, main `22fee58a88353762e8deb73ca4f0a675fc79c11c`.

## Delivered

- Versioned tenant-scoped HR API for starters, updates, explicit leavers and rehires. Stable existing employee/workday ID matching preserves leading zeros and training history; email is never an identity match.
- Active site, department and job-role reference endpoint. No ability to create or grant administrator access; administrator accounts require manual management.
- Maximum 25 events / 100 KB per request, per-row outcomes, validation-only preview, tenant-wide event idempotency, stale-effective-date protection and 60 requests/minute per credential.
- Future-date queue with cancellation, failed-event retry, revalidation at execution, and five-minute production-only scheduling. Revoked/expired credentials and disabled features pause processing. Up to 25 due events per client per run; revoked keys do not block other keys' queues.
- Existing learner lifecycle, session revocation, audit triggers, course-credit and pathway assignment functions remain authoritative. Transfers retain outstanding assignments and learning evidence. Pathway assignment failures are reported separately.
- Database-enforced payroll ownership of identity, site, role, department and employment dates, with explicit admin release. Emergency account archiving remains available.
- Organisation/client-platform Integrations page: credentials, sync history, latest successful sync, managed employees, downloadable provider guide. Credential secret displayed once; hashed storage, one-year expiry, rotation and revocation. No plaintext credentials in logs or audit events.
- Off-by-default feature toggle and feature-aware navigation. Main UI labels use the existing language dictionaries. Desktop pill navigation grows to fit labels; mobile navigation scrolls within its own strip.

## Migration and activation

Apply `20261012220000_hr-integrations` before serving this version. It adds two empty tables (`hr_credentials`, `hr_events`), `learners.hr_managed`, and a field-ownership trigger in public, lms_template and every existing client schema under advisory lock 62111700. Tables are registered for new-client provisioning. Only each client's runtime role receives access. No learner data or credentials are copied into the template.

Enable HR & payroll integration and Joiner, mover and leaver handling for the selected client. Create a credential through Integrations and share it securely with the authorised payroll integration owner; share `/hr-api-guide.md` as the provider guide. No credential has been created in production by this work.

Future changes use UTC dates, from midnight on the effective date, and require the existing production `LMS_BACKGROUND_JOBS=enabled` switch. New accounts have no API-supplied password: use existing password recovery or configured SSO. Employees without email require a supported activation method. No outbound mail is sent synchronously by these endpoints.

## Validation

Production build and TypeScript compilation passed. Test coverage includes preview without writes, starter/replay/conflicting event IDs, manual overwrite protection, updates/audit attribution, leaver session removal, rehire identity retention, future and due-event handling, cancellation/release, stale dates, row-level failures, administrator exclusion, malformed dates/privilege injection, token rate limits, rotation/revocation and empty templates.

The regression run required updating fixed expectations from five to six background jobs, 30 to 31 features, and 77 to 79 tenant application tables. Cross-client tests exercise actual tenant roles, reject a client 1 credential in client 2 and deny direct cross-schema credential reads. Tests use isolated PGlite databases; no production records were modified.

Local Chromium could not launch because the environment blocks required socket access. Hosted visual checking remains required; prepared browser fixtures were not reported as passing.

## Hosted smoke check

1. Enable the feature in a test client and verify Integrations appears only for organisation/client platform admins. Check desktop pills, mobile widths and key copy display.
2. Create a credential. Run reference and dryRun requests; verify no learner is created by preview. Apply a test starter and resend the same eventId: one learner, one applied event.
3. Verify site/job-role changes trigger existing training rules and keep completion history. Try manual details editing while payroll managed.
4. Schedule a future update; cancel one event and let another run with production jobs enabled. Verify UTC timing, retry and credential pause behaviour.
5. Apply a test leaver and verify login/SCORM access stops. Rehire and verify the learner ID and training history remain.
6. Rotate then revoke the credential; verify the prior secrets are rejected. Attempt access using another client's slug.

## V1 boundaries

Client payroll providers still need an outbound connector. No payroll-specific connector, scheduled CSV ingestion, training-status export or webhook is included. Employee events must be sent in order; same-day sequence is the provider's responsibility. Future starters must be applied before sending their follow-on updates. Existing administrators require manual handling.

Main/production release requires Simon's explicit approval under AGENTS.md.
