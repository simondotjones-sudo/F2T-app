# Multi-client architecture — release 63

A single Next.js/Netlify application serves independent clients. Each client has a portal selector (`?client=slug`), display name, logo and accent colour. EazySAFE red (#e8002a) is the default. Primark is client 1; EazySafe Internal is client 2 and the default entry portal.

## Data boundaries

Client 1 retains its existing tables and records in `public`; no data migration or file rewrite is required. Other clients have `lms_tenant_<id>` schemas. `lms_template` stores a clean copy of the 57 application tables, functions, constraints and triggers. Provisioning clones this structure and six explicitly listed configuration tables only. Learners, course uploads, completions, certificates, assessments, invitations and audit history are never copied from another client.

Every application query runs in a transaction with `SET LOCAL ROLE lms_client_<id>` and a schema-specific search path. Each role has access only to its own application tables, functions and sequences. Explicit cross-schema SQL is denied. Commit and rollback both reset the role before pooling. Owner-only registry/provisioning and global credentials use a separate control adapter. An application bug which invokes the privileged adapter incorrectly remains outside this role boundary; it must never accept user-supplied SQL.

The global configured operator login controls Clients and can enter all client portals. A client's existing Platform admin role remains restricted to that client and cannot manage the global registry. Learner accounts, passwords, reset tokens and sessions are independent even when their email/Employee ID matches another client's account. A client switch clears learner authentication; the global operator session remains available.

The proxy overwrites incoming routing headers. API calls carry the page's expected client; a stale tab cannot write into a client selected in another tab. Unknown client selectors do not fall back to another client's data. On refocus, a stale tab reloads into the active portal.

## Storage and links

Client 1 preserves existing package/photo keys and evidence store names. Other clients use `clients/<id>/` object keys and distinct evidence stores. Authenticated content routes resolve the package in the selected database and enforce the key prefix. Public certificate verification, invitations, emails and reset links carry the client selector. Old certificate verification URLs with no selector or cookie resolve to Primark.

All five scheduled functions iterate active clients using a separate async tenant context, and record failures without skipping remaining clients. Production-context and explicit enablement requirements for jobs and email are unchanged. New clients start with credits disabled and email settings disabled. EazySafe Internal has one internal site; subsequent clients start without sites, users or courses.

## Branding and administration

Clients (`/admin/clients`) supports adding a client, editing its name/logo/colour, previewing the colour and copying its portal URL. Portal slugs are immutable after creation. PNG/JPEG/WebP uploads are resized/re-encoded in the browser and stored as bounded image data, avoiding arbitrary external URLs. Branding changes use revisions to reject stale updates. Selected branding applies to sign-in, navigation, course views, printable certificates and email templates. Safety status colours keep their existing meanings.

The EazySAFE logo is the website asset from https://www.eazysafe.com/wp-content/uploads/2022/08/EazySAFE_Logo.png. The Primark wordmark follows the existing app's text branding. New clients default to EazySAFE until the operator uploads their own logo.

## Operations and further work

- Netlify applies the committed migration using a database owner permitted to create schemas/roles and grant membership. Local tests cover these statements; hosted permissions must be confirmed by the approved deployment.
- Future migrations must update the template and every active/inactive client schema and grants together. See `AGENTS.md`. Merely changing `public` would leave other clients behind.
- Provisioning and future migrations share advisory lock 62111700. Provisioning is atomic; a failed create rolls back its schema, role and registry entry.
- Back up the destination database before releasing. Restoring a backup is the rollback path for schema changes; an old app deployment is not a database rollback.
- Previews must use their own database branch. Sharing a production database would apply preview migrations to production.
- This release does not add SSO, custom domains, a shared course catalogue or cross-client learner membership. Content and accounts are managed independently inside each portal.
