# Release 78 — install banner, image uploads and desktop navigation

Baseline: Release 77, main `96cff96`.

## Changes

- Client-branded, dismissible Install app banner, with a seven-day per-client dismissal period. Uses the browser's native installation prompt when available and otherwise displays the existing Safari/browser-menu instructions. Hidden in standalone sessions and during lessons, assessments, activation and password reset. Existing profile-menu installation remains available.
- New and existing client wizards accept a login background photo with a subdued preview and remove control. Login and password-recovery screens show the selected image beneath a pale overlay. Primark's existing default photo remains when no replacement is selected.
- Course details accept an optional tile image with preview and removal. Admin and learner tiles display it; removal restores the existing automatic subject cover. Image-only changes do not reset learning or trigger a new learning version. Shared catalogue releases carry the image to recipient courses.
- Course navigation is centred on desktop and grows to fit labels on one line. Mobile retains horizontal scrolling within the navigation strip. Course Sharing's switcher now sits centred above both panels instead of inside the narrow course-list column.
- New copy is translated into all 14 supported languages.

## Image handling

PNG, JPEG and WebP inputs are limited to 5 MB in the picker, resized in-browser and sent as compact raster data (maximum 500,000 characters). The server independently validates, decodes, limits pixels, strips metadata and re-encodes JPEG. Arbitrary URLs and SVG are rejected. Images are attached to the existing client registry/course records and use their existing authorisation and revision controls; there is no additional blob store or unattached upload lifecycle.

Migration `20261012210000_brand-course-images` adds `lms_clients.login_background` and `courses.cover_image` in public, lms_template and all client schemas, under provisioning advisory lock 62111700. No new tables, permissions or background jobs. Apply before serving this release. The additive columns are safe to retain if application code is rolled back.

## Validation

Production build and TypeScript check pass. Translation audit passes 1,539 interface/message keys across 14 languages. Local multi-tenant integration checks pass, including invalid/oversized image rejection, upload/removal, preservation on metadata edits, client isolation, client setup idempotency and shared-catalogue image snapshots/distribution.

`pnpm test` passed in full, as did `pnpm build`, `pnpm typecheck` and `git diff --check`. Browser fixtures were prepared, but local Chromium cannot launch because the environment blocks socket access. Rendered layout and real Android/iOS install behaviour require a hosted/device smoke check; no production records were modified for testing.

## Hosted smoke check

1. Open a portal in Android Chrome: banner appears, Install opens the native prompt if available; otherwise browser-menu help appears. Dismiss, reload and confirm it stays hidden. Launch installed app and confirm banner is hidden.
2. Create/edit a client: upload a photo, save, reopen wizard and open that client's login page. Check pale overlay, readable form, persistence, replacement and removal. Check another client remains unchanged.
3. Create/edit a course: upload, save and inspect both admin and learner tiles. Remove and confirm the automatic cover returns. Publish a catalogue version and distribute to confirm the receiving course image.
4. At desktop widths, check Course Sharing, Courses, Question banks, Assessment reports and Course feedback navigation is centred with single-line labels. On mobile, ensure only the pill strip scrolls horizontally.

Automatic approval review rejected the GitHub branch push because it requires explicit authorisation to publish this source. The release is committed locally; no branch/PR or production change has been published. Per AGENTS.md, main/production release also requires explicit user approval.
