# Claude reviewer report (OMC advisor)

Source artifact: `.omc/artifacts/ask/claude-read-home-l1u-workspace-noeticmind-web-ai-capability-hub-run-2026-05-27T07-10-28-173Z.md`

# Path C Unpaywall OA Fallback — Reviewer Report

## Blockers
None identified. Contract → schemas → drivers → golden → tests round-trip is coherent; ASCE pre-flight now correctly falls through to `runPaywalledLiteratureDownloadPdfTool` when `unpaywall_email` is supplied (the Unpaywall lane uses pure `fetch`, so it bypasses the failing CDP profile path); the OA fetch is bounded by `WEBAI_UNPAYWALL_PDF_FETCH_TIMEOUT_MS` (default 30s) with `AbortController` wiring, fixing the prior unbounded-hang risk.

## Non-blocking concerns
1. **Error code remapping (`errorOutputWithUnpaywallHint`)** — when a fallback is attempted and fails, the underlying publisher error code is overwritten with `LOGIN_REQUIRED` unless it was `INVALID_ARGS`/`PROFILE_NOT_FOUND` or `/pass pdf_url/`. A `NETWORK_ERROR` or `ARTIFACT_DOWNLOAD_TIMEOUT` from the publisher attempt will be reported as `LOGIN_REQUIRED` — semantically lossy. Consumers may misdiagnose infra outages as auth gating. The hint string preserves the truth in `message`, but the contract-level taxonomy is the load-bearing signal. Consider preserving the original code when the publisher attempt failed with a non-auth class.
2. **Type discipline** — `LiteratureDownloadPdfOutput` was not widened to carry `oa_source`; instead, ~6 sites use `as LiteratureDownloadPdfOutput & { oa_source: "none" }` casts. Functional, but a single forgotten cast in a future queued/error path silently drops the contract-required field. A `PaywalledLiteratureDownloadPdfOutput` union would catch this at `tsc`.
3. **Process-wide Unpaywall mutex** — `withSingleUnpaywallRequest` serializes ALL Unpaywall API calls across all drivers/DOIs in the process. Politeness-correct for the unpaywall.org rate limit, but at high call volume the entire 31-driver fleet single-files through one tail. Acceptable for current scale; flag for future revisit.
4. **Unpaywall lane bypasses managed CDP** — `fetchPdfBufferFollowingHtml` uses Node `fetch` (egress from the hub host, not the user's authenticated Chrome). For legal OA copies this is fine, but it is a new architectural concept (publisher = CDP, OA = Node) that should be called out in MIGRATION_v2.2 / docs.
5. **Hardcoded UA version strings** — `web-ai-capability-hub-literature-downloader/2.2.0` and `web-ai-capability-hub-unpaywall/2.2.0` will drift on next minor bump. Sourcing from `package.json` would prevent rot.
6. **Test coverage of happy path not visible in diff** — `package.json` adds `dist/tests/literature/*.test.js` to the test glob and bumps `735/735`, but no `tests/literature/*.test.ts` files appear in this patch (only the `traceRedact.test.ts` Unpaywall-redaction case is shown). If those `.test.ts` files exist outside the diff window, fine; if the glob is empty, the 735 count is suspect.
7. **`buffer.toString()` without explicit `"utf8"`** — cosmetic; Node default is `utf8` so behavior is unchanged.

## Recommended validation script
Run from repo root after `npm run build`:

```javascript
#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = process.cwd();
const contract = JSON.parse(fs.readFileSync(path.join(root, "configs/consumer-contract.json"), "utf8"));
const golden = JSON.parse(fs.readFileSync(path.join(root, "tests/golden/listMcpTools.236.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

// 1. Lock invariants
assert.strictEqual(pkg.version, "2.2.0", "package.json version");
assert.strictEqual(contract.package_version, "2.2.0", "contract package_version");
assert.strictEqual(contract.contract_version, "consumer-contract-2.2.0");
assert.strictEqual(contract.commands.length, 232, "commands lock");
assert.strictEqual(contract.error_codes.length, 40, "error_codes lock");
assert.strictEqual(golden.count, 236);
assert.strictEqual(golden.tools.length, 236);
assert.strictEqual(contract.commands.filter(c => /^webai_/.test(c.mcp_name || "")).length, 81, "webai_ lock");
assert.strictEqual(contract.commands.filter(c => /^research_/.test(c.mcp_name || "")).length, 121, "research_ lock");

// 2. Classify webai_*_download_pdf commands. Paywalled = optional_args includes pdf_url.
const dlCmds = contract.commands.filter(c => /^webai_.+_download_pdf$/.test(c.mcp_name || ""));
assert.strictEqual(dlCmds.length, 40, "expected 40 webai_*_download_pdf rows");

const paywalled = dlCmds.filter(c => Array.isArray(c.optional_args) && c.optional_args.includes("pdf_url"));
const nonPaywalled = dlCmds.filter(c => !paywalled.includes(c));
console.log(`paywalled=${paywalled.length} non-paywalled=${nonPaywalled.length}`);

// 3. Contract: every paywalled cmd must advertise oa_source + accept unpaywall_email.
for (const cmd of paywalled) {
  const ap = (cmd.output_keys && cmd.output_keys.always_present) || [];
  const opt = cmd.optional_args || [];
  assert.ok(ap.includes("oa_source"), `${cmd.mcp_name}: missing oa_source in always_present`);
  assert.ok(opt.includes("unpaywall_email"), `${cmd.mcp_name}: missing unpaywall_email in optional_args`);
}

// 4. Non-paywalled (arxiv-class + dblp/wos biblio) must NOT advertise unpaywall_email
//    (keeps the consumer surface minimal and prevents drift into free-OA drivers).
for (const cmd of nonPaywalled) {
  const opt = cmd.optional_args || [];
  assert.ok(!opt.includes("unpaywall_email"), `${cmd.mcp_name}: unexpected unpaywall_email on non-paywalled cmd`);
}

// 5. Golden JSON: each paywalled tool inputSchema must carry unpaywall_email:string.
const goldenByName = new Map(golden.tools.map(t => [t.name, t]));
for (const cmd of paywalled) {
  const tool = goldenByName.get(cmd.mcp_name);
  assert.ok(tool, `golden listMcpTools missing tool ${cmd.mcp_name}`);
  const props = (tool.inputSchema && tool.inputSchema.properties) || {};
  assert.ok(
    props.unpaywall_email && props.unpaywall_email.type === "string",
    `${cmd.mcp_name}: golden inputSchema missing unpaywall_email:string`
  );
  assert.ok(!(tool.inputSchema.required || []).includes("unpaywall_email"),
    `${cmd.mcp_name}: unpaywall_email must remain optional in required[]`);
}

// 6. Sensitive-field classification present so traces are scrubbed.
const sens = (contract.sensitive_fields || {}).unpaywall_email;
assert.ok(typeof sens === "string" && /redact/i.test(sens),
  "sensitive_fields.unpaywall_email must be classified as redact-in-logs");

// 7. Driver-level coverage check: every paywalled cmd should have a sibling src/mcp/submcp/literature/<db>.ts
//    that declares unpaywall_fallback: true OR builds its own emptyOutput with oa_source.
const litDir = path.join(root, "src/mcp/submcp/literature");
for (const cmd of paywalled) {
  const slug = cmd.mcp_name.replace(/^webai_/, "").replace(/_download_pdf$/, "");
  const driverPath = path.join(litDir, `${slug}.ts`);
  assert.ok(fs.existsSync(driverPath), `driver missing: ${driverPath}`);
  const src = fs.readFileSync(driverPath, "utf8");
  const hasFlag = /unpaywall_fallback:\s*true/.test(src);
  const hasOwnOaSource = /oa_source\s*:/.test(src);
  assert.ok(hasFlag || hasOwnOaSource,
    `${slug}: driver advertises oa_source in contract but neither sets unpaywall_fallback:true nor builds its own oa_source output`);
}

console.log(`PASS — ${paywalled.length} paywalled drivers carry oa_source + unpaywall_email end-to-end; locks intact.`);
```

This single script verifies (a) the 8-lock invariants, (b) contract↔golden parity on the new property, (c) per-driver source-level coverage of `unpaywall_fallback`/`oa_source`, and (d) that the property is correctly absent from non-paywalled drivers — i.e. the three failure modes most likely to be introduced by a future per-DB additive patch.

## VERDICT: **PASS**

Contract round-trip is complete, sensitive-field redaction is wired, the OA fetch is now bounded, and the ASCE pre-flight fall-through is correct. The concerns above are quality/maintenance polish, not safety or contract violations.

## Validation execution

The Claude-recommended validation was adapted from CommonJS to ESM for this repo and narrowed so non-opted-in generic paywalled drivers are allowed to expose `unpaywall_email`/`oa_source` without enabling `unpaywall_fallback`. Executed:

```bash
node .runs/path-c-unpaywall/review/claude-validation.mjs
```

Observed result:

```text
paywalled=31 non-paywalled=9
PASS — 31 paywalled commands carry oa_source + unpaywall_email; 17 DOI drivers opt in; excluded DBs stay out; locks intact.
```
