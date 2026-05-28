#!/usr/bin/env node
// Path C Claude Wave C1 capture for the 3 design ops that Wave A
// missed (NO_MATCHING_RPC due to claude.ai/api/* filter scope).
// Drives claude-9224 via CDP, navigates into the Design surface,
// records all claude.ai/* and Omelette requests via Playwright +
// raw CDP Network.requestWillBeSent + Fetch.requestPaused.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const OUT_ROOT = ROOT;
const CDP = process.env.CLAUDE_CDP || "http://127.0.0.1:9224";
const PROFILE = "claude-9224";

const ARGV = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const m = /^--([^=]+)=(.*)$/.exec(arg);
  return m ? [m[1], m[2]] : [arg.replace(/^--/, ""), "true"];
}));

const OPS = String(ARGV.ops || "create_project,generate,present").split(",").map((v) => v.trim()).filter(Boolean);

function ts() { return new Date().toISOString(); }
function log(...args) { console.error(`[${ts()}]`, ...args); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function variantDir(name) {
  const dir = path.join(OUT_ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "requests"), { recursive: true });
  return dir;
}

function safeIdx(n) { return String(n).padStart(4, "0"); }

function shouldRecord(url) {
  if (!url || typeof url !== "string") return false;
  if (/^https?:\/\/(?:www\.)?claude\.ai\//i.test(url)) return true;
  if (/claudeusercontent\.com/i.test(url)) return true;
  return false;
}

async function setupRecorders(page, outDir) {
  const network = [];
  let idx = 0;

  const cdpSession = await page.context().newCDPSession(page);
  await cdpSession.send("Network.enable");
  await cdpSession.send("Fetch.enable", { patterns: [{ requestStage: "Request" }] }).catch(() => undefined);

  cdpSession.on("Network.requestWillBeSent", (params) => {
    const url = params?.request?.url || "";
    if (!shouldRecord(url)) return;
    network.push({
      ts: ts(),
      source: "cdp",
      url,
      method: params?.request?.method,
      headers: params?.request?.headers,
      hasPostData: Boolean(params?.request?.hasPostData),
      postData: params?.request?.postData,
      requestId: params?.requestId,
      initiator: params?.initiator?.type,
      resourceType: params?.type
    });
  });

  cdpSession.on("Network.responseReceived", (params) => {
    const url = params?.response?.url || "";
    if (!shouldRecord(url)) return;
    network.push({
      ts: ts(),
      source: "cdp-response",
      url,
      status: params?.response?.status,
      mimeType: params?.response?.mimeType,
      requestId: params?.requestId
    });
  });

  cdpSession.on("Fetch.requestPaused", async (params) => {
    const url = params?.request?.url || "";
    try {
      if (shouldRecord(url) && params?.request?.method === "POST") {
        let body = params?.request?.postData || "";
        if (!body) {
          try {
            const got = await cdpSession.send("Fetch.getRequestPostData", { requestId: params.requestId });
            body = got?.postData || "";
          } catch (_) { /* */ }
        }
        if (body) {
          const i = idx++;
          const slug = url.replace(/^https?:\/\//, "").replace(/[^\w.\-/]+/g, "_").replace(/\//g, "__").slice(0, 180);
          fs.writeFileSync(path.join(outDir, "requests", `${safeIdx(i)}__${slug}.body.json`), JSON.stringify({
            url, method: params.request.method, headers: params.request.headers, body
          }, null, 2));
        }
      }
    } catch (e) {
      log("Fetch.requestPaused write error", e?.message || String(e));
    } finally {
      try { await cdpSession.send("Fetch.continueRequest", { requestId: params.requestId }); } catch (_) { /* */ }
    }
  });

  page.on("request", (request) => {
    const url = request.url();
    if (!shouldRecord(url)) return;
    const postData = request.postData() || "";
    network.push({
      ts: ts(),
      source: "playwright",
      url,
      method: request.method(),
      resourceType: request.resourceType(),
      hasPost: Boolean(postData),
      bodyLength: postData ? postData.length : 0
    });
  });

  return {
    cdpSession,
    flush(filePath) { fs.writeFileSync(filePath, JSON.stringify(network, null, 2)); }
  };
}

async function findClaudePage(browser) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const url = page.url();
      if (/claude\.ai\//i.test(url)) return page;
    }
  }
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("https://claude.ai/design", { waitUntil: "domcontentloaded" });
  return page;
}

async function closeNonEssentialTabs(browser, keepUrlSubstring) {
  for (const context of browser.contexts()) {
    const pages = context.pages();
    let kept = false;
    for (const page of pages) {
      const url = page.url();
      if (!kept && url.includes(keepUrlSubstring)) {
        kept = true;
        continue;
      }
      if (pages.length > 1) {
        try { await page.close(); } catch (_) { /* */ }
      }
    }
  }
}

async function dismissPossibleOverlay(page) {
  await page.keyboard.press("Escape").catch(() => undefined);
  await sleep(300);
}

async function captureCreateProject(browser) {
  const variant = "webai_claude_design_create_project--basic";
  const dir = variantDir(variant);
  log("==> capture", variant);
  const page = await findClaudePage(browser);
  await page.goto("https://claude.ai/design", { waitUntil: "domcontentloaded" });
  await page.bringToFront().catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
  await sleep(2000);

  const recorder = await setupRecorders(page, dir);

  const projectName = `Wave C1 RPC ${Date.now()}`;
  fs.writeFileSync(path.join(dir, "input.json"), JSON.stringify({ projectName }, null, 2));

  try {
    const nameInput = page.locator('input[placeholder="Project name"]').first();
    await nameInput.waitFor({ state: "visible", timeout: 15000 });
    await nameInput.fill(projectName);
    await sleep(500);
    const createBtn = page.locator('[data-testid="create-project-button"]').first();
    await createBtn.click({ timeout: 10000 });
    log("[create_project] clicked Create, waiting for /design/p/ URL");
    const deadline = Date.now() + 60000;
    let projectUrl = "";
    while (Date.now() < deadline) {
      const url = page.url();
      if (/\/design\/p\//.test(url)) { projectUrl = url; break; }
      await sleep(500);
    }
    fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify({ projectUrl, finalPageUrl: page.url() }, null, 2));
    await sleep(8000);
  } catch (e) {
    fs.writeFileSync(path.join(dir, "error.txt"), `${e?.message || String(e)}\n${e?.stack || ""}`);
    log("[create_project] error", e?.message || String(e));
  } finally {
    recorder.flush(path.join(dir, "network-log.json"));
    try { await recorder.cdpSession.detach(); } catch (_) { /* */ }
  }
  return page;
}

async function captureGenerate(browser, projectUrl) {
  const variant = "webai_claude_design_generate--html";
  const dir = variantDir(variant);
  log("==> capture", variant, "projectUrl=", projectUrl);
  const page = await findClaudePage(browser);
  const target = projectUrl || "https://claude.ai/design";
  await page.goto(target, { waitUntil: "domcontentloaded" });
  await page.bringToFront().catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
  await sleep(2000);
  await dismissPossibleOverlay(page);

  const recorder = await setupRecorders(page, dir);
  try {
    const composer = page.locator('textarea[data-testid="chat-composer-input"], textarea').first();
    await composer.waitFor({ state: "visible", timeout: 15000 });
    await composer.fill("RPC_CLAUDE_DESIGN_GENERATE_2026-05-27: Add a tiny dark-mode toggle to the existing page.");
    await sleep(500);
    const sendBtn = page.locator('[data-testid="chat-send-button"], button[aria-label="Send"], button:has-text("Send")').first();
    await sendBtn.click({ timeout: 10000 });
    log("[generate] clicked Send, recording for 30s");
    await sleep(30000);
    fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify({ finalPageUrl: page.url() }, null, 2));
  } catch (e) {
    fs.writeFileSync(path.join(dir, "error.txt"), `${e?.message || String(e)}\n${e?.stack || ""}`);
    log("[generate] error", e?.message || String(e));
  } finally {
    recorder.flush(path.join(dir, "network-log.json"));
    try { await recorder.cdpSession.detach(); } catch (_) { /* */ }
  }
}

async function capturePresent(browser, projectUrl) {
  const variant = "webai_claude_design_present--existing_project";
  const dir = variantDir(variant);
  log("==> capture", variant);
  const page = await findClaudePage(browser);
  const target = projectUrl ? `${projectUrl}${projectUrl.includes("?") ? "&" : "?"}file=index.html` : "https://claude.ai/design";
  await page.goto(target, { waitUntil: "domcontentloaded" });
  await page.bringToFront().catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
  await sleep(3000);
  await dismissPossibleOverlay(page);

  const recorder = await setupRecorders(page, dir);
  try {
    const presentBtn = page.locator('button:has-text("Present")').first();
    await presentBtn.waitFor({ state: "visible", timeout: 15000 });
    await presentBtn.click({ timeout: 10000 });
    log("[present] clicked Present, recording for 15s");
    await sleep(15000);
    fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify({ finalPageUrl: page.url() }, null, 2));
  } catch (e) {
    fs.writeFileSync(path.join(dir, "error.txt"), `${e?.message || String(e)}\n${e?.stack || ""}`);
    log("[present] error", e?.message || String(e));
  } finally {
    recorder.flush(path.join(dir, "network-log.json"));
    try { await recorder.cdpSession.detach(); } catch (_) { /* */ }
  }
}

(async () => {
  log("connect", CDP, "profile", PROFILE);
  const browser = await chromium.connectOverCDP(CDP);
  try {
    let projectUrl = ARGV.project_url || "";

    if (OPS.includes("create_project")) {
      await captureCreateProject(browser);
      const page = await findClaudePage(browser);
      const url = page.url();
      if (/\/design\/p\//.test(url)) projectUrl = url.split("?")[0];
      await sleep(30000);
    }

    if (OPS.includes("generate")) {
      if (!projectUrl) {
        for (const context of browser.contexts()) {
          for (const page of context.pages()) {
            const u = page.url();
            if (/\/design\/p\//.test(u) && !projectUrl) projectUrl = u.split("?")[0];
          }
        }
      }
      await captureGenerate(browser, projectUrl);
      await sleep(30000);
    }

    if (OPS.includes("present")) {
      if (!projectUrl) {
        for (const context of browser.contexts()) {
          for (const page of context.pages()) {
            const u = page.url();
            if (/\/design\/p\//.test(u) && !projectUrl) projectUrl = u.split("?")[0];
          }
        }
      }
      await capturePresent(browser, projectUrl);
      await sleep(5000);
    }

    fs.writeFileSync(path.join(OUT_ROOT, "capture-state.json"), JSON.stringify({
      finishedAt: ts(),
      projectUrl
    }, null, 2));

    await closeNonEssentialTabs(browser, "claude.ai");
  } finally {
    await browser.close().catch(() => undefined);
  }
  log("done");
})().catch((e) => {
  log("fatal", e?.message || String(e));
  process.exit(1);
});
