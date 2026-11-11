# Presence consistency final review

## Finding
Commit bde7609 is not snapshot-consistent. It reloads current rows on every
page and removes rows whose updated_at exceeds a timestamp. Updating an
already-returned row shrinks the result before the next offset and skips a
different employee. Updating a later row removes that employee entirely.
Archives have the same problem. Supervisor resolution is performed before
filtering and can mix organization/leadership states. Stable ID ordering or
keyset pagination alone cannot recover historical row values.
The original cloud loader was also subject to the Data API's default 1000-row
limit, so larger datasets could silently truncate.

## Minimal correction
1. A privileged SELECT-only view returns both allowlisted source tables as
   JSON arrays in a single row, in one database SELECT statement. PostgreSQL
   statement-level MVCC applies in both deployment modes; the one-row result
   avoids the cloud row cap. No business tables or authentication are changed.
2. SHA-256 of canonical source content yields an opaque `v1-...` version.
   Both tables contribute to every endpoint version, including inferred
   supervisor dependencies. Timestamp filtering is removed.
3. The client echoes `snapshot.id` using the existing `as_of` query parameter
   for every later page and every other endpoint in the same sync. A mismatch
   returns HTTP 409 with `restart_required: true` and NO data. Missing versions
   at nonzero offsets and invalid/legacy timestamp tokens return HTTP 400.
4. The same protection applies to the changes feed; a cursor is emitted only
   on the final page. Keep `since` unchanged throughout that paginated read.

This is **optimistic content-version-checked pagination**, NOT a retained
transaction or a timestamp-addressable historical snapshot. Each accepted
page comes from the same source content (subject to SHA-256 collision
assumptions). Inserts, updates, archives, deletes, and organization/leader
changes either preserve the version or abort the attempt. Nothing is stored
between requests, so it works across processes and development isolates.

## Consumer contract (required before deployment)
- Start at offset 0 with no as_of; retain the returned opaque snapshot.id.
- Echo that value on every page and all three full-data endpoints.
- Stage all results; verify matching versions and stable totals, unique IDs,
  and a final next_offset of null for each endpoint.
- On ANY failure, mismatch or missing page, discard the entire staged sync;
  keep the last complete dataset and retry with backoff from offset 0.
- Replace the local dataset atomically ONLY after every endpoint completes.
- Periodically full-sync: incremental timestamps still cannot detect hard
  deletions or all derived supervisor changes, and are not a reliable CDC log.

## Verification
- Both new existing-employee update regressions FAIL against bde7609 (the old
  handler returns 200 rather than refusing an inconsistent continuation).
- All 49 Presence tests PASS after correction; all 122 project tests PASS.
- Coverage includes inserts, updates before/after the page boundary, archives,
  physical deletion, leader/supervisor changes, organization changes, version
  matching across all endpoints, continuation validation, cursor finalization,
  and a synthetic 1501-employee aggregate loader result.
- Latest preview build reports OK. All fixtures are synthetic.
- Tests exercise the shared HTTP handler with injected sources, not actual
  network routes against a configured database. Disposable PostgreSQL execution
  was attempted but sandbox user switching was unavailable; SQL execution and
  database-backed success paths remain unverified. No real records were read.

## Deployment readiness: NOT ready for automatic/production deployment
Conditional GO for restricted testing only after the prerequisites below.
No SQL was applied and no deployment was performed as part of this correction.
The current database will fail closed until the source view exists.

1. Review and explicitly apply `scripts/deploy/presence-source-rows.sql` in
   both environments. The existing automatic migration runner does NOT run
   this standalone script. Cloud administrators must apply the same SQL through
   the managed database migration mechanism. Refresh its API schema cache if
   the new view is not immediately discovered.
2. The view denies PUBLIC, anon and authenticated; only service_role gets
   SELECT. The Green Zone app DB user must own the view or receive an explicit
   SELECT grant from IT. Keep the view privileged; do not grant browser roles.
3. Update the Presence Board consumer for opaque versions, 400/409 handling,
   and all-or-nothing staging BEFORE deploying the endpoint correction.
4. Retain the existing integration key, private-network restrictions and rate
   limiter. Smoke-test all four endpoints on Green Zone, including concurrent
   updates and a complete restart/readback. Those environments were not accessed
   for this review; hosted and Green Zone success paths remain unverified.

## Remaining limitations / alternatives
- Continuous writes can force indefinite retries: safety, not guaranteed
  completion under write contention. If this becomes material, use a retained
  immutable snapshot in shared durable storage with TTL, access controls and
  bounded size; per-process memory is unsuitable across development isolates.
- Every page re-reads and hashes the full narrow dataset. Database/HTTP memory,
  timeouts and payload-size limits still apply; test realistic volume. Failures
  abort, not truncate. For small deployments, one complete combined response
  would avoid pagination retries, but changes the API contract more substantially.
- A completed dataset may already be stale when applied; there is no lock
  through client commit and no claim to represent an earlier named timestamp.
- Hashes are not change-log sequence numbers. A change reverted to identical
  allowlisted content is acceptable; unseen intermediate history is not tracked.
- The existing limiter is per-instance and resets on restart, unchanged.