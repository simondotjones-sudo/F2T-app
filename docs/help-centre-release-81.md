# Release 81 — Help centre

Based on Release 80, version `1.12.10.26.81`. Simon authorised implementation and release to main in this conversation.

## User experience

Help is available to every signed-in account from the profile menu. Guide, FAQs and Contact use the existing pill navigation style. The guide opens with nine category cards, filtered to permissions and enabled features, with 25 task articles, numbered steps, related links and topic search. FAQs use topic cards and expandable answers. Management pages using PageHeader provide contextual Help links.

The interface uses the existing 14-language dictionaries. Initial editorial guide content is English and explicitly labelled as such. Platform administrators can edit the selected client's article title, summary, steps, FAQ and optional screenshot; article access rules remain server-controlled. Edits are scoped to the selected client, not broadcast to every organisation. Built-in defaults continue to serve clients without overrides. Adding new categories or articles remains a code change.

Contact prefills the authenticated name/email and client. Requests have topic, subject, message, optional screenshot, a reference and an in-app status/response history. Organisation and platform admins can view the selected client's support inbox, reply and mark requests open, in progress or resolved. Managers and learners can see only their own requests. Replies appear in Help, not as automatically sent email replies.

Support routing can use an organisation email, falling back to the configured global platform administrator email. Alerts use the existing delivery function and require client email feature enabled, email mode live, production context, configured Postmark and the global delivery switch. Email is sent only after commit. No learner message or screenshot is included in the alert. Requests persist even if delivery is off or fails; failed/uncertain notifications are not automatically resent. No email is sent by the tests.

## Security and data

All application reads and writes use the existing tenant-scoped database wrapper. API authentication, role checks, origin checks, size bounds, server-side topic/feature checks and a transactional five-requests-per-hour limit protect mutations. UUID submission identifiers prevent duplicates after a lost response. Conflicting article/settings/request updates return 409. Audit records capture successful changes.

Screenshots use the existing client resizing and server image decoder/re-encoder (PNG/JPEG/WebP input, 5 MB browser input, max 500,000-character normalised image). Request images are stored in the client schema and downloaded through an authenticated owner-or-admin endpoint with no-store, attachment disposition and nosniff. They never appear in request lists, public blobs or email. Article screenshots are visible only to users allowed to read the article. Avoid including personal data in help screenshots.

The additive migration creates help_articles, help_settings and help_requests in public, lms_template and all registered client schemas under advisory lock 62111700. New clients inherit only blank support settings; tickets and overrides are never copied. The updated provisioner registers all three tables and restricts runtime support-table privileges to SELECT/INSERT/UPDATE. No existing migration is edited.

## Verification

- Full `pnpm test` passed, including 60 multi-client groups and five new Help groups: role/feature visibility, submission idempotency and validation, protected attachments and client isolation, replies/conflict/rate-limit/audit checks, clean provisioning and delete denial.
- `pnpm build` passed; targeted TypeScript and ESLint checks passed.
- Translation audit passed across all 14 interface languages.
- Authenticated browser validation passed: desktop and mobile layout, category navigation, FAQ links, search/empty results, article editing, support submission/receipt, inbox reply and requester response. Mobile admin navigation uses two rows of pills to preserve readable labels. Optional repeat: `node tests/help-browser-check.mjs` with `LMS_TEST_PLAYWRIGHT_MODULE` and `LMS_TEST_CHROMIUM` set if required. It uses an isolated temporary app and local PGlite, fictional credentials, disabled email/jobs and a serialised test-only connection pool.

## Deployment

Use the normal branch/PR/main workflow. Verify the hosted migration and production deploy once published. Rolling code forward/back must retain support and audit records; do not drop the new tables to undo interface changes.
