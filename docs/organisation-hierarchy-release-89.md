# Configurable organisation hierarchy — release 89

The organisation model now supports each client's own hierarchy, with two to six named levels in the setup and administration screens. The underlying parent/child model does not encode a fixed Global/Country/Store structure.

## Primark preservation

- Client 1 retains **Global → Country → Store**, with its level configuration locked.
- The migration creates country groups from existing store countries and attaches the same store records. Store IDs, learner IDs, grants, assignments, credits, certificates and other evidence are retained.
- Primark keeps its existing reporting controls and geographic permissions. No original Primark repository, site, database or storage is modified by this branch.

## Client setup and sites

- Choose a preset or name each level, for example Organisation → Region → Store or Organisation → Division → Region → Area → District → Site.
- Geographic country remains a site property. A client can optionally designate an intermediate level as Country; its groups must agree with descendant site countries.
- Add groups, choose their parents, edit names and codes, and move a group while retaining its identity and descendants. Parents must be at an earlier level, preventing cycles. Empty groups can be deleted; references from sites, access grants or course audiences prevent deletion.
- Branches can skip intermediate levels. Site creation and editing select a parent group; existing site IDs remain stable when moved.
- CSV import previews up to 200 new sites before an explicit commit. Site codes remain text, including leading zeroes. Reusing an existing code is rejected. The preview is invalidated if the relevant structure changes, and commit is atomic.
- Setup provisioning is atomic and idempotent. New tenants and the clean template receive only structural defaults, not Primark data.

## Reporting and permissions

- Custom clients get scope selection, breadcrumbs and “View by” for their named levels. Course overview and pathway totals group by the selected level. Missing intermediate groups fall back to their sites, so records are not lost.
- Course compliance is calculated from summed counts, rather than averaging percentages. Existing server pagination and export limits remain in effect. Course exports include the organisation path.
- Activity, matrix, period and accounting reports retain their existing layouts and use the selected authorised scope. Period/accounting rows remain per site.
- Group administrators receive one or more branch grants. Access includes descendant groups and stores; overlapping grants do not duplicate results. User management, reporting, exports, site management and relevant training views enforce the scope on the server.
- Access and reporting follow the current hierarchy immediately after a move. Dated audit events record old/new structures and group grants. This release does not provide a historical “as-of organisation structure” reporting mode.
- Organisation-wide settings and course-authoring permissions retain their existing restrictions. A group reporting grant does not itself confer manual assignment or practical assessor rights.

## Course audiences and integrations

- Course audiences can select groups and include future starters through the existing assignment engine. Credits, exclusions, version pinning and existing assignment history continue to apply. Moving a site does not remove its existing assignments.
- HR integrations continue to use stable store IDs. Reference data adds hierarchy configuration and site paths; payroll employee imports do not create or restructure sites.
- Hierarchy/interface copy is included in all 14 supported languages. Client-provided level and group names remain client data.

## Validation and release

- Local PGlite integration checks cover Primark's three levels, isolated six-level provisioning, country consistency, cycles, revisions, import previews, duplicate codes, multiple/overlapping grants, escalation attempts, future starters, branch moves and audit history.
- The tenant suite passes 75 integration checks. Type checking and translation validation pass (1,757 interface/message keys across 14 languages).
- The full `pnpm test` regression suite and `pnpm build` production build pass. The final course-audience transaction checks are also covered by the tenant suite.
- Browser visual/interaction checks were not completed: Chromium was unavailable, and its download failed in this environment. Review the setup, organisation, import, group access and reporting screens in an isolated preview before release.
- No hosted database migrations or production deployment were performed during implementation. The migration belongs to the normal committed Netlify deployment flow. Main/production release requires the user's explicit approval under `AGENTS.md`.
