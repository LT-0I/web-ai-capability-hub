const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { BrowserToolRuntime, withManagedPage } from "../../tools";
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";

export const DESIGN_URL = "https://claude.ai/design";
export const DESIGN_COMPOSER_SELECTOR = 'textarea[data-testid="chat-composer-input"]';
export const DESIGN_SEND_SELECTOR = '[data-testid="chat-send-button"]';
export const DESIGN_HTML_IFRAME_SELECTOR = 'iframe[data-testid="html-viewer-iframe"]';
export const DESIGN_PRESENT_SELECTOR = 'xpath=//button[contains(.,"Present")]';
export const DESIGN_FILE_OPEN_SELECTOR = 'xpath=//button[contains(normalize-space(.),"Open") and not(@data-testid)]';
export const DESIGN_MODEL_SELECTOR = '[data-testid="model-selector-button"]';
export const DESIGN_CREATE_BTN_SELECTOR = '[data-testid="create-project-button"]';
export const DESIGN_SERVE_IFRAME_RE = /\/v1\/design\/projects\/[^/]+\/serve\//i;

const DESIGN_PROJECT_NAME_SELECTOR = 'input[placeholder="Project name"]';
const DEFAULT_DESIGN_PROFILE = "claude-9224";
const QUOTA_TEXT_RE = /quota|limit reached|usage limit|try again later|too many requests|rate limit/i;
const MODEL_LABELS: Record<string, string> = {
  sonnet: "Sonnet 4.6",
  haiku: "Haiku 4.5"
};
const FIDELITY_LABELS: Record<string, string> = {
  wireframe: "Wireframe",
  high_fidelity: "High fidelity"
};
const BOOTSTRAP_OR_LOADER_URL_RE = /^https?:\/\/\S+\/(?:_bootstrap|_loader)(?:[?#].*)?$/i;

export class SubMcpQuotaExhaustedError extends Error {
  errorCode = ConsumerErrorCodes.SUBMCP_QUOTA_EXHAUSTED;
  constructor(message = "Claude Design quota is exhausted") { super(message); }
}

function defaultDownloadDir(): string { return path.join(process.cwd(), "data", "downloads"); }
function sha256Buffer(bytes: Buffer): string { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function ensureDownloadDir(downloadDir?: string): string {
  const resolved = path.resolve(downloadDir || defaultDownloadDir());
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}
function normalizeProjectId(projectUrl: string): string | null {
  try { return /\/design\/p\/([^/?#]+)/.exec(new URL(projectUrl).pathname)?.[1] || null; }
  catch { return /\/design\/p\/([^/?#]+)/.exec(projectUrl)?.[1] || null; }
}
async function waitForSelector(page: any, selector: string, timeout = 15000): Promise<void> {
  if (typeof page.waitForSelector === "function") await page.waitForSelector(selector, { state: "visible", timeout });
}
async function waitForPollInterval(page: any, ms = 1000): Promise<void> {
  if (typeof page.waitForTimeout === "function") {
    await page.waitForTimeout(ms).catch(() => undefined);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}
async function clickLocator(page: any, selector: string): Promise<void> {
  const loc = page.locator(selector).first?.() || page.locator(selector);
  await loc.click();
}
async function fillLocator(page: any, selector: string, value: string): Promise<void> {
  const loc = page.locator(selector).first?.() || page.locator(selector);
  await loc.waitFor?.({ state: "visible", timeout: 15000 });
  if (typeof loc.fill === "function") await loc.fill(value);
  else {
    await loc.click?.();
    await page.keyboard?.type(value);
  }
}
async function visibleText(page: any): Promise<string> {
  if (typeof page.evaluate === "function") {
    const text = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    if (typeof text === "string") return text;
  }
  if (typeof page.textContent === "function") return String(await page.textContent("body").catch(() => ""));
  return "";
}
async function assertNotQuotaExhausted(page: any): Promise<void> {
  const text = await visibleText(page);
  if (QUOTA_TEXT_RE.test(text)) throw new SubMcpQuotaExhaustedError();
}
async function clickButtonByText(page: any, label: string): Promise<void> {
  const selector = `xpath=//button[normalize-space(text())=${JSON.stringify(label)} or .//*[normalize-space(text())=${JSON.stringify(label)}]]`;
  await clickLocator(page, selector);
}
function designFileNameFromProjectUrl(projectUrl: string): string | null {
  try {
    const parsed = new URL(projectUrl);
    const file = parsed.searchParams.get("file") || "";
    return /\.html$/i.test(file) ? file : null;
  } catch {
    const match = /[?&]file=([^&#]*\.html)(?:[&#]|$)/i.exec(projectUrl || "");
    if (!match) return null;
    try { return decodeURIComponent(match[1].replace(/\+/g, " ")); }
    catch { return match[1]; }
  }
}

function currentDesignFileResolution(page: any): { projectUrl: string; fileName: string } | null {
  const projectUrl = String(page.url?.() || "");
  const fileName = designFileNameFromProjectUrl(projectUrl);
  return fileName ? { projectUrl, fileName } : null;
}

function fileNameFromServeIframeSrc(src: string): string | null {
  if (!DESIGN_SERVE_IFRAME_RE.test(src)) return null;
  try {
    const parsed = new URL(src);
    const servePath = /\/serve\/(.+)$/i.exec(parsed.pathname)?.[1] || "";
    const lastSegment = servePath.split("/").filter(Boolean).pop() || "";
    return lastSegment ? decodeURIComponent(lastSegment) : null;
  } catch {
    const match = /\/serve\/([^?#]+)(?:[?#]|$)/i.exec(src);
    if (!match) return null;
    const lastSegment = match[1].split("/").filter(Boolean).pop() || "";
    try { return lastSegment ? decodeURIComponent(lastSegment) : null; }
    catch { return lastSegment || null; }
  }
}

async function serveIframeResolution(page: any, projectUrl: string): Promise<{ projectUrl: string; fileName: string } | null> {
  const frames = page.locator?.("iframe");
  if (!frames) return null;
  const count = typeof frames.count === "function" ? await frames.count().catch(() => 0) : 1;
  for (let i = 0; i < count; i += 1) {
    const frame = typeof frames.nth === "function" ? frames.nth(i) : (frames.first?.() || frames);
    const src = typeof frame.getAttribute === "function" ? await frame.getAttribute("src").catch(() => null) : null;
    if (typeof src !== "string" || !src) continue;
    const fileName = fileNameFromServeIframeSrc(src);
    if (fileName) return { projectUrl, fileName };
  }
  return null;
}

export async function waitForDesignFileCompletion(page: any, projectUrl: string, timeoutMs: number): Promise<{ projectUrl: string; fileName: string }> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  let bestFileName = "";
  while (Date.now() < deadline) {
    await assertNotQuotaExhausted(page);
    const served = await serveIframeResolution(page, projectUrl);
    if (served) return served;
    const resolved = currentDesignFileResolution(page);
    if (resolved) {
      bestFileName = resolved.fileName;
      return resolved;
    }
    await waitForPollInterval(page, 1000);
  }
  const currentUrl = String(page.url?.() || "");
  const fallback = designFileNameFromProjectUrl(currentUrl);
  if (fallback) bestFileName = fallback;
  const error: any = new Error(`${ConsumerErrorCodes.POSTCONDITION_TIMEOUT}: Claude Design did not expose a generated /serve/<name>.html iframe before timeout`);
  error.errorCode = ConsumerErrorCodes.POSTCONDITION_TIMEOUT;
  error.projectUrl = projectUrl || currentUrl;
  error.fileName = bestFileName;
  throw error;
}


function snapshotDownloadDir(downloadDir?: string): { downloadDir: string; entries: Set<string> } | null {
  if (!downloadDir) return null;
  const resolved = ensureDownloadDir(downloadDir);
  return { downloadDir: resolved, entries: new Set(fs.readdirSync(resolved)) };
}

function cleanupNewDownloadDirEntries(snapshot: { downloadDir: string; entries: Set<string> } | null): void {
  if (!snapshot || !fs.existsSync(snapshot.downloadDir)) return;
  for (const entry of fs.readdirSync(snapshot.downloadDir)) {
    if (!snapshot.entries.has(entry)) fs.rmSync(path.join(snapshot.downloadDir, entry), { recursive: true, force: true });
  }
}

function extractHtmlBody(markup: string): string {
  const match = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(markup);
  return match ? match[1] : markup;
}

function hasMeaningfulBodyContent(bodyMarkup: string): boolean {
  const body = String(bodyMarkup || "").trim();
  if (!body) return false;
  const withoutInert = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/gi, "")
    .trim();
  if (!withoutInert) return false;

  const visibleText = withoutInert
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&[a-z]+;|&#\d+;|&#x[0-9a-f]+;/gi, "x")
    .replace(/\s+/g, " ")
    .trim();
  if (visibleText.length > 0) return true;

  if (/<(canvas|svg|img|picture|video|audio|iframe|object|embed)\b/i.test(withoutInert)) return true;

  const nonContentTags = new Set(["html", "head", "body", "meta", "link", "base", "title", "script", "style", "template", "noscript"]);
  const elementMatches = [...withoutInert.matchAll(/<([a-z][\w:-]*)(?=\s|>)([^>]*)>/gi)]
    .filter((match) => !nonContentTags.has(match[1].toLowerCase()));
  if (elementMatches.length >= 2 && withoutInert.length >= 40) return true;
  return elementMatches.some((match) => /\s(?:class|style|id|data-[\w:-]+|role|aria-label|alt|src|href)=/i.test(match[2] || "") && withoutInert.length >= 40);
}

export function isRealHtmlMarkup(value: string): boolean {
  const trimmed = String(value || "").trim();
  if (!trimmed || BOOTSTRAP_OR_LOADER_URL_RE.test(trimmed) || /^https?:\/\/\S+$/i.test(trimmed)) return false;
  const hasHtmlDocumentShell = /<!doctype\s+html\b|<html[\s>]/i.test(trimmed);
  const hasMarkupShape = hasHtmlDocumentShell || (/<(body|main|section|article|div|p|h[1-6]|canvas|svg)(?:\s|>)/i.test(trimmed) && /<\/[a-z][\w:-]*>/i.test(trimmed));
  if (!hasMarkupShape) return false;
  if (/<body\b/i.test(trimmed)) return hasMeaningfulBodyContent(extractHtmlBody(trimmed));
  return hasMeaningfulBodyContent(trimmed);
}


async function locatorCount(page: any, selector: string): Promise<number> {
  try {
    const loc = page.locator?.(selector);
    if (!loc) return 0;
    if (typeof loc.count === "function") return await loc.count().catch(() => 0);
    return 1;
  } catch {
    return 0;
  }
}

async function hasHtmlViewerIframe(page: any): Promise<boolean> {
  return (await locatorCount(page, DESIGN_HTML_IFRAME_SELECTOR)) > 0;
}

function xpathLiteral(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  return `concat(${value.split("'").map((part) => `'${part}'`).join(', "\'", ')})`;
}

function designFileOpenSelectorFor(fileName: string | null): string {
  if (!fileName) return DESIGN_FILE_OPEN_SELECTOR;
  const file = xpathLiteral(fileName);
  return `xpath=//*[contains(normalize-space(.),${file})]//button[contains(normalize-space(.),"Open") and not(@data-testid)]`;
}

async function clickDesignFileOpen(page: any, fileName: string | null): Promise<void> {
  const selectors = [designFileOpenSelectorFor(fileName), DESIGN_FILE_OPEN_SELECTOR].filter((selector, index, all) => all.indexOf(selector) === index);
  let lastError: any = null;
  for (const selector of selectors) {
    try {
      if (typeof page.waitForSelector === "function") await page.waitForSelector(selector, { state: "visible", timeout: 15000 }).catch(() => undefined);
      await clickLocator(page, selector);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  const error: any = new Error(`${ConsumerErrorCodes.ELEMENT_NOT_FOUND}: Claude Design generated file Open control was not found`);
  error.errorCode = ConsumerErrorCodes.ELEMENT_NOT_FOUND;
  error.cause = lastError;
  throw error;
}

async function waitForDesignViewerAfterOpen(page: any, projectUrl: string, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  while (Date.now() < deadline) {
    await assertNotQuotaExhausted(page);
    const currentUrl = String(page.url?.() || "");
    if (designFileNameFromProjectUrl(currentUrl)) return;
    if (await hasHtmlViewerIframe(page)) return;
    if (await serveIframeResolution(page, projectUrl)) return;
    await waitForPollInterval(page, 250);
  }
  const error: any = new Error(`${ConsumerErrorCodes.ELEMENT_NOT_FOUND}: Claude Design ?file= viewer iframe was not found`);
  error.errorCode = ConsumerErrorCodes.ELEMENT_NOT_FOUND;
  throw error;
}

async function ensureDesignViewerOpen(page: any, projectUrl: string): Promise<void> {
  if (await hasHtmlViewerIframe(page)) return;
  const fileName = designFileNameFromProjectUrl(projectUrl);
  await clickDesignFileOpen(page, fileName);
  await waitForDesignViewerAfterOpen(page, projectUrl, 30000);
}

async function readIframeHtml(iframe: any): Promise<string> {
  const srcdoc = await iframe.getAttribute?.("srcdoc");
  if (typeof srcdoc === "string" && srcdoc.trim()) return srcdoc;
  let frame: any = null;
  try {
    // FIX: Locator.contentFrame() returns a FrameLocator (no .content()).
    // Resolve an ElementHandle first; ElementHandle.contentFrame() returns a
    // real Frame that bridges the bootstrap-resolved cross-origin serve child
    // document over the existing connectOverCDP session (no token handling,
    // no raw CDP target attach, no auth bypass).
    const handle = typeof iframe.elementHandle === "function" ? await iframe.elementHandle() : iframe;
    frame = handle && typeof handle.contentFrame === "function" ? await handle.contentFrame() : null;
  } catch {
    frame = null;
  }
  if (frame && typeof frame.content === "function") {
    const html = await frame.content().catch(() => "");
    if (typeof html === "string" && html.trim()) return html;
  }
  const src = await iframe.getAttribute?.("src");
  return typeof src === "string" ? src : "";
}

export async function stepCreateProject(runtime: Required<BrowserToolRuntime>, args: { name: string; fidelity?: "wireframe" | "high_fidelity"; profile?: string; cdpPort?: number }): Promise<{ projectUrl: string }> {
  const effective = { ...args, profile: args.profile || DEFAULT_DESIGN_PROFILE, __requireTargetSurface: true };
  return withManagedPage(effective, runtime, DESIGN_URL, async (page) => {
    await waitForSelector(page, DESIGN_PROJECT_NAME_SELECTOR);
    await assertNotQuotaExhausted(page);
    await fillLocator(page, DESIGN_PROJECT_NAME_SELECTOR, args.name);
    await clickButtonByText(page, FIDELITY_LABELS[args.fidelity || "high_fidelity"]);
    await page.waitForSelector?.(DESIGN_CREATE_BTN_SELECTOR, { state: "visible", timeout: 15000 }).catch(() => undefined);
    await clickLocator(page, DESIGN_CREATE_BTN_SELECTOR);
    await page.waitForURL?.(/\/design\/p\//, { timeout: 30000 }).catch(async () => {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline && !/\/design\/p\//.test(page.url?.() || "")) await page.waitForTimeout?.(500).catch(() => undefined);
    });
    await assertNotQuotaExhausted(page);
    return { projectUrl: page.url?.() || DESIGN_URL };
  });
}

export async function stepGenerate(runtime: Required<BrowserToolRuntime>, args: { project_url: string; prompt: string; model?: "sonnet" | "haiku"; profile?: string; timeout_ms?: number; cdpPort?: number }): Promise<{ model_used: string; projectUrl: string; fileName: string }> {
  const effective = { ...args, profile: args.profile || DEFAULT_DESIGN_PROFILE, __requireTargetSurface: true };
  return withManagedPage(effective, runtime, args.project_url, async (page) => {
    await assertNotQuotaExhausted(page);
    const modelKey = args.model || "sonnet";
    await page.waitForSelector?.(DESIGN_MODEL_SELECTOR, { state: "visible", timeout: 15000 }).catch(() => undefined);
    await clickLocator(page, DESIGN_MODEL_SELECTOR).catch(() => undefined);
    await clickButtonByText(page, MODEL_LABELS[modelKey]).catch(() => undefined);
    await fillLocator(page, DESIGN_COMPOSER_SELECTOR, args.prompt);
    try {
      await page.waitForSelector?.(DESIGN_SEND_SELECTOR, { state: "visible", timeout: 15000 });
      await clickLocator(page, DESIGN_SEND_SELECTOR);
    } catch {
      await page.keyboard?.press("Enter");
    }
    const completion = await waitForDesignFileCompletion(page, args.project_url, args.timeout_ms || 300000);
    await assertNotQuotaExhausted(page);
    return { model_used: modelKey, projectUrl: completion.projectUrl, fileName: completion.fileName };
  });
}

export async function stepGetHtml(runtime: Required<BrowserToolRuntime>, args: { project_url: string; download_dir?: string; profile?: string; cdpPort?: number }): Promise<{ iframeArtifactSha256: string; savedPath: string; byteSize: number }> {
  const effective = { ...args, profile: args.profile || DEFAULT_DESIGN_PROFILE, __requireTargetSurface: true };
  return withManagedPage(effective, runtime, args.project_url, async (page) => {
    const downloadSnapshot = snapshotDownloadDir(args.download_dir);
    try {
      await assertNotQuotaExhausted(page);
      await ensureDesignViewerOpen(page, args.project_url);
      await waitForSelector(page, DESIGN_HTML_IFRAME_SELECTOR, 30000);
      const iframe = page.locator(DESIGN_HTML_IFRAME_SELECTOR).first?.() || page.locator(DESIGN_HTML_IFRAME_SELECTOR);
      let source = "";
      const deadline = Date.now() + 30000;
      for (let attempt = 0; attempt < 60 && Date.now() < deadline; attempt += 1) {
        source = await readIframeHtml(iframe);
        if (isRealHtmlMarkup(source)) break;
        await waitForPollInterval(page, 500);
      }
      if (!source) throw new Error(`${ConsumerErrorCodes.IFRAME_NOT_FOUND}: Claude Design HTML iframe has no srcdoc, content, or src attribute`);
      if (!isRealHtmlMarkup(source)) {
        const error: any = new Error(`${ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED}: Claude Design iframe did not contain real HTML markup`);
        error.errorCode = ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED;
        throw error;
      }
      const bytes = Buffer.from(source, "utf-8");
      const iframeArtifactSha256 = sha256Buffer(bytes);
      const projectId = normalizeProjectId(args.project_url) || "claude-design";
      const savedPath = path.join(ensureDownloadDir(args.download_dir), `${projectId}-${iframeArtifactSha256.slice(0, 12)}.html`);
      fs.writeFileSync(savedPath, bytes);
      return { iframeArtifactSha256, savedPath, byteSize: bytes.length };
    } catch (error) {
      cleanupNewDownloadDirEntries(downloadSnapshot);
      throw error;
    }
  });
}

export async function stepPresent(runtime: Required<BrowserToolRuntime>, args: { project_url: string; profile?: string; cdpPort?: number }): Promise<{ presentUrl: string }> {
  const effective = { ...args, profile: args.profile || DEFAULT_DESIGN_PROFILE, __requireTargetSurface: true };
  return withManagedPage(effective, runtime, args.project_url, async (page) => {
    await assertNotQuotaExhausted(page);
    await ensureDesignViewerOpen(page, args.project_url);
    const context = typeof page.context === "function" ? page.context() : undefined;
    const pagePromise = context?.waitForEvent ? context.waitForEvent("page", { timeout: 30000 }).catch(() => null) : Promise.resolve(null);
    await clickLocator(page, DESIGN_PRESENT_SELECTOR);
    const newPage = await pagePromise;
    if (newPage?.waitForLoadState) await newPage.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
    return { presentUrl: newPage?.url?.() || page.url?.() || args.project_url };
  });
}
