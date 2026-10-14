# Release 77 — installable client-branded PWA

Based on main Release 76 (`8d5fbfa`).

- Each client's public manifest has a stable client-specific identity and start URL, standalone display, client name and theme colour. Launching the installed shortcut selects that client using the existing portal/session rules.
- PNG icons at 180, 192 and 512 pixels are rendered from the existing permitted client logos. PNG/JPEG/WebP uploads and built-in branding are supported. Icons have an opaque white background and safe maskable padding. No arbitrary remote image URL is fetched.
- Profile menu includes Install app. Supported browsers offer the native installation prompt; iPhone/iPad show Safari home-screen instructions; other browsers show menu guidance. Installed standalone sessions hide the install action.
- The root-scoped service worker caches only the public offline document. It never caches APIs, learner pages, certificates, evidence, SCORM or client data. POSTs and iframe/SCORM requests are untouched. Navigation failure displays a translated offline document with a retry button; an already-open app shows a connection warning.
- Learning, assessments and saves require an internet connection. There is no offline course download, queued save or background upload. Push notifications are outside this change.
- New workers wait until all LMS windows/tabs close. No forced reload or skipWaiting can interrupt active training. Worker updates are checked when the app returns to the foreground. Increment the dedicated worker cache version when the offline document changes.
- Manifest/icon responses are private and uncached; fetching branding does not change the selected client cookie. Worker script caching is disabled; public offline assets bypass tenant resolution. Existing migration holds remain effective.
- New interface copy is included in all 14 supported languages; the offline page uses the existing saved language preference and supports RTL.

## Validation

`tests/pwa-check.mjs` checks manifest identities and launch URLs for EazySAFE/Primark, all icon sizes and uploaded image formats, invalid size/remote URL rejection, public metadata reads without session mutation, portal selection, service worker network/fallback behaviour, bypasses for private requests and safe cache cleanup.

`pnpm test`, `pnpm build`, `pnpm typecheck` and `git diff --check` passed. The translation audit passed 1,532 interface/message keys across 14 languages. Automated icon rendering and service-worker checks use local fixtures, not production learner records. A browser fixture was prepared but Chromium could not launch because the environment denies its socket access; elevated execution was also rejected by the approval policy. Real-device installation must be checked on iOS Safari and Android Chrome after deployment.

## Release smoke check

1. Open a client portal over HTTPS and choose Profile → Install app (on iOS follow the Safari instructions).
2. Launch from the home screen: confirm the correct logo, client portal and standalone window.
3. Disconnect: confirm the connection warning; open a new page and confirm the offline screen. Reconnect and select Try again.
4. Complete a normal online course save and open its certificate.
5. After a later deployment, close all LMS tabs/app windows and reopen to activate the new worker. Existing tabs must not reload during training.

Main/production release requires explicit user approval, as specified by AGENTS.md. No database migration or production data change is needed.
