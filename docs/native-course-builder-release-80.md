# Release 80 — Native Course Builder, Phase 1

Prepared against Release 79 (`ee89ba4`) in `simondotjones-sudo/eazysafe-LC4`.
Version: `1.12.10.26.80`. Production publication requires Simon's release approval.

## Behaviour

Manage Courses offers **Upload SCORM** and **Build a course**. Native courses reuse course metadata, tile images, audiences, assignment credits, renewal settings, assessments, surveys, pathways and practical assessment rules.

The builder provides lessons and text, image, video, document, accordion, process, knowledge-check and acknowledgement blocks. Lessons and blocks can be renamed/edited, duplicated, deleted with confirmation and moved using keyboard-accessible controls. The lesson outline collapses on small screens. Desktop/mobile previews use the same renderer as learning.

Autosave retains local edits on request failure and exposes Retry. Before-unload warns about unsaved edits. Revision conflicts prevent silent overwrites. An identical retry after a lost save response acknowledges the already-saved draft without another mutation.

Text supports a deliberately small Markdown subset: headings, paragraphs, lists, emphasis and HTTP(S) links. Rendering uses React nodes rather than injected HTML. There are no arbitrary HTML/embed controls.

Native courses open from existing learner tiles, resume from server-side state, and support free or sequential lesson navigation. Learners explicitly choose Complete lesson. Required acknowledgements must be confirmed and required knowledge checks attempted. Practice is unscored: an incorrect answer receives feedback and still counts as an attempted interaction. Scrolling, opening a document and opening a lesson never count as completion.

Required lessons drive content completion. Existing final assessment and practical sign-off gates still control certificates. Optional lessons and feedback do not block certification. Active time counts visible activity and video playback, using 20-second heartbeats, a 35-second server gap cap and a 60-second interaction idle window.

## Versioning and evidence

- `courses.delivery_type` distinguishes native content from SCORM. Existing courses default to SCORM; delivery type cannot be changed through the course API.
- `native_drafts` holds editable structured content with an optimistic revision.
- Publishing validates the exact draft revision, media availability and content structure, then creates an immutable `course_packages.native_json` snapshot. Identical content publication reuses the package.
- Published package identity continues to be the existing assignment's content identity. Existing assignments keep their package and assessment snapshots. Deliberate retraining uses the existing version/credit mechanism.
- `native_events` retains starts, resumes, acknowledgements (including exact statement), practice attempts, lesson completion and content completion against assignment and package. Acknowledgements/completion events are idempotent and immutable.
- Native required-lesson progress is projected into the existing `scorm_progress` compatibility table so reporting, pathways, quizzes, practical assessment and certificate SQL keep one completion flow. Native playback cannot be launched or saved through the SCORM launch route.
- The content schema includes stable lesson/block IDs, a schema version and optional source/reference/generation/review metadata for a later AI drafting phase. No AI service is called.

## Permissions and files

Course Authoring is an optional feature, initially enabled. Organisation administrators also need the existing Allow client course management permission. Disabled authoring prevents authoring operations while preserving published learner access. Shared native copies cannot be edited as masters, including by client platform admins; updates follow the original master's deliberate catalogue release/distribution flow.

Files use tenant-specific, context-specific protected storage and authenticated reads. Uploads validate size and signatures; images are decoded and re-encoded. Media references must belong to the course. Published assignments can only retrieve their own version's files. PDF downloads are attachments; image/video responses use nosniff and private/no-store, with byte ranges supported for video seeking. Shared releases copy only released media into the receiving client's namespace, preserve prior packages and retain client settings.

**Current media limits:** 3 MB per file, 200 files per course. Supported upload types are JPEG/PNG/WebP images, PDFs and MP4 video clips. Every video requires a transcript. Longer videos, external embeds, SCORM export, AI drafting and offline learning are outside this release. Authored content and uploaded files are not automatically translated; interface and validation messages use the existing 14-language dictionary.

## Migration

`20261012230000_native-course-builder/migration.sql` adds two columns and four tables: `native_drafts`, `native_media`, `native_events`, `native_sessions`. It applies to public, lms_template and every registered client under provisioning advisory lock 62111700. It registers the new tables for future clients, grants runtime roles only the required operations, and protects published content/media/events with immutable triggers. No learner/course/media data is inserted into the template.

No existing migration is changed. No production data migration, email delivery or background job is required. The original Primark repository/site/database is untouched. Schema changes are additive; once native courses exist, rolling application code back to a player without native support requires a separate operational plan. Do not remove the new records to roll back.

## Validation

- Full `pnpm test`: passed (including existing SCORM, reporting, credits, renewals, pathways, email safeguards, RPL/external training, assessment, surveys, PWA and HR suites).
- Native integration suite (13 groups): validated all eight block structures, permissions, invalid/foreign media, save/reload, stale revisions, unchanged-publish idempotency, immutable packages, preview isolation, sequential navigation, required interactions, session takeover, active-time bounds, certificate idempotency, version pinning, retained acknowledgements and disabled authoring. Final assessment failure and outstanding practical sign-off prevent certificates.
- Multi-client suite: 55 groups passed, including native catalogue distribution, private file copying, cross-client API/SQL denial, shared-copy protection and clean client provisioning.
- Localisation audit: 1,632 keys across 14 languages passed, including native validation errors.
- Production build: passed; final build and browser results recorded in the PR.
- Authenticated browser check passed: create/edit, desktop/mobile preview without overflow, failed autosave retry, stale-edit rejection, audience publication, required acknowledgement, two-lesson progression, reload/resume, completion and issued certificate.
- Browser tests use only a clearly fictional local course/account, isolated PGlite and serialized local test database access. No real users are assigned test content.

Before production release, verify the hosted preview has an isolated database with email/jobs disabled, check migration/build success, and smoke-test actual protected image/PDF/MP4 delivery and client branding. Local storage tests mock Netlify Blobs; they are not evidence of hosted storage configuration. Deployment to main remains unapproved.

## Main changes

- `lib/native-content.ts`, `lib/native-authoring.ts`, `lib/native-learning.ts`: structure, validation, publication, access and progress.
- `app/api/admin/native-content`, `app/api/native-content`, `app/api/native-media`: authoring, learner interactions and private files.
- `app/admin/courses/[id]/builder`, `components/native-renderer.tsx`, `components/native-course.css`, `app/learn/[id]/native-player.tsx`: author/learner interfaces.
- Existing course management, learner routing/tiles, SCORM launch protection, feature catalogue and shared catalogue: integrated native delivery.
- `lib/locales/application-native.ts`: interface and validation copy.
- `tests/native-course-check.mjs`, native additions to multi-client tests and updated feature/localisation checks: automated coverage.

## Repeating the browser check

Run `node tests/native-browser-check.mjs` from the repository after making Playwright and Chromium available. If they are supplied by an external runtime, set `LMS_TEST_PLAYWRIGHT_MODULE` to its Playwright module and `LMS_TEST_CHROMIUM` to the Chromium executable. This optional check uses Netlify CLI’s local database dependency, a temporary copy of the app, fictional credentials and a serialized test-only database driver. It never changes the production driver or connects to a hosted database. It exercises creation, autosave retry, stale-edit rejection, preview, mobile layout, publishing, learner acknowledgement, resume and certification. Screenshots and server diagnostics go to `/tmp/native-*.png` and `/tmp/native-ui-next.log`.
