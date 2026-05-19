# HUB/CONSUMER Responsibility Boundary

## 1. Scope & status

This document is the durable governance artifact for the HUB/CONSUMER responsibility boundary and the issue-#9 R1-R6 audit. It is not a new machine-checked contract surface: it adds no CLI/MCP/TS command, output key, error code, MCP resource, sensitive-field classification, package version, or `consumer-contract` version.

The execution-digest determinism contract was previously under-specified. In particular, the exact artifact to digest, digest algorithm, excluded paths, tool scope, toolchain assumptions, and SHA-announcement protocol were not pinned precisely enough. This document defines those terms going forward so the seam is not re-litigated per incident. The prior shared-tree drift is therefore resolved by definition: the contract did not previously pin these details; it now does.

The code pin target of record remains `d2cc581` (the latest clean code commit for the #8 R2 fix). This docs-only clarification does not move that code pin and does not require a version bump. Any future machine-checked surface change follows the announced-SHA process in §5.

## 2. The HUB/CONSUMER split

The hub/consumer split as proposed is correct and adopted. One clarification, which is the crux of #5/#9: **the hub's contractual determinism guarantee is per-COMMITTED-SHA digest stability — a deterministic, codegen-free `npm run clean && tsc` build plus zero tracked-byte mutation on any consumer-contract serving path. Reconstructing and digesting that SHA is the CONSUMER's responsibility, and must be done in the consumer's OWN pristine checkout of the SHA. The shared maintainer working tree was never a contractual artifact: between a fix landing and its commit it legitimately carries uncommitted tracked edits at an unchanged HEAD, so a digest taken over it is expected to drift and carries no guarantee. One maintainer-only, non-contract MCP tool (`browser_update_adapter_notes`) appends to `configs/adapters/notes/`; it is never auto-invoked, is outside the consumer-contract surface, and is explicitly excluded from the determinism guarantee, which is defined only over a pristine SHA reconstruction not exercised by maintenance tooling.**

**HUB owns:** browser launch/CDP/profile/session lifecycle; login-state detection; account-pool rotation; the structured `LOGIN_REQUIRED` failure envelope; the stable MCP/CLI/TS contract surface; runtime hygiene for consumer-contract serving paths; honest machine-parseable error envelopes on every failure; and per-committed-SHA execution-digest stability under the pinned build and digest procedure in §4.

**CONSUMER owns:** MCP-only egress (never CLI/raw-CDP); orchestration/governance/trust-pinning; reconstructing and digesting the pinned SHA in its own pristine checkout; using `npm ci` and a Node 20.x runtime for the pinned toolchain; and verdict normalization.

## 3. R1-R6 standing guarantees

| Item | Verdict | Evidence / standing contract |
| --- | --- | --- |
| **R1** Stable execution digest per pinned SHA | **PASS** with one named non-contract exception | The per-SHA execution digest is the content-only, mtime-free, sorted sha256 manifest of `dist/**` `*.js` / `*.d.ts` / `*.js.map`, computed after `npm ci` and `npm run build` in a pristine checkout. `npm ci` pins TypeScript and all dependencies via `package-lock.json`; the determinism guarantee holds for the lockfile-pinned TypeScript compiler under Node `>=20`. A consumer must use `npm ci` (not `npm install`) and a Node 20.x runtime so the toolchain matches. Node/tsc major drift is a consumer-side pin variable, documented here, not a hub defect. R1 was proven at `d2cc581`: two clean builds produced identical digest `a633e28f4f62bc901fc3fff577c059ca5469af499652b41a3620a69d23840736`, the serving-class suite was 399/399, PRE==POST, and git tracked-empty. The hub performs no tracked-byte mutation on any consumer-contract serving path. One maintainer-only, non-contract MCP tool (`browser_update_adapter_notes`) intentionally appends to `configs/adapters/notes/`; it is never auto-invoked and is excluded from the execution-digest determinism guarantee, which is defined over a pristine SHA reconstruction not exercised by maintenance tooling. |
| **R2** Stable structured return (#8) | **PASS — success predicate ratified two-way** | The canonical structured-success predicate is **`errorCode===null && path!=""`** — i.e. no `errorCode` plus a populated governed `path`. This is **ratified two-way** by the consumer (LT-0I) on 2026-05-18 after reviewing `docs/RESPONSIBILITY_BOUNDARY.md` @ `a228b22` in full. The hub deliberately does **not** emit a literal top-level `ok` boolean; the consumer normalizes the hub's structured response (status/structured payload + governed `path`) on its own side and explicitly chose option (a) over a literal `ok` field to avoid a zero-benefit `consumer-contract-1.5.0→1.6.0` bump + re-pin cycle. The #8 / #8-R2 empty-`path` defect is fully closed at `d2cc581` (`recoverGovernedArtifactFromDisk` + settled-path try/catch in `artifactClick.ts`; mapped by `artifactClickResultToSafeOutput`, `tools.ts:1401-1413`); the consumer verified the governed image is delivered natively under this exact predicate with no out-of-band recovery, in two independent full runs. This is a docs-only ratification, **no machine-checked surface change, no version bump** (per the §5(5) announced-SHA rule for pure docs/governance clarifications). |
| **R3** Deterministic async terminal contract | **PASS** after docs clarification | Gemini video has a reaper and a documented poll-until-terminal contract. Async `task_id` durability across consumer orchestration windows is part of the R3 deterministic async terminal contract. Music and codex task-status calls are synchronous in-page reads with no orphanable hub record. `docs/CONSUMER_CONTRACT.md` now records the music terminal set `{complete, error}` (non-terminal `generating`), the codex terminal set `{complete}` / non-terminal `{running}` / `INVALID_ARGS` on unknown, and the universal `withMcpToolDeadline` bound: default `180000` ms, max `600000` ms, producing `COMMAND_TIMEOUT`. No hub poll loop can run forever. |
| **R4** UI-drift/model-pin resilience (#1/#2/#6) | **PASS** (#6 closed; #1/#2 PASS-pending-consumer-reval) | "Absorb hub-side" means honest structured classification, not magical success: genuine, unverifiable model/UI drift surfaces as a stable structured `errorCode` (a structured hard failure when the requested capability cannot be verified), never a fabricated success, because fabricated success would violate the cardinal no-synthesis rule. #6 is closed at `ad1f61f`. #1 is `0481e47` + `0883d14` and #2 is `95846f0`; both are PASS-pending-consumer-reval. |
| **R5** Honest machine-parseable error envelopes | **PASS** | Central `callMcpTool` → `mapMcpToolError` maps handler throws to structured `{ok:false,errorCode,error_code,error,evidence}` envelopes; non-taxonomy failures become `UNKNOWN`; timeouts become `COMMAND_TIMEOUT`; CLI top-level catch mirrors the same taxonomy. The #8-R2 raw escape is closed at `d2cc581` and defense-in-depth-enveloped regardless. |
| **R6** Browser/login/account fully encapsulated | **PASS** with operator/account-owner boundary | The hub owns browser launch/CDP/profile/session lifecycle, login-state detection, account-pool rotation, and the structured `LOGIN_REQUIRED` failure envelope. The hub does not own actual human credential provisioning, paid-account availability, or quota purchase; those are operator/account-owner responsibilities. A logged-out, expired, or quota-exhausted state surfaces as a clean structured code (`LOGIN_REQUIRED` / `PLAN_OR_QUOTA_REQUIRED`), and hub-side recovery (re-login prompt path / rotation) is best-effort within available accounts. |

## 4. R1 reproducible-proof procedure and executed result

The per-SHA execution digest is defined as the content-only, mtime-free, sorted sha256 manifest of built `dist/**` JavaScript, declaration, and source-map files:

```bash
digest() { find dist -type f \( -name '*.js' -o -name '*.d.ts' -o -name '*.js.map' \) \
  -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}'; }
```

The digest is computed only after a pristine reconstruction of the pinned SHA and `npm ci`, which pins TypeScript and all dependencies via `package-lock.json`. Consumers must use `npm ci` (not `npm install`) and a Node 20.x runtime. The determinism guarantee holds for the lockfile-pinned TypeScript compiler; Node/tsc major drift is explicitly a consumer-side pin variable, not a hub defect.

Runnable proof procedure:

```bash
# 1. Pristine reconstruction of the pinned SHA in a consumer-controlled location
git -C /home/l1u/workspace/noeticmind/web-ai-capability-hub worktree add /tmp/wahub-r1-proof d2cc581
cd /tmp/wahub-r1-proof
test "$(git rev-parse HEAD)" = d2cc581fea04f5a99ecc4725128204ec9865197b
test -z "$(git status --porcelain)"
npm ci --no-audit --no-fund

# 2. Deterministic execution-digest definition
digest() { find dist -type f \( -name '*.js' -o -name '*.d.ts' -o -name '*.js.map' \) \
  -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}'; }

# 3. Build determinism: two independent clean builds
rm -rf dist && npm run build && D1=$(digest)
test -z "$(git status --porcelain)"
rm -rf dist && npm run build && D2=$(digest)
test "$D1" = "$D2"

# 4. Serving-class execution: offline pure serving modules
PRE=$(digest)
node --test dist/tests/*.test.js
POST=$(digest)
test "$PRE" = "$POST"
test -z "$(git status --porcelain)"
git worktree remove --force /tmp/wahub-r1-proof
```

Executed result from the issue-#9 audit:

- Pristine: `HEAD=d2cc581fea04f5a99ecc4725128204ec9865197b`, `git status --porcelain` empty.
- Build 1: exit 0, 735 files, `DIGEST1=a633e28f4f62bc901fc3fff577c059ca5469af499652b41a3620a69d23840736`; tracked tree empty after.
- Build 2: exit 0, 735 files, `DIGEST2=a633e28f4f62bc901fc3fff577c059ca5469af499652b41a3620a69d23840736`; `D1==D2`.
- Serving-class suite: `node --test dist/tests/*.test.js` → tests 399 / pass 399 / fail 0, exit 0.
- `PRE==POST==a633e28f4f62bc901fc3fff577c059ca5469af499652b41a3620a69d23840736`.
- `git status --porcelain` tracked-empty at every checkpoint; only ignored/untracked runtime state was generated.

Honest scope: this offline proof exercises the pure/serving-class code paths available without live browser credentials or model UI: recovery predicates, envelope mapping, contract surface, login envelope, reaper, and safe-output redaction. Genuinely live paths such as real CDP click, real browser download events, and real model render remain the consumer's full 6-modality e2e against a pristine `d2cc581` checkout. The byte-conclusive determinism/no-tracked-mutation claims are discharged here.

## 5. Announced-SHA process

**Announced-SHA commitment.** (1) Every contract-affecting change (any CLI/MCP/TS command, output key, error code, MCP resource, sensitive-field classification, or contract/package version) is announced by the maintainer as a single resolution comment whose **first line is exactly `Fixed in <full-40-char-sha>`** on the relevant GitHub issue, posted only after the change is committed (never before — HEAD-stability is not tree-stability). (2) The consumer pins to that `<sha>`, reconstructs it in its **own pristine checkout** (`git clone`/`git worktree add` + `git checkout <sha>`, `git status --porcelain` empty, `git rev-parse HEAD` == `<sha>`), runs `rm -rf dist && npm ci && npm run build`, and computes the execution digest over that freshly built `dist/` only (content-only, mtime-free, per §4's `digest()` definition). (3) A digest so computed is byte-stable PRE==POST for that SHA across any number of consumer-contract serving ops; if two such digests differ, the SHA was superseded by a new `Fixed in <sha>` — re-pin, do not treat as drift. (4) The maintainer never force-pushes, never rewrites announced SHAs, and treats a contract/version bump as a deliberate, separately-announced act. (5) Pure docs/governance clarifications that change no machine-checked surface are announced with a `Fixed in <sha>` but explicitly self-classify as no-version-bump (b90be1b / 0f09c8d precedent). (6) The consumer never digests the maintainer's shared working checkout; only a self-reconstructed SHA is in-contract.

## 6. Pin target of record

The pin target of record is `d2cc581` (code). This docs-only boundary artifact and the R3 contract paragraph do not move the code pin. The pin is superseded only by a future announced `Fixed in <sha>` for a contract-affecting or code-affecting change.

For issue-#9, the durable artifact is this file plus the R3 polling clarification in `docs/CONSUMER_CONTRACT.md`. The change is docs-only governance/clarification: no code, no tests, no JSON, no package or contract version bump.
