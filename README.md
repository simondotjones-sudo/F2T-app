# EazySAFE LMS

Release **1.11.10.26.63** adds multiple clients to the independent EazySAFE application.

| Client | Portal | Default branding |
| --- | --- | --- |
| 1 — Primark | `/?client=primark` | Primark wordmark and blue |
| 2 — EazySafe Internal | `/?client=eazysafe-internal` | EazySAFE logo and red |

A fresh visit without a client selection opens EazySafe Internal. The global operator can open **Profile → Clients** to add clients, upload logos, choose theme colours and copy portal links. Enter a client to configure its sites, administrators, courses and assignments. The existing configured operator credentials continue to work. Administrators created within a client stay within that client.

Client 1 keeps this application's existing Primark data and uploaded course. Client 2 starts with one internal site and no learner/course history. Additional clients start with clean configuration defaults and no sites. Each has independent database permissions, records and file namespaces. The original Primark application is unaffected.

## Hosting

Repository: `simondotjones-sudo/eazysafe-LC4` · Netlify site: `eazysafe-lc4`.

`netlify.toml` builds with `pnpm build`, publishes `.next` and uses Node 22. The committed migration is applied by Netlify's database integration. Use this project's own database/storage; never reuse the original Primark project's connection or credentials. Preview deployments must use an isolated database branch.

- `PRIMARK_ADMIN_EMAIL` and `PRIMARK_ADMIN_PASSWORD`: global operator credentials; password at least 16 characters. Legacy environment names remain for compatibility.
- `PRIMARK_APP_URL`: this application's HTTPS origin.
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
