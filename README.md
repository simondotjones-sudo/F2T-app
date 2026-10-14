# Fit2Trade App

Release **1.14.10.26.90** applies Fit2Trade branding to this independent multi-client application.

| Client | Portal | Default branding |
| --- | --- | --- |
| 1 — Primark | `/?client=primark` | Primark wordmark and blue |
| 2 — Fit2Trade | `/?client=fit2trade` | Fit2Trade logo and `#2E6052` |

A fresh visit without a client selection opens Fit2Trade. The global operator can open **Profile → Clients** to add clients, upload logos, choose theme colours and copy portal links. Enter a client to configure its sites, administrators, courses and assignments. The existing configured operator credentials continue to work. Administrators created within a client stay within that client.

Client 1 keeps this application's existing Primark data and uploaded course. Client 2 starts with one internal site and no learner/course history. Additional clients start with clean configuration defaults and no sites. Each has independent database permissions, records and file namespaces. The original Primark application is unaffected.

## Hosting

Repository: `simondotjones-sudo/F2T-app` · Netlify site: `fit2trade-app`.

This independent Fit2Trade clone uses its own platform administrator settings. Archived project documents describe the EazySAFE source baseline.

`netlify.toml` builds with `pnpm build`, publishes `.next` and uses Node 22. The committed migration is applied by Netlify's database integration. Use this project's own database/storage; never reuse the original Primark project's connection or credentials. Preview deployments must use an isolated database branch.

- `F2T_PLATFORM_ADMIN_EMAIL` and `F2T_PLATFORM_ADMIN_PASSWORD`: global operator credentials; set in Functions scope for the production deploy context. Use a unique password of 16–128 characters and mark the password variable secret. The former `PRIMARK_ADMIN_*` variables are no longer read by this app.
- `PRIMARK_APP_URL`: this application's HTTPS origin (`https://fit2trade-app.netlify.app`); this separate URL setting retains its existing name.
- `LMS_BACKGROUND_JOBS` and `LMS_EMAIL_DELIVERY`: disabled unless explicitly enabled in production; existing safeguards remain. Configure a valid sender before enabling email.
- `LMS_MIGRATION_HOLD=enabled`: maintenance guard for a reviewed import/release operation; off by default.

This feature branch requires release approval before merging to main. Back up the destination database and verify hosted role creation during the release. Existing database migrations are immutable; future migrations must update every client and the clean template. See `AGENTS.md`.

## Development

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
```

Local emulation: configure an ignored `.env` from `.env.example` and run `corepack pnpm dev`. Tests use local PGlite and mocked services and do not send real email. `.netlify/` and credentials must stay uncommitted.

## Project documents

- [Multi-client architecture](docs/tenant-architecture.md)
- [Release 63 validation](docs/multi-tenant-validation.md)
- [Original bootstrap record](docs/bootstrap-validation.md)
- [Baseline manifest](docs/source-baseline.json)
- [Archived migration runbook](docs/migration-runbook.md)

The original private-data migration was cancelled by agreement on 11 October 2026. This application uses its independent database; the retained course was uploaded directly and the user confirmed its launch/resume/completion/certificate workflow. No live database or file transfer from the original Primark site is part of this release.
