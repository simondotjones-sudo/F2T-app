# EazySAFE multi-client development

- Keep work in `simondotjones-sudo/eazysafe-LC4`. Do not modify the original Primark repository, site, database or storage.
- Application data queries use `lib/database.ts`, which applies the selected client's restricted role and schema in a transaction. Never bypass it with the raw driver in a route or workflow.
- `lib/control-database.ts` is privileged: use it only for fixed SQL against the client registry and global operator authentication. Require `getPlatformOperator()` before client management. Client `platform_admins` are scoped to their own client.
- Do not call control-plane queries from within a client transaction. Resolve global credentials first; send emails after committing the authorised operation. Preserve successful-operation audit semantics.
- New schema migrations must cover client 1 (`public`), `lms_template`, and every `lms_clients.schema_name`. Update `lms_schema_tables` for new application tables, copy functions/triggers with the correct schema and grant only the appropriate runtime role. Hold advisory transaction lock 62111700 so provisioning cannot interleave. Never edit an already-applied migration.
- Do not copy private learner/course/audit data into the template. New clients receive structural schema and explicitly approved defaults only.
- Use `tenantFileKey` and ownership checks for SCORM/photo storage and client-specific evidence stores. Client 1 retains legacy keys. Include `client` in email, certificate and invitation links.
- Use `useBrand`, `BrandLogo` and theme variables for branding; keep safety status colours semantically meaningful. Translate interface strings through the existing locale dictionaries.
- Tests use local PGlite and mocked services. Run `pnpm test` and `pnpm build` before a release. Preview builds must have an isolated database and no outbound email/jobs.
- Prepare a reviewable branch and PR. Main/production release remains subject to the user's explicit release approval.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
