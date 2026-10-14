# Release 75 — course and assessment navigation

Baseline: `ccc66c3` (Release 74), fetched from main on 12 October 2026.

## Changes

- Replaced loose course, question-bank, assessment-report and feedback links with the existing pill-switch control. The current section is selected; the row scrolls horizontally on small screens and brings the selected pill into view.
- Kept primary actions separate from navigation and search. Question-bank creation and assessment CSV export use consistent buttons.
- Removed the duplicate question-bank link from the empty course panel and allowed its heading to wrap on phones.
- Reduced excess spacing on question-bank and assessment-report pages.
- Authoring links follow course-management permissions. Feedback links on assessment reports require organisation/platform access. Feature visibility and existing translated labels are retained.
- No database, assessment scoring, learner evidence or certificate behavior changes.

## Validation

- Full `pnpm test` regression suite passed, including enhanced assessments, course feedback, tenant isolation, permissions and certificates.
- `pnpm typecheck`, `pnpm build` and `git diff --check` passed.
- Browser component fixtures at 390px and 1440px cover course management, question banks, assessment reporting and restricted reporting. Checked horizontal page overflow, pill navigation, authoring-link visibility and browser runtime errors. Mobile screenshots were inspected.
- Fixtures use mocked page headers, language/features and empty API data. Hosted authentication and branding require release smoke verification.

Prepared on `feature/course-assessment-navigation`; not published to production.
