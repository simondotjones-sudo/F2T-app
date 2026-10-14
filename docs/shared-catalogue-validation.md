# Release 65 — shared course catalogue

Requested and approved for direct release to main by Simon on 11 October 2026. Baseline: Release 64, commit 307734c. No staging branch or preview database is used for this release.

## Behaviour

Global operator: Clients → Shared catalogue. Select a master course from a client's existing course library, publish a catalogue version, then make it available to selected other clients. The existing course editor and SCORM uploader remain the master authoring workflow. Availability creates a local, published course with an empty audience; it never enrols learners. Organisation administrators and managers use the existing assignment workflow.

Each published release freezes selected course content, the ready package and its validated file inventory. Source learner information and audience selections are excluded. Only the global operator can publish, distribute, update or withdraw availability. Client platform administrators do not acquire cross-client privileges.

Client courses retain their own assignment rules, deadlines, validity, assessor requirement, refresher rules, induction designation and credit policy. Updates replace content for future assignments without retraining existing learners. Existing assignment snapshots, package identifiers, progress and certificates are retained. Initial course delivery uses master defaults for deadline, validity and assessor requirements; these can then be configured in the destination's existing course editor. No cross-client refresher identifiers or induction designation are copied.

Withdrawal blocks all new assignments and renewals through the database assignment function. Manager course selection hides withdrawn courses. Existing assigned learners retain their content and historical evidence. Re-enabling availability is explicit. Existing pathways containing a withdrawn course require administrator review; withdrawal does not rewrite pathway definitions.

Storage is read-only shared content: the destination receives its own package/file records and an immutable mapping to the source package. A tenant-local authorised launch and validated file path are required before issuing the storage key. No new storage bucket, public URL or cross-client learner query is introduced. Source package bytes must remain retained while distributed courses reference them; this release provides no package deletion operation.

## Database

Additive migration 20261011190000_shared-catalogue adds three tenant-local tables to every existing client and lms_template, under provisioning lock 62111700. The schema inventory becomes 62 tables. Published releases and package mappings are immutable. Subscription changes enter the existing audit log. All application data operations retain restricted tenant roles; privileged access is used only for the active client registry after global operator authentication. Source reads finish before destination transactions begin.

## Verification

- Targeted integration suite: 27 groups passed in local PGlite, including five new shared-catalogue groups.
- New coverage: operator-only access and same-origin checks; immutable/idempotent publication; distribution without assignment; stale retry protection; version updates preserving local policies and assignment snapshots; withdrawal blocking manual assignments and renewals; existing learner content after withdrawal; cross-client launch rejection; restoration of availability.
- Full `pnpm test` passed, including 27 multi-tenant integration groups.
- `pnpm build` passed production compilation, TypeScript validation and route generation.
- Translation coverage passed for 1,326 interface/message keys across all 14 languages.
- Browser visual automation was unavailable locally because the Chromium executable is not installed. Authenticated hosted UI acceptance remains in the planned client testing.
- No real learner, course, catalogue release or client entitlement is created by the tests.

Email, scheduled processing and SSO configuration remain unchanged. Authenticated hosted acceptance is part of EazySafe's planned end-to-end testing.
