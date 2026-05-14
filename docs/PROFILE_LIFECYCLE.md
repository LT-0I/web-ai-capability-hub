# Browser profile lifecycle

Phase 2 adds a local lease/audit layer for managed browser profiles. It is deterministic infrastructure only: it does not start Chrome for tests and does not attempt anti-bot bypass.

## Lease semantics

A profile lease records:

```json
{
  "profile_id": "chatgpt",
  "run_id": "run_...",
  "owner_pid": 1234,
  "acquired_at": "2026-05-14T00:00:00.000Z",
  "last_heartbeat_at": "2026-05-14T00:00:00.000Z",
  "chrome_process_pid": 5678,
  "user_data_dir": "/home/.../data/browser-profiles/chatgpt",
  "released_at": null
}
```

A lease is active while `released_at` is absent. Workflow/browser code may attach `run_id` when a run owns the profile. `owner_pid` is the hub process that acquired the lease; `chrome_process_pid` is the browser process when known.

## Audit output

`browser:audit --output-json` returns one entry per known profile directory under `data/browser-profiles/*` plus profiles from metadata:

```json
{
  "profileId": "chatgpt",
  "profileDir": "/home/.../data/browser-profiles/chatgpt",
  "chromePid": 5678,
  "chromeAlive": false,
  "cacheSizeBytes": 123456,
  "lastUsedAt": "2026-05-14T00:00:00.000Z",
  "staleLockFiles": ["/home/.../SingletonLock"],
  "lease": { "profile_id": "chatgpt" }
}
```

`cacheSizeBytes` sums common Chromium cache directories when present. `staleLockFiles` only reports `SingletonLock`, `SingletonSocket`, or `SingletonCookie` when the associated Chrome pid is absent or dead.

## Recovery paths

- Normal teardown: release the lease when the workflow ends.
- Dead Chrome with stale locks: run `browser:close --profile <name> --release-lease --json`; lock files are removed only when the known Chrome pid is not alive.
- Live Chrome: `--release-lease` refuses with `PROFILE_LEASE_BUSY`.
- Manual override: add `--force` only after confirming the browser is safe to abandon.

Sensitive fields (`profileDir`, `user_data_dir`, URLs in evidence) are local-only and are redacted by default in trace/error paths.
