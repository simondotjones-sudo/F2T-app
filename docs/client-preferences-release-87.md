# Release 87 — Client language and location terminology

Version 1.14.10.26.87.

New client and Edit client include Language & terminology in the Branding step, with a review summary. New clients default to Sites and English; supported interface languages come from the existing 14-language catalogue.

- The selected term applies to registered interface copy, including headings, forms, manager labels and report labels. Prefer existing complete translations for the alternate label; use locale noun forms for other registered location templates. Apply substitutions before interpolating values, preserving names, course titles and identifiers. Import/API field names remain stable.
- Client-scoped browser language choices override the client default. Loading a default does not save it as a personal override. Old non-English browser preferences are migrated when visiting an unchanged legacy portal. A changed client default is not masked by an automatically stored legacy English default. Preferences are local to a browser, not synchronised across devices.
- Server-rendered login and registration start in the client language, including RTL direction. Saving active-client preferences refreshes the current branding. Other open tabs refresh their brand on focus.
- Notification dates, available translations and password-reset fallback use the client language. French notification bodies are translated, including scheduled summaries; untranslated email body templates in other languages retain the existing English fallback. Course content is not automatically translated.
- Additive registry migration adds constrained language and nullable location terminology under the provisioning lock. NULL preserves existing client wording. There are no new tenant tables or changes to learner/training records. Setup saves preferences atomically; editing retains authorisation, concurrency checks, audit and rollback.

Validation: focused preference/translation and server-rendered controls checks, the full test suite, multi-client database checks and production build. Desktop/mobile browser verification could not run because this environment has no browser installed and Playwright's browser download returned an invalid/truncated archive. No production data or live email was used in tests.

Main release explicitly authorised by Simon in this task.
