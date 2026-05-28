#!/usr/bin/env node
// Path C Claude Wave C1 — Live A/B sweep for create_project: DOM vs RPC.
//
// A = Direct DOM action via Playwright (fill input[placeholder="Project name"]
//     + click [data-testid="create-project-button"], wait for URL transition to
//     /design/p/<uuid>). This bypasses the existing extension-assisted-cdp and
//     managed-cdp DOM drivers because both inherit a pre-existing, over-broad
//     QUOTA_TEXT_RE in src/mcp/tools.ts + src/mcp/submcp/claude-design/flow.ts
//     that false-matches the informational banner "Claude Design now shares
//     usage limits with Claude.ai and Claude Code." (verified via probe-quota-text.mjs).
//     The Wave C1 RPC driver narrows its own QUOTA_TEXT_RE; the other lanes are
//     out of scope for this commit (separate dispatcher hunks).
//
// B = RPC driver via the new default dispatcher route (backend=rpc), exercising
//     the Omelette CreateProject Connect-unary JSON path.
//
// Profile: claude-9224 (only Claude profile per CLAUDE.md section 2).
// Spacing: 30s between Claude calls.
//
// Outputs ab-sweep-results.json next to this script.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { webAiClaudeDesignCreateProject } from "../../../dist/src/mcp/tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_PATH = path.join(__dirname, "ab-sweep-results.json");
const TIMESTAMP = Date.now();
const SLEEP_MS = 30_000;
const CDP_ENDPOINT = "http://127.0.0.1:9224";
const PROFILE = "claude-9224";
const DESIGN_ROOT = "https://claude.ai/design";
const DELETE_URL = "https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/DeleteProject";
const PROJECT_URL_RE = /\/design\/p\/([0-9a-f-]{36})/i;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function getDesignPage(browser) {
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (/claude\.ai\//.test(p.url())) return p;
    }
  }
  return browser.contexts()[0].newPage();
}

async function gotoDesignRoot(page) {
  if (!/claude\.ai\/design(?:$|[/?#])/.test(page.url())) {
    await page.goto(DESIGN_ROOT, { waitUntil: "domcontentloaded" });
    await sleep(2_000);
  }
  await page.bringToFront();
}

async function runDomVariant(args) {
  const started = Date.now();
  let projectId = null;
  let projectUrl = null;
  let errorMessage = null;
  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  try {
    const page = await getDesignPage(browser);
    await gotoDesignRoot(page);

    await page.waitForSelector('input[placeholder="Project name"]', { state: "visible", timeout: 15_000 });
    await page.fill('input[placeholder="Project name"]', args.name);

    await Promise.all([
      page.waitForURL((u) => PROJECT_URL_RE.test(String(u)), { timeout: 30_000 }),
      page.click('[data-testid="create-project-button"]')
    ]);

    const m = PROJECT_URL_RE.exec(page.url());
    if (m) {
      projectId = m[1];
      projectUrl = `${DESIGN_ROOT}/p/${projectId}`;
    } else {
      errorMessage = `page.url() did not match /design/p/<uuid>: ${page.url()}`;
    }
  } catch (err) {
    errorMessage = err?.message || String(err);
  } finally {
    await browser.close().catch(() => undefined);
  }
  return {
    variant: "dom-direct",
    args,
    elapsedMs: Date.now() - started,
    projectId,
    projectUrl,
    httpStatus: null,
    errorCode: projectId ? null : "DOM_DIRECT_FAILED",
    error: errorMessage,
    backend: "dom-direct",
    rpcEndpoint: null,
    ts: new Date().toISOString()
  };
}

async function runRpcVariant(args) {
  const started = Date.now();
  let result;
  let error = null;
  try {
    result = await webAiClaudeDesignCreateProject(args);
  } catch (err) {
    error = err?.message || String(err);
    result = null;
  }
  return {
    variant: "rpc",
    args,
    elapsedMs: Date.now() - started,
    projectId: result?.projectId ?? null,
    projectUrl: result?.projectUrl ?? null,
    httpStatus: result?.http_status ?? null,
    errorCode: result?.errorCode ?? null,
    error,
    backend: result?.backend ?? null,
    rpcEndpoint: result?.rpc_endpoint ?? null,
    raw: result,
    ts: new Date().toISOString()
  };
}

async function deleteProjects(projectIds) {
  const cleanup = [];
  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  try {
    const page = await getDesignPage(browser);
    await gotoDesignRoot(page);
    for (const projectId of projectIds) {
      if (!projectId) { cleanup.push({ projectId, skipped: true }); continue; }
      const res = await page.evaluate(async ({ url, projectId }) => {
        try {
          const r = await fetch(url, {
            method: "POST",
            credentials: "include",
            headers: { "accept": "application/json", "content-type": "application/json", "connect-protocol-version": "1" },
            body: JSON.stringify({ projectId })
          });
          return { projectId, status: r.status, text: (await r.text()).slice(0, 300) };
        } catch (e) {
          return { projectId, error: String(e?.message || e) };
        }
      }, { url: DELETE_URL, projectId });
      cleanup.push(res);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
  return cleanup;
}

async function main() {
  const summary = {
    started_at: new Date().toISOString(),
    profile: PROFILE,
    spacing_ms: SLEEP_MS,
    note: "A=direct Playwright DOM action (bypasses extension/managed quota false-positive). B=RPC dispatcher default.",
    a: null,
    b: null,
    cleanup: [],
    finished_at: null,
    verdict: null,
    notes: []
  };

  console.error(`[ab-sweep] A=DOM-direct: name="Claude Wave C1 throwaway ${TIMESTAMP} A"`);
  summary.a = await runDomVariant({
    profile: PROFILE,
    name: `Claude Wave C1 throwaway ${TIMESTAMP} A`
  });
  console.error(`[ab-sweep] A done: projectId=${summary.a.projectId} elapsedMs=${summary.a.elapsedMs} error=${summary.a.error}`);

  console.error(`[ab-sweep] sleeping ${SLEEP_MS}ms before B`);
  await sleep(SLEEP_MS);

  console.error(`[ab-sweep] B=RPC: name="Claude Wave C1 throwaway ${TIMESTAMP} B"`);
  summary.b = await runRpcVariant({
    profile: PROFILE,
    name: `Claude Wave C1 throwaway ${TIMESTAMP} B`
  });
  console.error(`[ab-sweep] B done: projectId=${summary.b.projectId} elapsedMs=${summary.b.elapsedMs} errorCode=${summary.b.errorCode}`);

  await sleep(5_000);
  summary.cleanup = await deleteProjects([summary.a?.projectId, summary.b?.projectId]);
  console.error(`[ab-sweep] cleanup: ${JSON.stringify(summary.cleanup)}`);

  const aOk = !!summary.a?.projectId && /^[0-9a-f-]{36}$/i.test(summary.a.projectId);
  const bOk = !!summary.b?.projectId && /^[0-9a-f-]{36}$/i.test(summary.b.projectId);
  const cleanupOk = summary.cleanup.every((c) => !c?.error && (c?.status === 200 || c?.skipped));

  summary.verdict = aOk && bOk && cleanupOk ? "PASS" : "FAIL";
  if (!aOk) summary.notes.push("A (dom-direct) did not return a valid projectId");
  if (!bOk) summary.notes.push("B (rpc) did not return a valid projectId");
  if (!cleanupOk) summary.notes.push("cleanup had failures");
  summary.finished_at = new Date().toISOString();

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(summary, null, 2));
  console.error(`[ab-sweep] verdict=${summary.verdict} -> ${RESULTS_PATH}`);
  if (summary.verdict !== "PASS") process.exit(2);
}

main().catch((err) => {
  console.error("[ab-sweep] FATAL", err);
  try {
    fs.writeFileSync(RESULTS_PATH, JSON.stringify({ fatal: String(err?.stack || err) }, null, 2));
  } catch { /* ignore */ }
  process.exit(3);
});
