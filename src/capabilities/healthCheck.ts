import { readPageSnapshot } from "../reader/snapshot";
import { HealthCheckReport, HealthCheckReportItem, HealthCheckResult, PageSnapshot } from "../shared/types";
import { CapabilityDatabase } from "./database";
import { CapabilityRecord, CapabilityStatus } from "./schemas";

export interface HealthCheckOptions {
  targetId: string;
  profile: string;
  url?: string;
  apply?: boolean;
  db: CapabilityDatabase;
  page: any;
}

const CHECKABLE_STATUSES = new Set<string>(["active", "unknown"]);
const SELECTOR_TIMEOUT_MS = 3000;

export async function runHealthCheck(options: HealthCheckOptions): Promise<HealthCheckReport> {
  const checkedAt = new Date().toISOString();
  const capabilities = loadCheckableCapabilities(options.db, options.targetId);
  const snapshot = await readPageSnapshot(options.page);
  const pageBlocked = snapshotLooksBlocked(snapshot);

  const items: HealthCheckReportItem[] = [];
  const capabilitiesByName = new Map(capabilities.map((capability) => [capability.name, capability]));

  for (const capability of capabilities) {
    const selectors = normalizeSelectors(capability.selectors);
    const check = pageBlocked
      ? { result: "blocked" as HealthCheckResult, selectorsChecked: [] }
      : await checkCapabilitySelectors(options.page, selectors);
    items.push({
      name: capability.name,
      category: capability.category,
      status_before: capability.status,
      result: check.result,
      selectors_checked: check.selectorsChecked
    });
  }

  const report = buildReport(options.targetId, checkedAt, items);
  if (options.apply) {
    const updates = items
      .filter((item) => item.result !== "ok")
      .map((item) => {
        const original = capabilitiesByName.get(item.name);
        return original ? applyHealthResult(original, item.result, checkedAt) : undefined;
      })
      .filter((capability): capability is CapabilityRecord => !!capability);
    if (updates.length) options.db.upsertCapabilities(updates);
  }

  return report;
}

function loadCheckableCapabilities(db: CapabilityDatabase, targetId: string): CapabilityRecord[] {
  return db
    .queryCapabilities({ target: targetId, limit: 100000 })
    .filter((capability) => CHECKABLE_STATUSES.has(capability.status));
}

function normalizeSelectors(selectors: string[] | undefined): string[] {
  return Array.from(new Set((selectors || []).map((selector) => selector.trim()).filter(Boolean)));
}

async function checkCapabilitySelectors(page: any, selectors: string[]): Promise<{ result: HealthCheckResult; selectorsChecked: string[] }> {
  if (!selectors.length) return { result: "needs_review", selectorsChecked: [] };

  const selectorsChecked: string[] = [];
  let sawSelectorError = false;
  for (const selector of selectors) {
    selectorsChecked.push(selector);
    try {
      const count = await countSelectorWithTimeout(page, selector, SELECTOR_TIMEOUT_MS);
      if (count >= 1) return { result: "ok", selectorsChecked };
    } catch {
      sawSelectorError = true;
    }
  }

  return { result: sawSelectorError ? "ambiguous" : "missing", selectorsChecked };
}

async function countSelectorWithTimeout(page: any, selector: string, timeoutMs: number): Promise<number> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const countPromise = Promise.resolve().then(async () => {
    const locator = page.locator(selector);
    return Number(await locator.count());
  });
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms checking selector: ${selector}`)), timeoutMs);
  });
  try {
    return await Promise.race([countPromise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function snapshotLooksBlocked(snapshot: PageSnapshot): boolean {
  const titleAndUrl = `${snapshot.title || ""} ${snapshot.url || ""}`;
  if (hasBlockedMarker(titleAndUrl)) return true;

  const visibleMainText = (snapshot.visibleText || "").slice(0, 8000);
  return hasBlockedMarker(visibleMainText);
}

function hasBlockedMarker(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;
  return [
    /\bsign in\b.*\b(required|continue|account|access)\b/,
    /\blog in\b.*\b(required|continue|account|access)\b/,
    /\blogin\b.*\b(required|continue|account|access)\b/,
    /\bplease (sign|log) in\b/,
    /\baccess denied\b/,
    /\bforbidden\b/,
    /\bunauthorized\b/,
    /\bcaptcha\b/,
    /\b(error|http)\s*(401|403|429|500|502|503|504)\b/,
    /\b(401|403|429|500|502|503|504)\s*(error|forbidden|unauthorized)\b/
  ].some((pattern) => pattern.test(normalized));
}

function buildReport(targetId: string, checkedAt: string, items: HealthCheckReportItem[]): HealthCheckReport {
  const counts = {
    ok: 0,
    missing: 0,
    ambiguous: 0,
    blocked: 0,
    needs_review: 0
  };
  for (const item of items) counts[item.result] += 1;
  return {
    target_id: targetId,
    checked_at: checkedAt,
    total: items.length,
    ...counts,
    items
  };
}

function applyHealthResult(capability: CapabilityRecord, result: HealthCheckResult, checkedAt: string): CapabilityRecord {
  return {
    ...capability,
    status: statusForResult(result),
    confidence: confidenceForResult(capability.confidence, result),
    updated_at: checkedAt
  };
}

function statusForResult(result: HealthCheckResult): CapabilityStatus {
  if (result === "ok") return "active";
  return result;
}

function confidenceForResult(current: number, result: HealthCheckResult): number {
  const cap = result === "missing"
    ? 0.25
    : result === "ambiguous"
      ? 0.4
      : result === "blocked"
        ? 0.3
        : result === "needs_review"
          ? 0.35
          : current;
  return Math.min(current, cap);
}
