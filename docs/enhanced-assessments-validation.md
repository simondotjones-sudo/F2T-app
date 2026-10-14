# Release 73 — enhanced assessments

Baseline inspected: `a77faf8` (Release 72) on `main`, 12 October 2026. Prepared on `feature/enhanced-assessments`; publication and merge await Simon's approval.

## Changelog

- Extended `courses.quiz_json`, existing assignment/course-version snapshots and `course_quiz_attempts`; no replacement assessment or certification system.
- Added reusable, revision-protected question banks, categories, single-answer, multiple-answer and true/false questions, and optional explanations.
- Course editors choose fixed questions (including copies from banks) or a random count from selected banks/categories. The server resolves and validates the eligible pool. Publishing freezes it into the existing course version. Use **Refresh** in a random assessment to incorporate later bank changes; existing assignments remain unchanged.
- Added configurable pass percentage, independent question/answer order randomisation, attempt limits or unlimited attempts, retry delay, and correct-answer visibility after each attempt, after a passing attempt, or never. Explanations follow the same visibility policy because they can disclose answers.
- Starts/resumes are server-owned and retain the same questions and option order. **Save progress** preserves unfinished answers. Final attempts retain their own questions, answer keys, answers, score, pass mark, course/assessment version, start and submission times. Submission is idempotent. Completed evidence is immutable.
- Server grading uses exact-set, all-or-nothing marking for multiple-answer questions; duplicates, invalid choices and partial submissions are rejected. The learner receives no answer keys before their release point.
- Successful attempts feed the existing SCORM, practical-assessor, certificate and pathway functions. No completion requirements are removed.
- Added scoped assessment reporting from the existing Reporting screen and Manage Courses, with search, scores, pass/fail, attempt counts, remaining attempts and CSV export. Organisation and platform administrators can grant one additional exhausted attempt with a mandatory reason and an immutable audit entry. Grants preserve the retry delay.
- Added an independent Advanced assessments feature toggle. It controls new authoring; existing assignments and basic quizzes continue to work. Organisation authors still require client course management. Shared banks reject client edits; shared courses retain existing edit protection.
- Shared catalogue releases carry self-contained assessment pools. Client portals do not need access to source banks.
- Reused the primary header, controls and responsive layout. Added assessment interface translations to the existing locale dictionaries.

## Migration

`20261012173000_enhanced-assessments` holds advisory lock 62111700 and updates public/client 1, all registered clients and the clean provisioning template. It registers three new tables, grants the appropriate tenant role, and preserves tenant-local foreign keys/functions/triggers. It adds snapshots/version/start-time fields to existing quiz attempts; legacy answer/score/result/submission values are untouched. Legacy start times remain unknown (`NULL`) rather than being fabricated.

No production database, outbound email or hosted service was used for validation.

## Validation

- `pnpm typecheck` — passed.
- `pnpm test` — passed, including 10 new PGlite assessment workflow groups and 42 multi-client integration groups with shared-catalogue checks.
- `pnpm build` — passed.
- `git diff --check` — passed.
- Expanded translation validation — passed: 1,439 interface/message keys across 14 languages.
- Re-fetched `origin/main` before release preparation; it remains `a77faf8` (Release 72).

The assessment suite covers grading, malformed and extra answers, random subset size/uniqueness, answer-key remapping, ordered random subsets, insufficient pools, missing banks, role/origin/revision checks, shared-bank protection, legacy migration preservation, persisted resume, bank/course edits and version history, submission idempotency, exhausted limits, unlimited retries, retry delay, disabled-feature continuity, scoped reports/CSV, audited retry grants, SCORM completion and practical sign-off gates. Existing regression suites cover certificate/pathway issuance and historic completion rules. Multi-client tests cover API isolation, restricted roles, new-client provisioning and shared-course snapshot portability.

## Release notes and limits

- Hosted migration/deployment checks and browser/device acceptance remain release gates after publication approval. Local build and service mocks do not replace a hosted smoke test.
- New/edited assessments apply to new assignments; use the existing explicit course-version retraining workflow when a cohort must receive changed requirements.
- Fixed assessments allow 1–50 questions. Banks and frozen random pools allow up to 500 questions, with 1–50 selected per attempt and 2–6 options per question.
- Attempt limits are per assignment, retained across course edits; renewals/retraining create their usual new assignment. At most 100 configured attempts (or unlimited); retry delay is measured from the previous submitted attempt.
- Learners must select **Save progress** to preserve unfinished answer changes. Questions and option order are retained from the moment the attempt starts.
- Banks are reusable within their owning client. Shared course distribution embeds assessment content rather than exposing a cross-client live bank. Bank changes require a deliberate course update and publication.
- No production publication, PR or merge is authorised by this preparation step.
