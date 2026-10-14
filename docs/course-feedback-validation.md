# Release 74 — course feedback surveys

Baseline: `7a10b9a` (Release 73, enhanced assessments), inspected and re-fetched from `main` on 12 October 2026. Prepared on `feat/course-feedback-surveys`. Publishing the branch/PR and merging to main await Simon's approval.

## Changes

- Reusable survey templates with 1–5 ratings and five editable labels, single choice, multiple choice, and free text. Each question can be required or optional. The editable starter covers satisfaction, relevance, clarity, confidence and improvements.
- Templates attach to existing courses and live training through the Courses tab. Attaching also offers feedback for existing completions. Completions and recorded attendance create tenant-local invitations; corrected/cancelled attendance or withdrawn completions cannot submit. No completion, score, credit, compliance or certificate rule depends on submitting feedback.
- My Courses presents a short survey with explicit optionality and named/anonymous disclosure. It prompts once per browser session for an unseen invitation. Complete later closes the form; the invitation remains in the course area. These in-app prompts need no email service.
- Added Reports / Templates / Courses switcher, search, course and completion-month filters, distributions, averages, choice counts, comments, named response details and CSV export. Entry points are in the profile menu, Manage Courses, Reporting and Live Training.
- Added Course Feedback Surveys to existing feature policies and client setup. Disabled features hide controls and deny authoring, learner submission and reporting APIs. Existing evidence remains stored. Organisation authors also require client course management; reporting requires organisation or platform access.
- Shared templates are protected from client edits. Catalogue releases embed their attached survey snapshot; distribution installs a platform-managed template in the destination client. Each client's invitations, answers and reports remain isolated. Global operators manage shared surveys; tenant platform grants cannot edit platform-managed shared surveys.
- Saving a template creates an immutable question version. Previously issued invitations and responses keep their original questions and template title. Reports never combine different versions. Changing a response mode is rejected once any responses exist. A stale learner form cannot submit if its displayed mode differs from the server mode.

## Anonymity and calculations

- Anonymous answer records have no learner, invitation, assignment, enrolment, session or occurrence reference and no submission timestamp. Their respondent column must be NULL under a database constraint. No audit trigger captures answers or submission tracking.
- Eligibility/submission tracking is separate, keeps only a submitted boolean, and contains no answer ID or answers. A unique occurrence constraint and row locks make submission one-time and atomic; tracking cannot be reset. A later refresher assignment or another live occurrence receives a new invitation.
- Responses and question versions are immutable. Anonymous API/report/export data omits names, identifiers and timestamps. Free-text fields explicitly warn against identifying oneself or others; volunteered identifying text cannot automatically be guaranteed anonymous.
- Reports use fixed course/training, UTC completion-month and survey-version cohorts. Anonymous cohorts below five responses hide the response count, response rate and all answers. Within a visible cohort, any optional question answered fewer than five times is also suppressed, including comments. CSV uses exactly the same suppression logic. Arbitrary day, learner, site, session and global filters are rejected to prevent slicing a protected cohort.
- Eligibility counts represent learner-completion/attendance opportunities, not distinct people across repeated completions. Response rate is submitted responses divided by eligible opportunities. Ratings average answered ratings only; multiple-choice counts count each selected option once. Cancelled/uncompleted invitations are excluded unless already submitted, preserving historical response denominators.
- Reports use a consistent read-only transaction snapshot. CSV cells are quoted and protected against spreadsheet formula injection.

## Migration and release

`20261012190000_course-feedback` adds five tenant-local tables, indexes, completion/attendance triggers and evidence guards. It holds advisory lock 62111700, updates client 1/public, all registered client schemas and lms_template, registers all tables, and grants restricted tenant roles. Clean clients receive schema and the feature default, never learner data. Earlier applied migrations were not modified.

The feature defaults to an optional policy, enabled. No survey is automatically attached to a course. Completed work during a period when the feature is disabled does not generate invitations; reattaching a template after enabling backfills eligible completions.

## Validation

- Ten PGlite feedback workflow groups cover question/answer validation, origin and author permissions, feature policies, existing and new completions, concurrent duplicate submissions, immutable tracking, unchanged learning/certificates, anonymous storage constraints, five-response and optional-question suppression, calculations, CSV privacy/formula handling, mode locks, stale disclosure, historic versions, refresher submissions, live attendance corrections and separate occurrences.
- Multi-client integration exercises restricted roles, clean client provisioning, shared snapshot distribution, client-local feedback reports and rejection of another client's session/IDs.
- Interface and API copy is routed through existing locale dictionaries; translation checks include the new survey controls and errors.
- Mobile component fixtures at 390px and desktop at 1440px: report, template editor and learner form render without horizontal overflow; labelled radio/checkbox interaction, submission and Complete later work without browser runtime errors. Form and report screenshots were visually inspected. Fixtures mock the header/language provider and API; this does not replace hosted acceptance with real branding/authentication.
- `pnpm typecheck` — passed.
- `pnpm test` — passed in full, including ten feedback workflow groups, ten enhanced-assessment groups, 43 multi-client integration groups and 1,490 translated interface/API keys across 14 languages.
- `pnpm build` — passed, including the feedback page and three API routes.
- `git diff --check` — passed.

## Limits / acceptance checks

- Anonymous date filters deliberately use whole completion months. There is no site/learner drilldown or cross-client aggregate report. Platform operators switch client context using the existing client controls.
- A small anonymous course/version/month cohort stays suppressed even when other months contain enough responses. Authors should avoid needless survey version changes mid-cohort.
- 1–15 questions, 2–10 choice options, five rating labels, and 2,000 characters per comment. Authored questions/default starter content remain editable English text; interface/error messages use all existing application locales.
- Draft learner answers are not saved after closing/reloading. Final responses cannot be edited or deleted through the application. Detaching prevents new invitations but retains already issued invitations and historic responses.
- Shared template edits reach other clients only through a new catalogue release/distribution. A distribution attempting to change the mode of a recipient survey that already has responses is rejected; publish a separate survey/course if a different confidentiality promise is needed.
- No production database, email, deployment, remote branch or PR was changed. After publication approval, verify the hosted migration, mobile branding/accessibility, completion prompts, shared-client permissions and CSV downloads before merging/releasing.
