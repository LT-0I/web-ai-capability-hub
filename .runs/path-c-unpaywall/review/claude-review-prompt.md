# Claude cross-model reviewer task — Path C Unpaywall OA fallback

Repo: `/home/l1u/workspace/noeticmind/web-ai-capability-hub`

You are the required Claude reviewer for a Codex-authored change. Review the Path C Unpaywall OA fallback integration before commit.

## Inputs to read

1. Diff patch: `/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/path-c-unpaywall/review/path-c-diff.patch`
2. Current source files as needed under the repo.
3. Evidence files:
   - `/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/path-c-unpaywall/8-lock.json`
   - `/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/path-c-unpaywall/livesmoke/optica-resmoke.json`
   - `/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/path-c-unpaywall/livesmoke/sae-resmoke.json`
   - `/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/path-c-unpaywall/livesmoke/asce-resmoke.json`
   - `/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/path-c-unpaywall/livesmoke/springer-resmoke.json`
   - `/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/path-c-unpaywall/livesmoke/sciencedirect-resmoke.json`

## Review focus

- Unpaywall client behavior:
  - email required;
  - 404 returns null result, not throw;
  - 429 throws `RPC_RATE_LIMITED`;
  - timeout/network throws `NETWORK_ERROR`;
  - malformed JSON fails gracefully;
  - max one concurrent request.
- Paywalled integration:
  - publisher success returns `oa_source: "publisher"` and does not call Unpaywall;
  - failed publisher path tries Unpaywall only when `unpaywall_fallback` is true, DOI exists, and email exists;
  - Unpaywall success writes a verified `%PDF-` and returns `oa_source: "unpaywall"`;
  - miss/error/no-email remains honest failure with hint and `oa_source: "none"`.
- Driver opt-in: DOI-based paywalled drivers only; no Chinese-only/proquest opt-in.
- Contract/schema/CLI/redaction/docs/version/golden lock correctness.
- Tests are meaningful and low-flake.

## Required validation test

Write exactly one validation script under:
`/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/path-c-unpaywall/review/claude-validation.mjs`

The script should be self-contained Node.js and check at least one high-value invariant not already covered by the new unit tests. Prefer checking cross-file contract/driver consistency (for example: every command with optional `unpaywall_email` has `oa_source`, all selected DOI drivers have `unpaywall_fallback: true`, excluded DBs do not, schema and redaction include the field).

Then execute:
`node .runs/path-c-unpaywall/review/claude-validation.mjs`

Write your final reviewer report to:
`/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/path-c-unpaywall/review/claude-review-report.md`

## Constraints

- Do not modify source, tests, docs, package files, generated files, or contract files.
- You may write only files under `.runs/path-c-unpaywall/review/`.
- Do not use the network.
- Blockers first. If no blockers, say `VERDICT: PASS`.
- Include the validation command and its observed result.
