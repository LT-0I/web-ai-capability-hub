# Phase 8 — Academic DB Literature Download (41 DBs, 121 research_* tools)

**Status**: QUEUED 2026-05-25. **Pre-condition**: Phase 7 B9 shipped + green
(all 40 webai_* tools migrated to extension-assisted-cdp base + 2.0.0 cut).
DO NOT start until B9 lands. Re-read this doc + ask user to re-confirm scope
at that point.

## Scope

For each of the **41 academic DBs** currently covered by `research_*` (121
total tools — sample DBs: inventory, aiaa, wos, acm, ieee, acs, asme, rsc,
wiley, asce, ...):

1. **Preserve** all currently-shipped per-DB functions (search,
   get_metadata, list, etc.) — Phase 8 is additive, not replacement.
2. **Add** a literature-download capability: tool that takes a search
   result / DOI / document ID and downloads the full-text PDF (or
   publisher-native format if no PDF).
3. **Persist** each downloaded artifact in TWO places:
   - Local filesystem: `data/literature-downloads/<db_slug>/<doc_id>.<ext>`
     (or similar — confirm layout with user before B8 dispatch).
   - URL-addressable registry: **AMBIGUOUS — needs user clarification**.
     Possibilities: (a) write to a content-addressed local HTTP server
     and return `http://localhost:<port>/literature/<sha>`; (b) upload to
     a configured object store (S3 / Cloudflare R2 / etc.) and return its
     URL; (c) just record the publisher URL alongside the local path.

## HARD constraint — rate limit / anti-detection

- **≤20 downloads per DB per rolling 24h window.** User-specified hard
  ceiling to avoid triggering publisher anti-fraud / IP-mark systems.
- Driver MUST consult a shared rate-limit ledger before each download
  request and REJECT with a dedicated error code (e.g.
  `LITERATURE_RATE_LIMIT_EXCEEDED` — confirm new error code with user;
  do NOT invent silently per existing 39-error taxonomy).
- Recommended ledger shape: SQLite table at
  `data/literature-rate-limit.sqlite` with rows `(db_slug, doc_id,
  downloaded_at)`. Driver queries `count(*) WHERE db_slug=? AND
  downloaded_at > now() - 24h` before issuing the network request.
- Additional anti-detection measures to design (open question for user):
  randomized inter-request delay (e.g. 30-180s), respect publisher
  robots.txt, avoid concurrent downloads to same DB, possibly rotate
  through user-configured CDP profiles.

## Architecture

41 DBs × ~3 existing tools + 1 new download tool ≈ ~50-70 new functions.
Will need bucketing similar to Phase 7. Likely shape:

- **B8.A (shared infra)**: SQLite ledger schema, download dir layout,
  new error codes, shared `ensureLiteratureDownloadQuota()` helper, CLI
  `--download-dir` arg shape.
- **B8.B-B8.G (6-8 buckets of ~6 DBs each)**: per-DB driver work.
- **B8.H (golden + integration tests)**: end-to-end download against
  one or two safe DBs (e.g. open-access ones); contract bump if new
  output schema.
- **B8.I (docs + MIGRATION)**: user-facing rate-limit guarantees,
  ledger inspection CLI.

## Resolved decisions (USER 2026-05-25)

1. **URL-archive shape**: LOCAL DIRECTORY ONLY. No HTTP server, no
   object store. Tool outputs absolute path string. Simplest, no
   network surface, no extra process.
2. **Download dir layout**: `data/literature-downloads/<db_slug>/<doi-or-id>.pdf`
   — by-DB subdir + human-readable filename. Operator can `ls` and see
   provenance at a glance.
3. **Rate-limit scope**: **per DB global 20/24h**. NOT per profile. Multi
   profiles do NOT lift the cap — they sum into the same 20 ceiling.
   Protects against publisher fingerprint-then-merge anti-fraud.
4. **Cap-exceeded behavior**: ENQUEUE + auto-retry next 24h window
   (NOT hard error). Driver writes the request to a queue table; a
   worker daemon picks it up when the window opens.
5. **Anti-detection**: randomized inter-download delay **30-180s** +
   single-DB serial. No UA spoofing, no cookie rotation (avoid
   "patches on patches" per CLAUDE.md anti-stealth rule).
6. **Queue architecture**: **SQLite queue table + standalone worker
   daemon**. Schema: `data/literature-queue.sqlite` with rows
   `(id, db_slug, doc_id, status[queued/running/done/fail],
   queued_at, started_at, completed_at, error)`. Worker is a long-
   running `nohup` process that scans the queue, respects per-DB
   serial + 30-180s jitter + 20/24h cap, and updates rows. Caller
   polls status via new `webai_literature_task_status` tool.
7. **Cross-DB concurrency**: cross-DB parallel OK; intra-DB strict
   serial. Worker can pump ieee + acm at the same time but never
   2 requests against acm simultaneously.
8. **Existing research_* contract**: UNCHANGED. The 121 currently-
   shipped tools keep their output shape. New
   `webai_<db>_download_pdf` tool accepts any `doc_id` and discovers
   downloadability at runtime. No body augmentation of search /
   get_metadata. Avoids golden re-bake on Phase 8.

## Bucket re-design implied by the decisions

- **B8.A (shared infra)**:
  - SQLite schemas for queue + 24h-window ledger (probably one db with
    two tables).
  - New error codes (need contract bump — decide at B8.A dispatch
    whether to introduce them):
    - `LITERATURE_QUEUED` — request accepted into queue, caller should
      poll status (NOT a fatal error, ok=true result).
    - Possibly `LITERATURE_QUEUE_FULL` if queue grows beyond sane cap.
  - `webai_literature_task_status` new tool (parallel of
    `webai_task_status`).
  - Standalone worker daemon: `node dist/src/literature-worker.js` with
    its own service file or simple nohup install pattern. Document
    install + start in `docs/MAINTENANCE_RUNBOOK.md`.
  - Shared `assertLiteratureQuota(db_slug)` + `recordLiteratureDownload(db_slug, doc_id)`
    helpers used by every per-DB download driver.
- **B8.B-B8.G (6 buckets of ~6-7 DBs each)**: per-DB
  `webai_<db>_download_pdf` driver implementations. Each driver:
  (1) consults quota → enqueue if at cap; (2) reads publisher
  fetch URL from existing search/get_metadata path; (3) downloads via
  managed-cdp browser download API to `data/literature-downloads/<db>/`;
  (4) records (sha, db, doc_id, path, url, downloaded_at) into
  manifest table; (5) returns local path.
- **B8.H (worker + integration tests)**: end-to-end test on at least
  one open-access DB (arXiv / PubMed Central / PLoS) where downloads
  are legally + technically safe to exercise during tests.
- **B8.I (docs)**: MIGRATION_v2.x notes about literature dir +
  worker install + rate-limit guarantees.

## Estimated bucket count

8 buckets total (B8.A through B8.H, plus B8.I docs). Each bucket follows
Phase 7 dispatch pattern: omx exec --xhigh, harness-tracked Bash, file-
presence or harness notification.

## Anti-patterns to forbid (will go in B8 prompts)

- DO NOT bypass the rate-limit ledger "just for testing" — testing
  hits the ledger too.
- DO NOT scrape publisher pages without honoring robots.txt + per-IP
  cooldowns the publisher publishes (e.g. Crossref polite pool).
- DO NOT store credentials in the ledger or in download metadata.
- DO NOT add a graceful fallback that downloads from a "cached mirror"
  if the rate-limit blocks the primary — that just shifts the problem
  to a different IP.
- Use existing contract error codes; if `LITERATURE_RATE_LIMIT_EXCEEDED`
  is genuinely new, treat that as a deliberate contract bump (separate
  decision before B8.A).

## Status log

- 2026-05-25 — Plan authored, queued. Awaiting Phase 7 B9 completion.
