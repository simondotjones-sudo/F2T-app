# Release 82 — Platform admin login codes

Based on main `303dc185eb91f37b281df2e04795e71e016b9954` (Release 81). Version `1.13.10.26.82`. Implementation is requested; production release still requires Simon's explicit approval under AGENTS.md.

## User flow

1. Open **Platform administration → Platform admins → Add platform admin**.
2. Enter the person's name and email. Create the login code.
3. Copy the code and share it privately with the displayed `/platform-access` address. No email service is required and no email is sent.
4. The recipient enters their email and code, chooses a password of 16–128 characters, and is signed into Clients. Later visits use the normal email/password login. The normal login screen also links to code entry.

The list shows the primary account and each named account, including active, pending, expired and disabled states. An administrator can issue a replacement code, including for password recovery without email. Issuing a replacement invalidates the previous code; an active account's current password continues working until redemption. Redeeming changes the password and ends its previous sessions. Disabling immediately cancels its codes, reset links and sessions. Re-enabling through a fresh code requires redemption before sign-in. Administrators cannot change their own access or disable the configured primary account.

## Authentication and data

- Global platform operators are separate from client-scoped `platform_admins`. Only `getPlatformOperator()` authorises management. A learner cookie always takes priority, so a second admin cookie cannot elevate a client user.
- Codes have 128 bits of cryptographic randomness, are stored only as SHA-256 hashes, expire in seven days and are redeemed once in a serialized transaction. They bind to the entered email. Raw codes are returned once in a private/no-store response and never enter audit records.
- Passwords reuse the existing salted scrypt implementation. Login sessions retain HttpOnly, SameSite=Strict, secure-on-HTTPS cookies and eight-hour expiry. Per-account limits are shared by both password login endpoints; code entry permits five attempts in fifteen minutes.
- Each operator has its own credential fingerprint. One operator signing in no longer clears other operators' sessions. A credential change during sign-in cannot produce a session using the changed credential. Existing bootstrap rotation, learner login, shared-email account separation and tenant access remain intact.
- Named accounts use the existing password recovery transport when email is enabled; manually issued codes remain available without email.
- Successful invitations, replacement codes, redemption, disablement and password reset receive a global audit record with actor, target and timestamp.
- The new additive migration creates `public.lms_platform_operators` and `public.lms_platform_operator_audit` under provisioning lock 62111700. These are control-plane authentication tables, deliberately excluded from `lms_schema_tables`, the client template and every tenant schema. No client runtime role receives access. No existing migration is changed.
- Interface strings use all 14 existing languages. PWA installation prompts stay hidden during code activation.

## Validation

The new PGlite integration coverage checks global permissions, tenant-role denial, dual-cookie isolation, CSRF, normalized/duplicate emails, pending accounts, hashed/no-store codes, email binding, password length, expiry, replacement, concurrent single-use redemption, audit contents, multi-client access, independent admin sessions, operation without bootstrap configuration, self/primary protection, password recovery, credential-race rejection, immediate disablement and rate limits.

- Full `pnpm test` passed, including 119 Netlify migration checks and 66 multi-tenant integration groups.
- Production `pnpm build` and TypeScript checks passed.
- Translation audit passed for 1,690 interface/message keys across 14 languages.
- Targeted ESLint passed for the new pages and APIs plus the changed authentication/domain modules. Existing shared UI lint findings remain outside this change.
- The isolated production-build browser check passed at 1365px desktop and 390px mobile: code creation, recipient activation, automatic login to Clients, global access and immediate revocation. Screenshots were visually checked for fit. Browser tests use local PGlite, fictional accounts and disabled outbound email/jobs. Repeat with `node tests/platform-operators-browser-check.mjs`; set `LMS_TEST_PLAYWRIGHT_MODULE` and `LMS_TEST_CHROMIUM` when needed.

## Release

Use the branch and PR workflow and obtain explicit main/production approval. Verify the hosted additive migration and deployment before reporting the feature live. Do not remove global account or audit tables when rolling back an interface change.
