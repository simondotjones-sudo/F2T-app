# Release 85 — Administration navigation and client filtering

Based on main 4edd4a0. Version 1.14.10.26.85.

- External Training selects External training in the profile menu instead of Settings.
- Exemptions and RPL keeps the External training header and menu selection. Both pages use Review records / Exemptions and RPL in that order with a selected pill.
- Exemptions includes a short explanation of assigned-course decisions, the Record decision action, evidence requirements and the route for prior learning. Its empty state explains that a course must first be assigned and links to Manage Users. Search-empty results retain the existing no-match message.
- Integrations and Email Notifications reuse the shared pill styles. Integrations fills its content width and uses a two-column mobile layout, avoiding clipped tabs. Email tabs form one control with two mobile columns and a full-width final item.
- Course Sharing displays an All clients / client dropdown under Client-specific. It filters by the source client and combines with the course search; All and Shared ignore this filter. Changing clients clears the course detail selection.
- New copy is translated into all supported languages.

No API, data, permission or workflow changes. See PR for validation results. Main/production release requires explicit approval under AGENTS.md.

Validation: full test suite passed. Browser checks at 390px and 1365px confirmed active menu selection, stable headers, selected-tab colours, no horizontal overflow and client-filter isolation from All/Shared. Screenshots were inspected. An additional mobile CSS check confirmed the email control remains 158px tall during loading after preventing grid-row stretching. Browser checks used isolated PGlite and fictional catalogue data, with outbound email/jobs disabled.
