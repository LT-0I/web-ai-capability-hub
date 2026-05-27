# MIGRATION v2.0.0 → v2.1.0 (Phase 8 literature downloads)

## What changed

Phase 8 adds a governed literature PDF download lane without changing the
existing `research_*` citation/search/export tools:

- New `webai_literature_task_status` polling tool for literature queue rows.
- New `webai_<db>_download_pdf` family covering 40 database slugs.
- New `LITERATURE_QUEUED` consumer error code. It is informational and
  non-fatal: responses use `ok: true`, `errorCode: "LITERATURE_QUEUED"`, and a
  durable `task_id` when a request is accepted into the queue instead of run
  immediately.
- Per-database hard cap: at most 20 successful downloads per DB in any rolling
  24-hour window. Requests past the cap enqueue and are retried by the worker
  after the window opens.
- Local-only artifact storage under `data/literature-downloads/<db>/`.

No package version or contract-version bump is required beyond the already-cut
`2.1.0` line. The 8-lock after B8.F remains: package `2.1.0`, contract
`consumer-contract-2.1.0`, commands `232`, `webai_` tools `81`, `research_`
tools `121`, `wah_` tools `8`, error codes `40`, and download-PDF tools `40`.

## Caller upgrade

### Direct success path

Call the database-specific tool with a `doc_id`:

```json
{
  "tool": "webai_arxiv_download_pdf",
  "args": { "doc_id": "1706.03762" }
}
```

Successful direct responses include a local path, byte count, and digest:

```json
{
  "ok": true,
  "errorCode": null,
  "path": "/abs/path/data/literature-downloads/arxiv/1706.03762.pdf",
  "size": 12345,
  "sha256": "...",
  "task_id": null
}
```

Treat `path` as a local operator artifact. The hub does not upload, publish, or
mirror the PDF.

### Queue path

If the per-DB cap is exhausted, the tool accepts the request into SQLite and
returns a non-fatal queue envelope:

```json
{
  "ok": true,
  "errorCode": "LITERATURE_QUEUED",
  "task_id": "00000000-0000-4000-8000-000000000000",
  "path": null,
  "sha256": null
}
```

Poll `webai_literature_task_status` every 60 seconds until the row is terminal:

```json
{
  "tool": "webai_literature_task_status",
  "args": { "task_id": "00000000-0000-4000-8000-000000000000" }
}
```

Terminal `status` values are `done` and `fail`. On `done`, read `result_path`
for the local file path.

## Worker daemon runbook

Build first so the worker entrypoint exists:

```bash
npm run build
```

Start in the foreground during supervised operations:

```bash
node dist/src/literature-worker.js
```

Start in the background for a local operator session:

```bash
nohup node dist/src/literature-worker.js > /tmp/lit-worker.log 2>&1 &
```

Inspect queue state:

```bash
sqlite3 data/literature-queue.sqlite \
  'SELECT status, COUNT(*) FROM download_queue GROUP BY status'
```

Inspect the rolling 24-hour ledger:

```bash
sqlite3 data/literature-rate-limit.sqlite \
  'SELECT db_slug, COUNT(*) FROM download_ledger WHERE downloaded_at > strftime("%s","now","-24 hours")*1000 GROUP BY db_slug'
```

Stop with `SIGTERM`. The daemon stops claiming new rows and lets in-flight
downloads settle before exit.

Production pacing defaults to 30–180 seconds of jitter after a task is claimed.
Tests and controlled local smokes may override `LITERATURE_WORKER_JITTER_MIN_MS`
and `LITERATURE_WORKER_JITTER_MAX_MS`; do not bypass the 20/DB/24h ledger.

## Database matrix

| DB slug | MCP tool | Evidence status | Notes |
| --- | --- | --- | --- |
| `arxiv` | `webai_arxiv_download_pdf` | `IMPLEMENTED_GREEN` | B8.F live/worker E2E covered this DB. |
| `scoap3` | `webai_scoap3_download_pdf` | `IMPLEMENTED_GREEN` | B8.F worker stress covered this DB in cross-DB queue concurrency. |
| `mdpi` | `webai_mdpi_download_pdf` | `IMPLEMENTED_DEFERRED` | Driver implemented; per-DB worker/live E2E deferred. |
| `frontiers` | `webai_frontiers_download_pdf` | `IMPLEMENTED_DEFERRED` | Driver implemented; per-DB worker/live E2E deferred. |
| `pubscholar` | `webai_pubscholar_download_pdf` | `IMPLEMENTED_DEFERRED` | Driver implemented; per-DB worker/live E2E deferred. |
| `scielo` | `webai_scielo_download_pdf` | `IMPLEMENTED_DEFERRED` | Driver implemented; per-DB worker/live E2E deferred. |
| `inspirehep` | `webai_inspirehep_download_pdf` | `IMPLEMENTED_DEFERRED` | Driver implemented; per-DB worker/live E2E deferred. |
| `aip` | `webai_aip_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `aps` | `webai_aps_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `iop` | `webai_iop_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `optica` | `webai_optica_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `opticsjournal` | `webai_opticsjournal_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `siam` | `webai_siam_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `aiaa` | `webai_aiaa_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `asce` | `webai_asce_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `asme` | `webai_asme_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `ieee` | `webai_ieee_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `iest` | `webai_iest_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `iet` | `webai_iet_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `sae` | `webai_sae_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `acs` | `webai_acs_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `cellpress` | `webai_cellpress_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `nature` | `webai_nature_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `rsc` | `webai_rsc_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `royalsoc` | `webai_royalsoc_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `cambridge` | `webai_cambridge_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `degruyter` | `webai_degruyter_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `emerald` | `webai_emerald_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `sciencedirect` | `webai_sciencedirect_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `springer` | `webai_springer_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `tandf` | `webai_tandf_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `wiley` | `webai_wiley_download_pdf` | `IMPLEMENTED_DEFERRED` | Paywalled/session driver; per-DB worker/live E2E deferred. |
| `acm` | `webai_acm_download_pdf` | `IMPLEMENTED_DEFERRED` | Aggregator/session driver; per-DB worker/live E2E deferred. |
| `crc` | `webai_crc_download_pdf` | `IMPLEMENTED_DEFERRED` | Aggregator/session driver; per-DB worker/live E2E deferred. |
| `dblp` | `webai_dblp_download_pdf` | `INTENTIONAL_INVALID_ARGS` | Bibliographic-only; returns `INVALID_ARGS` pointing to metadata + publisher driver handoff. |
| `incopat` | `webai_incopat_download_pdf` | `IMPLEMENTED_DEFERRED` | Patent/session driver; per-DB worker/live E2E deferred. |
| `proquest` | `webai_proquest_download_pdf` | `IMPLEMENTED_DEFERRED` | Aggregator/session driver; per-DB worker/live E2E deferred. |
| `wanfang` | `webai_wanfang_download_pdf` | `IMPLEMENTED_DEFERRED` | Aggregator/session driver; per-DB worker/live E2E deferred. |
| `worldsci` | `webai_worldsci_download_pdf` | `IMPLEMENTED_DEFERRED` | Aggregator/session driver; per-DB worker/live E2E deferred. |
| `wos` | `webai_wos_download_pdf` | `INTENTIONAL_INVALID_ARGS` | Bibliographic/metadata-only; returns `INVALID_ARGS` pointing to metadata + publisher driver handoff. |

## Compatibility notes

- `dblp` and `wos` are deliberately not PDF drivers. Resolve arXiv/DOI or
  publisher metadata first, then call the matching publisher PDF driver.
- Paywalled/session drivers may require an existing authenticated research
  profile and may accept `pdf_url`, `profile`, `output_dir`, and `cdp_port`.
  They must not create a fresh logged-out browser profile.
- The queue is an acceptance mechanism, not an error. Branch on
  `errorCode === "LITERATURE_QUEUED"` and retain `task_id` for polling.
- Local files remain under `data/literature-downloads/<db>/`; consumers should
  copy or ingest them explicitly if they need durable storage elsewhere.

## Wave 14 paywalled residual pickup (2026-05-27)

Wave 14 re-smoked the 18 remaining Wave 13 FAIL databases with serial profile-backed browser sessions. Final result: **5/18 additional GREEN**, moving the cumulative paywalled gate from **20/38 to 25/38**. This is below the target `>=10/18` stop gate; the verified passed fixes were shipped and the remaining items are deferred for operator pickup.

Additional GREEN in Wave 14:

- `aip` — AIP article-PDF path now verifies as a real `%PDF-` artifact.
- `asme` — current ASME semantic PDF selectors and article-PDF path work.
- `cellpress` — Cell Press PII fulltext/PDF resolver works without redirect-loop failure.
- `ieee` — current IEEE `xpl-btn-pdf` / `stamp.jsp` path works.
- `mdpi` — MDPI static `mdpi-res.com` resource resolver works for the smoke DOI.

Permanent-deferred / operator pickup:

- `aps` — article-first resolver exists (`journals.aps.org/<journal>/abstract/<doi>`), but the final serial smoke did not expose a usable PDF link under the current profile/session; likely APS Cloudflare/session drift.
- `asce` — catalog DOI/PDF path unavailable (404/403); verify DOI or entitlement.
- `emerald` — catalog DOI/PDF path unavailable (404); verify DOI.
- `incopat` — catalog patent ID resolves to marketing/home content; visible PDFs are product collateral, not patent artifacts.
- `optica` — OPG captcha challenge; requires manual/operator session clearance.
- `opticsjournal` — catalog article ID redirects to an article-missing error.
- `proquest` — document unavailable for current account/catalog ID.
- `pubscholar` — smoke input is a search/list page, not a concrete article; provide article URL/ID.
- `royalsoc` — catalog DOI/PDF path unavailable (404/403); verify DOI or entitlement.
- `sae` — catalog DOI returns 404 and download path is HTML/non-PDF.
- `sciencedirect` — current network/profile receives 403 bot/challenge.
- `siam` — catalog DOI/PDF path unavailable (404/timeout).
- `wanfang` — catalog record is missing; generic Wanfang product PDFs are now filtered to prevent false-positive PDF success.

Artifacts: `.runs/wave-14/probes/`, `.runs/wave-14/smoke-matrix.md`, and `.omc/codex-out/wave-14-paywalled-fail-cluster-fix.md`.
