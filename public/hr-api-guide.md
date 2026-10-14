# Fit2Trade HR / payroll API v1

Enable **HR & payroll integration** and **Joiner, mover and leaver handling** in Settings. Organisation and client platform admins manage credentials at Integrations. Each credential is restricted to that client's HR endpoints; it cannot sign into the app, grant permissions, read training records, or access another client.

Create a named credential, copy it once and store it in your integration's secret store. It expires after 365 days. Rotate it before expiry; rotation immediately invalidates the old secret. Revocation immediately stops new requests and pauses queued changes associated with that credential. Credentials are stored as SHA-256 hashes; secrets are never logged. Use HTTPS.

## Endpoints

- `GET /api/hr/v1/reference?client=YOUR-CLIENT-SLUG`: active stores, departments and job roles (including payroll role codes).
- `POST /api/hr/v1/employees?client=YOUR-CLIENT-SLUG`: preview or apply 1–25 employee events.
- Both require `Authorization: Bearer YOUR-CREDENTIAL`. POST also uses `Content-Type: application/json`.
- Limit: 60 requests per minute per credential. On HTTP 429, wait 60 seconds. Limit request bodies to 100 KB. Do not send payroll amounts, bank details, dates of birth, passwords or permission grants.

```json
{
  "dryRun": true,
  "employees": [{
    "eventId": "payroll-20261020-0000123-01",
    "employeeId": "0000123",
    "action": "starter",
    "effectiveDate": "2026-10-20",
    "reason": "New starter from payroll",
    "name": "Alex Murphy",
    "email": "alex@example.com",
    "storeId": "STORE-ID-FROM-REFERENCE",
    "jobRoleId": "ROLE-ID-FROM-REFERENCE"
  }]
}
```

Set `dryRun` to false (or omit it) to apply. Preview validates records without saving employee changes or events; authentication usage counters still advance. Preview does not reserve records or simulate earlier rows: validate again at submission. Each row is its own transaction; a failed row does not undo successful rows. Always inspect `results`, even with HTTP 200. Results include eventId, employeeId, status and errors; successful changes include learnerId and pathwayFailures.

## Fields and identity

`eventId`, `employeeId`, `action`, `effectiveDate` and `reason` are mandatory. Event IDs are unique within the client, 1–100 letters, digits, dots, underscores or hyphens. Employee IDs map to the existing LMS employee/workday ID, are uppercased, preserve leading zeros, and accept 1–50 letters, digits, dots, underscores or hyphens (first character alphanumeric). Never recycle employee IDs. Records are never matched by email.

Actions:
- `starter`: new ID only; requires name and an active storeId. Email is optional and may be null.
- `update`: existing active employee; omitted fields remain unchanged. `email`, `departmentId`, `jobRoleId` can be null to clear. Explicit empty values are rejected.
- `leave`: existing active employee; only eventId, employeeId, action, effectiveDate, reason. Archives access, invalidates sessions and preserves training evidence. A person missing from a feed is never archived.
- `rehire`: existing archived employee; preserves learner ID/history, clears the leaving date and uses effectiveDate as the new start date. It does not revive previous sessions or assessor privileges.

Optional fields: name (2–101 characters), email, storeId, jobRoleId, departmentId, startDate. Reasons are 3–500 characters. Dates use real YYYY-MM-DD calendar dates. startDate cannot exceed effectiveDate. Name is a combined display name. Country derives from the selected store; stores and roles must already exist in the client's directory. Administrator accounts require manual handling; the API cannot modify them or grant access.

## Scheduling, ordering and retries

Dates are UTC dates. Past/today events apply immediately. Future events are validated, queued and revalidated when due; a changed/archived store or changed permissions can make them fail later. Starters are created on their effective date, so follow-on events should be sent after creation. Scheduled processing checks every five minutes, up to 25 rows per client per run. Production background jobs must be enabled; previews never process jobs. Disabled features, revoked or expired credentials pause processing. Administrators can cancel scheduled events and retry failed events in Sync history. An expired credential can be rotated to resume processing.

Reusing an eventId with the identical normalized payload returns its stored outcome without applying again. A different payload with the same ID conflicts. A stored failure is not automatically retried by resending: an admin can retry it after correcting the underlying issue, or the provider can use a new eventId. On network failure/timeout, resend the same eventId. Providers must preserve chronological order per employee; the API rejects a change dated earlier than an already-applied event for that employee. Same-day ordering remains the provider’s responsibility. Correct queued changes by cancelling the original event and sending a new eventId.

## Ownership and training

API changes mark the employee as payroll managed. Manual identity, site, role, department and employment-date changes are blocked at database level, including CSV imports. Admins can still archive access for urgent security reasons. Cancel queued events before releasing payroll control. To stop future syncs, revoke the credential or remove the employee from the source feed; a new accepted API change takes ownership again.

Existing training history and outstanding assignments are retained on transfer. The existing credit and automatic pathway rules run after starter/update/rehire. Review pathwayFailures and the existing assignment-failure report; employee success does not promise sufficient credits for every pathway assignment.

No password is sent or returned. Use the existing password recovery flow for staff with email, or an explicitly configured SSO process. Staff without email require a supported account activation method before they can sign in. No outbound email is sent by these endpoints.

Training-status exports/webhooks and scheduled CSV ingestion are outside v1. This API provides the receiving endpoint: the client's payroll provider must configure its outbound connector.
