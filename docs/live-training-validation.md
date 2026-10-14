# Release 66 — Live Training

Built on Release 65 (bcb2b9b57845f96a868d84681181117d7255b1d7). Simon approved the proposed live-training workflow on 11 October 2026, following the instruction to build and release to main without a staging branch.

## Operator and client workflow

Platform Admin → Settings → Learning → Live Training. This new feature starts Disabled for existing clients and in the clean template; the platform chooses Optional/On or Required for each client. Organisation admins can switch an Optional feature on or off. New training, session creation/changes and assignments require the feature. Attendance correction, reporting, existing learner access and issued certificates remain accessible when it is switched off.

Organisation admins and client/global platform admins use Live Training in the navigation:

1. Training: create or edit title, description, trainer, certificate policy and optional validity in months.
2. Sessions: create a webinar with an HTTPS meeting URL, or a classroom session with a location. Multiple sessions can reference one training item. Dates use an explicit IANA timezone; ambiguous/nonexistent daylight-saving times are rejected. Future sessions can be edited or cancelled with a reason.
3. Assign a session to individual learners, sites, departments, job roles or all active learners. Selection is explicit; there is no ongoing auto-assignment rule. Existing enrolments are not duplicated. Administration-only, archived and departed accounts are excluded. Live training never calls the course-credit assignment function or changes credit balances.
4. Attendance: after the session ends, record attended or absent, individually or in bulk. Cancel assignments with a reason; restore a cancelled assignment before the session ends. Corrections require a reason and retain an audit record. Stale revisions and partial batches roll back.
5. Evidence: upload up to five PDF/image attendance files, up to 3 MB each. Files have validated signatures and safe filenames. Only organisation/platform admins can access attendance sheets because a sheet may contain learners from multiple sites. Storage is client-specific and preview-aware.
6. Reports: organisation, country and site scopes follow current administration rights. Filter by learner/training search, country, site ID and status; attendance also filters by session. Counts and CSV reflect the displayed selection. Results are limited to 1,000 with an explicit warning to refine filters. CSV cells protect formula prefixes.

## Learners and certificates

Sessions appear in My Courses (All, To Do, Completed and Certifications as appropriate), with the description, trainer, start/end times and timezone. Calendar downloads use UTC event times, stable client/enrolment UIDs, escaped/folded ICS text and a client-bound application link. Downloads require the assigned learner and exclude cancelled sessions.

Join webinar opens from 30 minutes before the start until the session ends. The endpoint independently checks the current learner, assignment, session state and time window. The link does not record attendance or completion. Cards refresh every minute while mounted.

Confirmed attendance awards a certificate only if the enrolment's frozen policy requires one. Certificates preserve learner/training/trainer snapshots, duration, completion time and expiry. Print/Save PDF uses client branding. Certificates require the learner or an appropriately scoped administrator; they are not public bearer links. Attendance corrections revoke existing certificates and retain them; a later attended correction issues a new certificate. Database triggers prevent rewriting assignment snapshots, issued certificate evidence or uploaded-evidence metadata.

## Email readiness

Live training assigned, 24-hour reminder and cancellation templates integrate with the existing preview/outbox/worker. Candidate eligibility rechecks session/assignment state, learner eligibility, the Live Training and email feature flags, per-template settings and activation cutoffs. Schedule revisions produce distinct events and stale pending notices cease to qualify. Messages use client-bound My Courses links and explicit session timezones.

This release does not enable Postmark, delivery, scheduled jobs or SSO. Existing meetings are created in Teams/Zoom/Google Meet/etc. and linked into the LMS; automatic meeting creation and provider attendance imports are not included. Learner self-booking, capacity limits and waiting lists are not included.

## Schema and verification

Migration 20261011200000_live-training adds five tables in public, every existing client schema and lms_template, under provisioning lock 62111700. The schema inventory grows from 62 to 67. It adds the disabled feature policy, new email templates and a tenant-local candidate wrapper. New clients receive clean table structures; no training or learner data is copied into the template. Application data operations use the restricted tenant database adapter; evidence storage context is resolved before opening its transaction.

Local PGlite integration suite: 35 groups passed, including eight new live-training groups covering feature/admin/tenant/CSRF boundaries, timezone and URL validation, assignment eligibility/idempotence/credits, learner calendar/join access, certificate snapshots/revocation, scoped reporting/atomic attendance, reminders/cancellation/restoration, and evidence access. Direct edits to immutable certificate/enrolment evidence are rejected.

Translation coverage: 1,383 interface/message keys across 14 languages, plus dictionary entries for dynamic status/action labels. Production compilation, TypeScript and route generation passed. The full pnpm test regression suite passed, including the updated feature-policy checks and all 35 tenant integration groups.

Local visual-browser validation was unavailable: Chromium was absent and its download failed. Authenticated desktop/mobile acceptance remains part of the planned EazySafe end-to-end testing. All fixtures and test records are local; no production sessions or learner assignments were created by the agent.
