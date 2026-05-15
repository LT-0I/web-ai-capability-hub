# R10 — Cross-Process E2E Video Verification

Date: 2026-05-15. Method: project CLI only (`node dist/src/cli.js ...`).
No Playwright MCP, no raw codex, no process kill/launch/restart, no src/tests/configs edits, no commit.

---

## 1. Clean build + tests

```
rm -rf dist && npm run build   → exit 0, tsc clean (no errors)
npm test                       → 157 pass / 0 fail / 0 skip
```

---

## 2. Regression spot-check (grep, no edits)

| Anchor | Count | Pass? |
|---|---|---|
| `detached` in src/mcp/tools.ts | 2 | ✓ present |
| `setImmediate` in src/mcp/tools.ts | 0 | ✓ removed |
| `waitForEvent` in src/mcp/tools.ts | 1 | ✓ present |
| `export-to-docs-button` in src/mcp/tools.ts | 2 | ✓ present |
| `Download video` in src/mcp/tools.ts | 3 | ✓ present |
| `regenerate-button` in src/mcp/tools.ts | 3 | ✓ present |
| `consumer-contract-1.3.0` in configs/consumer-contract.json | 1 | ✓ unchanged |

---

## 3. Process A — generate-video (must exit quickly)

Command:
```
node dist/src/cli.js webai:gemini:generate-video \
  --profile gemini-9225 \
  --prompt "a 2-second clip of a rotating blue cube" \
  --download-dir .runs/web-ai-explore/stream4-joint-work-2026-05-14/r10-video \
  --output-json
```

Returned immediately (< 1s) with valid 5-key envelope:
```json
{
  "task_id": "task_1778846439993_a154a1223dd7",
  "status": "running",
  "profile": "<profile>",
  "lease_id": "lease_1778846439993_46a54b80",
  "started_at": "2026-05-15T12:00:39.993Z"
}
```

All 5 required contract keys present (`task_id`, `status`, `profile`, `lease_id`, `started_at`). Process A fully exited.

Evidence: `resmoke-r10-generate-video.json`

---

## 4. Process B — cross-process poll (separate node invocations)

Each poll is a completely separate `node dist/src/cli.js webai:task-status --task-id <id>` invocation, running after Process A had already exited. This is the case that returned `INVALID_ARGS` (RED) in R8.

| Timestamp (UTC) | Poll # | Status | Notes |
|---|---|---|---|
| 2026-05-15T12:00:51Z | 1 | running | progress_label: "queued Gemini video generation" |
| 2026-05-15T12:01:06Z | 2 | running | same |
| 2026-05-15T12:01:21Z | 3 | running | same |
| 2026-05-15T12:01:37Z | 4 | running | same |
| 2026-05-15T12:01:52Z | 5 | running | same |
| 2026-05-15T12:02:07Z | 6 | **done** | progress_label: "video generated and downloaded" |

Total generation time: ~87 seconds. Terminal `done` with result block:
```json
{
  "status": "done",
  "progress_label": "video generated and downloaded",
  "result": {
    "path": "<home>/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream4-joint-work-2026-05-14/r10-video/mp_.mp4",
    "sha256": "5c0045ee13aa498e881908dbb29bb3b9f4d0e5a639dc1f328533c2e41b449825",
    "size_bytes": 2029376,
    "download_filename": "mp_.mp4"
  }
}
```

Evidence: `resmoke-r10-taskstatus-trace.txt`

---

## 5. Cross-process sanity (explicit re-read after polling loop)

A brand-new `node dist/src/cli.js webai:task-status` process (not the poll loop) read the task from the already-exited Process A:
- Returned `status: "done"` with the same result block
- Confirms durable DB read works from any fresh process, not just within the polling loop

This is the core regression fix validated: previously this returned `INVALID_ARGS`.

---

## 6. MP4 artifact verification

Path: `.runs/web-ai-explore/stream4-joint-work-2026-05-14/r10-video/mp_.mp4`

```
size:  2,029,376 bytes (2.0 MB)
file:  ISO Media, MP4 Base Media v1 [ISO 14496-12:2003]
magic: 00000020 66747970 69736f6d  (ftypisom — valid MP4 container)
sha256: 5c0045ee13aa498e881908dbb29bb3b9f4d0e5a639dc1f328533c2e41b449825
```

Real Veo-generated MP4. Size > 0, valid ISO Media container.

---

## 7. Verdict

| Check | Result |
|---|---|
| Clean build exit 0 | GREEN |
| 157/157 tests pass | GREEN |
| Envelope 5 keys valid | GREEN |
| Process A exits immediately (non-blocking) | GREEN |
| Process B (separate process) sees task | GREEN — cross-process durable DB works |
| Status transitions seen (running → done) | GREEN |
| Terminal state is `done` (not error) | GREEN |
| MP4 on disk, ISO Media, size > 0 | GREEN |
| Cross-process sanity (fresh process post-loop) | GREEN |
| `detached` present, `setImmediate` absent | GREEN |
| `consumer-contract-1.3.0` unchanged | GREEN |
| All regression anchors present | GREEN |

**OVERALL: GREEN**

The cross-process CLI polling now works. The R8 architectural limitation (`INVALID_ARGS` when polling from a separate process) is resolved. Codex's durable `CapabilityDatabase` task rows + detached worker fix is live-verified end-to-end:
- Process A queues the task in the durable DB and exits immediately
- The detached worker runs the real Veo generation in the background
- Process B (and any subsequent fresh process) reads the task state from the DB without access to Process A's memory
- Terminal `done` with a real 2.0 MB MP4 confirmed on disk

No blocker. No honest error code returned — generation succeeded cleanly.

---

## Evidence files

- `resmoke-r10-generate-video.json` — Process A envelope
- `resmoke-r10-taskstatus-trace.txt` — full Process B poll trace
- `.runs/web-ai-explore/stream4-joint-work-2026-05-14/r10-video/mp_.mp4` — the artifact
