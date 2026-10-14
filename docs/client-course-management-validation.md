# Release 72 — navigation and client course management

## Behaviour

- The profile menu groups available links under Management, Training, Configuration and Platform administration. Learners retain their Learning group. Empty groups and disabled features are hidden.
- Platform course links and page titles are Manage Courses and Course Sharing.
- Allow client course management is a platform-controlled Learning feature. It defaults off for existing clients and the provisioning template. The client setup and edit wizards include it.
- When enabled, organisation admins see Manage Courses under Training and can create, upload, preview, version and publish courses in their selected client. Country/site administrators and learners cannot use this permission.
- Imported shared courses display a read-only label. Client administrators cannot edit their metadata or upload, finish or write SCORM packages for them. Platform course sharing permissions remain unchanged.
- Every authoring and preview endpoint checks current access. Disabling permission blocks subsequent requests, including existing upload/preview sessions. Learner assignments and evidence remain intact.

## Validation

- Production build passed, including TypeScript.
- Existing feature-settings regression now expects 26 features and explicitly verifies the new disabled default.
- Permission integration checks use an in-memory PostgreSQL database and mocked blob storage: off-by-default, platform-only setting changes, lower-role denial, CSRF rejection, full organisation-admin upload/preview/publication, actor attribution, shared-course protection and permission revocation.
- Navigation checks cover group order, feature loading, disabled links, organisation-admin course visibility and platform separation.
- Migration adds the disabled default to every client, public and lms_template under the provisioning advisory lock. No new tables or privileges are needed.

## Release

Merge to main requires explicit release approval. Enable the new permission per client only when wanted. No production database or settings were changed during local validation.
