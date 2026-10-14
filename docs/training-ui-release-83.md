# Release 83 — Training page navigation

Based on main 7ae37fe. Version 1.14.10.26.83.

- Remove the Course feedback link above the Live Training tabs.
- Label the feedback header Course Feedback, translated in every supported language.
- Remove the cross-section course management tabs from feedback; retain its Reports, Templates and Courses controls.
- Anchor External Training below the header with horizontal auto margins only and full available width capped at 1100px. Preserve 16px mobile / 24px desktop padding.
- Remove the contextual Help icon from the shared page header. Help remains in the profile drop-down.

No data, permissions or workflow changes. Production release requires explicit approval under AGENTS.md.

Validation: see the PR for final test/build results. Browser visual verification was unavailable because the Chromium download failed in this environment.
