# Release 86 — Email notification switches

Based on main c426011. Version 1.14.10.26.86.

- Replace the email notification type checkboxes with the same on/off switches used in Settings.
- Extract the existing Settings control and CSS into a shared SettingsSwitch component. Preserve feature locking, parent-feature rules and the existing Settings save flow.
- Arrange email notification names on the left and switches plus translated On/Off labels on the right, in compact rows with subtle dividers.
- Keep enabled templates in the existing local settings state until Save settings is selected. Preserve disabled/busy states, keyboard operation, accessible names and switch state.
- Keep the email mode, timings, report schedules, permissions and delivery logic unchanged.

See PR for final test, build and browser verification results. Main/production requires explicit approval under AGENTS.md.
