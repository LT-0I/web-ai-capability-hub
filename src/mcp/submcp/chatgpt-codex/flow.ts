import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { readPageSnapshot } from "../../../reader/snapshot";

export const CODEX_URL = "https://chatgpt.com/codex/cloud";
export const CODEX_ENVS_URL = "https://chatgpt.com/codex/cloud/settings/environments";
export const CODEX_COMPOSER_SELECTOR = "#prompt-textarea"; // aria: "Codex composer"
export const CODEX_BRANCH_SELECTOR = "button[aria-label='Search for your branch']";
export const CODEX_ENV_SELECTOR = "button[aria-label='View all code environments']";
export const CODEX_VERSIONS_SELECTOR = "button[aria-label^='Open versions number selector']";
export const CODEX_SUBMIT_SELECTOR = "button[aria-label='Submit']";
export const CODEX_ENV_PICK_SELECTOR = "xpath=//div[@role='dialog']//button[normalize-space(.)='LT-0I/CN-']";
export const CODEX_TASK_ID_RE = /^task_e_[0-9a-f]{32}$/;
export const CODEX_ALLOWED_ENV_NAME = "LT-0I/CN-";
export const CODEX_ALLOWED_REPO = "LT-0I/CN-";
export const CODEX_ALLOWED_GITHUB_URL = "https://github.com/LT-0I/CN-";
export const CODEX_ALLOWED_ENV_ID = "6a07e4ffdafc8191b77e6cff2264cd9a";
export const CODEX_FORBIDDEN_REPO_RE = /(?:^|[\s/])(?:LT-0I\/)?noeticbraid(?:[-\w]*)?/i;

export type CodexEnv = {
  name: string;
  repo: string;
  env_id: string;
  github_url: string;
  task_count?: number;
  creator?: string;
  created_at?: string;
};

export function contractError(errorCode: string, message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ok: false, status: "failed", errorCode, error_code: errorCode, message, ...extra };
}

export function notProvisioned(): Record<string, unknown> {
  return contractError(
    ConsumerErrorCodes.SUBMCP_NOT_PROVISIONED,
    "ChatGPT Codex LT-0I/CN- environment is not present; the provisioning precondition is unmet."
  );
}

export function allowlistError(message = "ChatGPT Codex action refused: only LT-0I/CN- is allowlisted."): Record<string, unknown> {
  return contractError(ConsumerErrorCodes.INVALID_ARGS, message, { repo: CODEX_ALLOWED_REPO, env_id: CODEX_ALLOWED_ENV_ID });
}

export function taskUrl(taskId: string): string {
  return `${CODEX_URL}/tasks/${taskId}`;
}

export function assertTaskId(taskId: string): void {
  if (!CODEX_TASK_ID_RE.test(taskId)) {
    const error: any = new Error(`${ConsumerErrorCodes.INVALID_ARGS}: task_id must match ${CODEX_TASK_ID_RE}`);
    error.errorCode = ConsumerErrorCodes.INVALID_ARGS;
    throw error;
  }
}

function firstLocator(locator: any): any { return locator?.first?.() || locator; }
function nthLocator(locator: any, index: number): any { return locator?.nth?.(index) || locator; }

export async function locatorCount(pageOrLocator: any, selector?: string): Promise<number> {
  try {
    const loc = selector ? pageOrLocator.locator?.(selector) : pageOrLocator;
    if (!loc) return 0;
    if (typeof loc.count === "function") return Number(await loc.count().catch(() => 0));
    return 1;
  } catch { return 0; }
}

export async function locatorText(pageOrLocator: any, selector?: string): Promise<string> {
  try {
    const loc = selector ? firstLocator(pageOrLocator.locator?.(selector)) : firstLocator(pageOrLocator);
    if (!loc) return "";
    if (typeof loc.textContent === "function") return String(await loc.textContent().catch(() => "") || "").trim();
    if (typeof loc.innerText === "function") return String(await loc.innerText().catch(() => "") || "").trim();
  } catch { /* ignore */ }
  return "";
}

export async function locatorAttr(pageOrLocator: any, selector: string | undefined, attr: string): Promise<string> {
  try {
    const loc = selector ? firstLocator(pageOrLocator.locator?.(selector)) : firstLocator(pageOrLocator);
    if (!loc) return "";
    if (typeof loc.getAttribute === "function") return String(await loc.getAttribute(attr).catch(() => "") || "").trim();
  } catch { /* ignore */ }
  return "";
}

export async function clickLocator(page: any, selector: string): Promise<void> {
  const loc = firstLocator(page.locator(selector));
  await loc.waitFor?.({ state: "visible", timeout: 15000 }).catch?.(() => undefined);
  await loc.click();
}

export async function fillLocator(page: any, selector: string, value: string): Promise<void> {
  const loc = firstLocator(page.locator(selector));
  await loc.waitFor?.({ state: "visible", timeout: 15000 }).catch?.(() => undefined);
  if (typeof loc.fill === "function") await loc.fill(value);
  else {
    await loc.click?.();
    if (page.keyboard?.type) await page.keyboard.type(value);
  }
}

export async function visibleText(page: any): Promise<string> {
  try {
    const snapshot = await readPageSnapshot(page, { includePortals: true });
    return typeof snapshot.visibleText === "string" ? snapshot.visibleText : "";
  } catch { /* keep reads total/non-throwing for bounded polls */ }
  return "";
}

function normalizeSpace(text: string): string { return String(text || "").replace(/\s+/g, " ").trim(); }

export function parseAllowedEnvFromRow(text: string, href = ""): CodexEnv | null {
  const row = normalizeSpace(text);
  const envId = /\/codex\/cloud\/settings\/environment\/([^/?#\s]+)/.exec(href)?.[1] || (/^[0-9a-f]{32}$/.test(href) ? href : "");
  if (!row.includes(CODEX_ALLOWED_REPO) && envId !== CODEX_ALLOWED_ENV_ID) return null;
  if (CODEX_FORBIDDEN_REPO_RE.test(row)) return null;
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(row)?.[0];
  const taskCountMatch = row.match(/\b(\d+)\b/);
  const createdAt = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/i.exec(row)?.[0];
  return {
    name: CODEX_ALLOWED_ENV_NAME,
    repo: CODEX_ALLOWED_REPO,
    env_id: envId || CODEX_ALLOWED_ENV_ID,
    github_url: CODEX_ALLOWED_GITHUB_URL,
    task_count: taskCountMatch ? Number(taskCountMatch[1]) : undefined,
    creator: email,
    created_at: createdAt
  };
}

export async function listAllowedEnvsFromPage(page: any): Promise<CodexEnv[]> {
  await page.goto?.(CODEX_ENVS_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
  await page.waitForSelector?.("tr", { state: "attached", timeout: 15000 }).catch(() => undefined);
  const rows = page.locator?.("tr");
  const count = rows ? await locatorCount(rows) : 0;
  const envs: CodexEnv[] = [];
  for (let i = 0; i < count; i += 1) {
    const row = nthLocator(rows, i);
    const text = await locatorText(row);
    const href = await locatorAttr(row, "a[href*='/codex/cloud/settings/environment/']", "href");
    const parsed = parseAllowedEnvFromRow(text, href);
    if (parsed && !envs.some((env) => env.env_id === parsed.env_id)) envs.push(parsed);
  }
  if (!envs.length) {
    const text = await visibleText(page);
    if (text.includes(CODEX_ALLOWED_REPO)) {
      const parsed = parseAllowedEnvFromRow(text, `/codex/cloud/settings/environment/${CODEX_ALLOWED_ENV_ID}`);
      if (parsed) envs.push(parsed);
    }
  }
  return envs.filter((env) => env.name === CODEX_ALLOWED_ENV_NAME && env.repo === CODEX_ALLOWED_REPO && env.env_id === CODEX_ALLOWED_ENV_ID);
}

export async function selectAllowedEnvForSubmit(page: any): Promise<Record<string, unknown> | null> {
  await clickLocator(page, CODEX_ENV_SELECTOR);
  await page.waitForSelector?.("div[role='dialog']", { state: "visible", timeout: 15000 }).catch(() => undefined);
  await clickLocator(page, CODEX_ENV_PICK_SELECTOR);
  const selected = normalizeSpace(await locatorText(page, CODEX_ENV_SELECTOR));
  if (selected !== CODEX_ALLOWED_ENV_NAME) return allowlistError(`ChatGPT Codex submit refused: selected environment was '${selected || "<empty>"}', expected '${CODEX_ALLOWED_ENV_NAME}'.`);
  return null;
}

function taskIdFromUrl(url: string): string | null {
  return /(?:^|\/)tasks\/(task_e_[0-9a-f]{32})(?:[/?#]|$)/.exec(String(url || ""))?.[1] || null;
}

export async function readTopTaskCardId(page: any): Promise<string | null> {
  // The Codex task list renders newest-first: the first
  // a[href*="/codex/cloud/tasks/task_e_"] in document order is the most
  // recent task card. Reading the .first() href yields the current top id.
  const href = await locatorAttr(page, 'a[href*="/codex/cloud/tasks/task_e_"]', "href");
  return taskIdFromUrl(href);
}

export async function extractSubmittedTaskId(
  page: any,
  preSubmitTopId: string | null,
  timeoutMs = 30000
): Promise<string | null> {
  // Live divergence (root cause): after the Submit click the SPA has not yet
  // prepended the freshly-created task card, and on this account it does NOT
  // route to /codex/cloud/tasks/<newId>. The previous run's card is still the
  // document-order top <a>, so a one-shot .first() href read captured the
  // STALE previous task id (a false-useful result). Deterministically wait
  // (bounded poll, same disciplined shape as waitForCodexTaskHydration; no
  // graceful fallback) until either the route changes to a task page or the
  // top task-list card id differs from the pre-submit top id, then return
  // THAT id. On bounded timeout the caller surfaces a stable contract error
  // (never a stale/fabricated id).
  const deadline = Date.now() + Math.max(0, timeoutMs);
  for (;;) {
    const fromUrl = taskIdFromUrl(page.url?.() || "");
    if (fromUrl && fromUrl !== preSubmitTopId) return fromUrl;
    const topId = await readTopTaskCardId(page);
    if (topId && topId !== preSubmitTopId) return topId;
    if (Date.now() >= deadline) {
      // No pre-submit card existed: the first card to appear is unambiguously
      // the task this call just created (not a fallback). Otherwise only the
      // stale id is visible and we must fail honestly rather than return it.
      if (!preSubmitTopId && topId) return topId;
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

export async function waitForCodexTaskHydration(page: any, timeoutMs = 60000): Promise<string> {
  // The Codex task detail page is a client-rendered SPA: at domcontentloaded the
  // <body> is an empty shell, so document.body.innerText (and therefore the
  // snapshot visibleText) is "". Poll the canonical snapshot until the task
  // header has actually hydrated (non-empty text that carries the repo/env
  // proof) before any ownership/status/diff read. No graceful fallback: on
  // timeout the caller's strict guard still runs against the last text.
  const deadline = Date.now() + Math.max(0, timeoutMs);
  let text = await visibleText(page);
  while (
    (!text || (!pageTextProvesAllowedCodexTask(text) && !CODEX_FORBIDDEN_REPO_RE.test(text)))
    && Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    text = await visibleText(page);
  }
  return text;
}

export async function assertTaskBelongsToAllowlist(page: any): Promise<Record<string, unknown> | null> {
  const text = await waitForCodexTaskHydration(page);
  if (CODEX_FORBIDDEN_REPO_RE.test(text)) return allowlistError("ChatGPT Codex task refused: task page references forbidden noeticbraid repository.");
  if (!pageTextProvesAllowedCodexTask(text)) return allowlistError("ChatGPT Codex task refused: task page does not prove LT-0I/CN- ownership.");
  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function pageTextProvesAllowedCodexTask(text: string): boolean {
  const value = String(text || "");
  const repo = escapeRegex(CODEX_ALLOWED_REPO);
  const delimitedRepo = new RegExp(`(?:^|[\\s·•|])${repo}(?=$|[\\s·•|])`);
  const envId = escapeRegex(CODEX_ALLOWED_ENV_ID);
  const delimitedEnvId = new RegExp(`(?:^|[^0-9a-f])${envId}(?=$|[^0-9a-f])`, "i");
  return delimitedRepo.test(value) || delimitedEnvId.test(value);
}

export async function readCodexStatus(page: any, taskId: string): Promise<Record<string, unknown>> {
  const guard = await assertTaskBelongsToAllowlist(page);
  if (guard) return guard;
  const text = await visibleText(page);
  const cancelCount = await locatorCount(page, 'button[aria-label="Cancel task"]');
  const thumbsCount = await locatorCount(page, 'button[aria-label="Give thumbs up feedback"]');
  const worked = /\bWorked for\s+\d+\s*(?:ms|s|sec(?:onds?)?|m|min(?:utes?)?|h|hours?|d|days?)\b/i.exec(text)?.[0]?.trim() || await locatorText(page, "xpath=//button[contains(normalize-space(.),'Worked for')]");
  const textShowsThumbs = /Give thumbs up feedback/.test(text);
  const textShowsCancel = /Cancel task/.test(text);
  if (/^Worked for\s+/.test(worked) && cancelCount === 0 && !textShowsCancel && (thumbsCount > 0 || textShowsThumbs)) {
    return { task_id: taskId, repo: CODEX_ALLOWED_REPO, env_id: CODEX_ALLOWED_ENV_ID, status: "complete", done: true, status_text: worked };
  }
  const running = /\b(Starting container|Running setup scripts)\b/.exec(text)?.[1] || "";
  if (running && cancelCount > 0) {
    return { task_id: taskId, repo: CODEX_ALLOWED_REPO, env_id: CODEX_ALLOWED_ENV_ID, status: "running", done: false, status_text: running };
  }
  return contractError(ConsumerErrorCodes.INVALID_ARGS, "ChatGPT Codex task status is not a known in-progress or terminal state.", { task_id: taskId });
}

function extractFileCount(toggleText: string): number {
  const match = /File\s*\((\d+)\)/i.exec(toggleText || "");
  return match ? Number(match[1]) : 0;
}

function extractDiffFromVisibleText(text: string): string {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const hunkStart = normalized.indexOf("@@ -");
  if (hunkStart < 0) return "";
  const beforeHunk = normalized.slice(0, hunkStart);
  const header = /([^\s·]+(?:\/[^\s·]+)*\s+\+\d+\s+-\d+)\s*$/.exec(beforeHunk)?.[1] || "";
  let hunkText = normalized.slice(hunkStart).trim();
  const terminators = [/\sLogs(?:\s|$)/, /\sSummary(?:\s|$)/, /\sCreate PR(?:\s|$)/, /\sArchive Task(?:\s|$)/, /\sShare task(?:\s|$)/];
  let end = hunkText.length;
  for (const marker of terminators) {
    const match = marker.exec(hunkText);
    if (match && match.index > 0) end = Math.min(end, match.index);
  }
  hunkText = hunkText.slice(0, end).trim();
  return header ? `${header}\n${hunkText}` : hunkText;
}

export async function readCodexDiff(page: any, taskId: string): Promise<Record<string, unknown>> {
  const status = await readCodexStatus(page, taskId);
  if ((status as any).errorCode) {
    const text = await visibleText(page);
    const strictDoneProxy = pageTextProvesAllowedCodexTask(text) && /Worked for\s+/.test(text) && !/Cancel task/.test(text) && /Give thumbs up feedback/.test(text);
    if (!strictDoneProxy) return status;
  } else if ((status as any).status !== "complete") {
    return contractError(ConsumerErrorCodes.INVALID_ARGS, "ChatGPT Codex diff is unavailable until task completion gate is satisfied.", { task_id: taskId });
  }
  const toggleText = await locatorText(page, 'button[aria-label="Toggle file list diffs"]');
  const fileCount = extractFileCount(toggleText);
  const fileButtonCount = await locatorCount(page, 'button[aria-label^="View file "]');
  if (fileCount < 1 || fileButtonCount < 1) return contractError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ChatGPT Codex changes panel is absent or empty.", { task_id: taskId });
  await clickLocator(page, 'button[aria-label="Tab to view the code diff"]').catch(() => undefined);
  const files: string[] = [];
  const fileButtons = page.locator?.('button[aria-label^="View file "]');
  const count = fileButtons ? await locatorCount(fileButtons) : 0;
  for (let i = 0; i < count; i += 1) {
    const button = nthLocator(fileButtons, i);
    const label = await locatorAttr(button, undefined, "aria-label");
    const file = /^View file\s+(.+)$/.exec(label)?.[1];
    if (file) files.push(file);
  }
  const text = await visibleText(page);
  const diffText = extractDiffFromVisibleText(text);
  if (!diffText || !diffText.includes("@@ -")) return contractError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ChatGPT Codex unified diff text was not extractable from visibleText.", { task_id: taskId });
  const createPrAvailable = await locatorCount(page, "xpath=//button[normalize-space(.)='Create PR']") > 0;
  return { task_id: taskId, repo: CODEX_ALLOWED_REPO, env_id: CODEX_ALLOWED_ENV_ID, status: "complete", files, diff_text: diffText, create_pr_available: createPrAvailable };
}
