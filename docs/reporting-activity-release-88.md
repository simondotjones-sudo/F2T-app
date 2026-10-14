# Release 88 — Reporting colours and learner activity

Version 1.14.10.26.88. Main release explicitly authorised by Simon.

Completed metrics and the course completion chart line, points and legend use fixed green, independent of client theme. Non-zero expired totals use red. Existing compliance bands, amber expiry warnings and neutral no-data states are preserved.

Opening User activity for a selected site automatically requests 25 active learners. Pagination occurs in SQL by learner, with deterministic name/ID ordering, total learner count and all matching records kept together. Site/country permissions and the tenant database wrapper remain enforced. Organisation-wide lists still require a search. Explicit searches with All learners preserve historical lookup of archived learners; completion follow-up filters use active learners only. Activity loads independently of the overview and is not requested while the overview tab is open.

Selecting a course exposes All learners / Not completed / Completed pills. Not completed includes not-started, in-progress and expired requirements; valid exemptions, recognised prior learning and requirements replaced by refreshers are excluded. Rows show deadlines and distinguish overdue from within-deadline work. Search remains debounced, stale requests are cancelled, and changing scope/course resets the activity filter and page.

Regression coverage includes automatic site loading, literal search, authorisation, completion filtering, unassigned learner exclusion, 25-person pagination with multiple courses, no page overlap and 1,000 matching learners. No schema migration or production data change is required.
