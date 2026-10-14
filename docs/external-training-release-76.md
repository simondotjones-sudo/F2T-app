# Release 76 — external training and recognised prior learning

Baseline: main `c780133` (Release 75), inspected before implementation.

## Changes

- External qualification records hold learner, provider, title, completion date, explicit expiry/no expiry, reference, optional hours, notes and protected PDF/JPG/PNG evidence.
- External qualifications supply evidence to the existing `training_recognitions` decisions. They do not create a second course assignment, completion, credit or certificate system. Legacy exemptions, RPL and extensions are retained unchanged. New RPL approvals use the external-evidence review flow; the original page retains exemptions, deadline extensions and decision history/revocation.
- Learners can submit and edit pending records when enabled. Organisation, country and site administrators use existing managed-user scopes; platform operators can oversee the selected client. No reviewer may decide their own training.
- Pending, approved, rejected, expired and revoked views; scoped review queue, search, expiry view and CSV export. Immutable approved evidence and retained rejected/revoked records; edits and decisions are recorded in the existing audit trail.
- Original external certificates are labelled as external evidence in the Certifications area. Evidence downloads require an authorised current session and client, use private/no-store headers and check stored hashes.
- Existing RPL now advances pathway stages. Current validity is evaluated at read time; expiry/revocation immediately ceases to satisfy requirements. Historic pathway awards remain accessible, show a warning when no longer current, and retain the recognition/evidence and practical-assessment basis.
- Practical courses accept approved external theory into the existing assessor queue. An authorised assessor with a current course/site grant must carry out and sign off the practical assessment using the existing declaration and evidence workflow. Ordinary approval cannot waive it.
- No SCORM progress, quiz results, theory-completion timestamps or LMS course certificates are fabricated. Genuine subsequent LMS completion still uses the normal certificate pipeline.
- Migration runs under the provisioning advisory lock for public, every client schema and the clean template, with registered tables and restricted runtime grants. Existing valid legacy RPL is reconciled into pathway progression.

## Policies

- External record management defaults on; learner submissions default off. Existing RPL toggle is preserved. Disabling a feature prevents new use without deleting evidence or undoing approved decisions; revocation and historical reads remain available.
- Every approval requires at least one ready evidence file. Five files maximum, each 3 MB. Signature validation and safe filenames reuse the existing upload infrastructure. This is not a malware-scanning service.
- Records start pending, including administrator-created records. Approval is explicit. Pending records can be edited; approved records must be revoked and replaced if their facts or files are wrong. Rejected records remain in history; submit a replacement to resubmit.
- External training can be approved for history only, including already-expired training. Equivalence requires an explicitly selected current assignment and current training. Recognition may be shorter than the external qualification, never longer. No-expiry recognition is allowed only for a no-expiry qualification. Dates are inclusive UTC calendar dates.
- Existing active decisions must be revoked before replacement. An external qualification can support separate explicit decisions against different assigned courses. Automatic title matching is deliberately absent.
- Credits: creating records, reviewing evidence, approving/revoking RPL and practical sign-off do not charge or refund credits. Original assignment charges remain. Valid RPL blocks paid self-renewal and automatic source-certificate refresher assignment. Expiry/revocation restores the existing assignment requirement; it does not create a new assignment. Normal LMS certificate renewal/refresher rules resume when relevant. External certificates themselves never trigger automatic paid refresher assignments.
- Expiry notices use existing email settings, enablement, delivery safeguards and outbox deduplication. External expiry and shorter recognition expiry have distinct event keys; matching expiry dates produce one external reminder. No-expiry records produce no expiry notices. Email still requires the existing production delivery configuration.
- Practical recognition is not a waiver based solely on a third-party certificate: the existing authorised-assessor declaration continues to apply.

## Validation

Integration coverage in `tests/external-training-checks.mjs`, run by the multi-tenant suite, exercises real restricted database roles and migrations with mocked object storage:

- Default-off learner submissions, pending edits, self-approval denial, narrower administrative scope, cross-client access denial.
- Invalid file signatures and oversized evidence; learner/admin/assessor downloads and private response headers; immutable approved evidence.
- Record-only approval, rejected history, safe CSV, audit records and no synthetic course evidence.
- Explicit RPL, stage unlocking, no-expiry recognition, pathway awards with retained basis, expiry evaluation, revocation and preserved historic certificates.
- Practical assessor grant checks, external theory queue, authorised pass, sign-off revocation and absence of fabricated LMS certificates.
- Unchanged credit ledger, paid renewal suppression and existing expiry candidate generation.

The production Next.js build and TypeScript checks passed. Browser component fixtures at 390px and 1440px exercised record lists, RPL review and no-expiry forms with no horizontal page overflow or runtime errors; mobile screenshots were inspected. Fixtures use mocked authentication/header and API responses. Full regression and hosted release results follow below. Tests use only local PGlite and mocked services; no live learner test records or outbound messages are created.

Release validation completed: full `pnpm test` passed, including 51 multi-tenant integration groups and the existing assessment/survey suites. `pnpm build`, `pnpm typecheck` and `git diff --check` passed. Targeted browser checks passed at 390px and 1440px. No production data was used for validation.
