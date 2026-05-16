import { PageSnapshot } from "../shared/types";
import { SnapshotMode, extractSnapshotFromFile, extractSnapshotFromHtml, extractSnapshotFromPage } from "./domExtract";
import { readAccessibilitySummary } from "./accessibility";
import { captureScreenshot } from "./screenshot";

export interface PageReadOptions {
  includeAccessibility?: boolean;
  screenshot?: boolean;
  screenshotName?: string;
  mode?: SnapshotMode;
  includePortals?: boolean;
}

export async function readPageSnapshot(page: any, options: PageReadOptions = {}): Promise<PageSnapshot> {
  const snapshot = await extractSnapshotFromPage(page, { mode: options.mode, includePortals: options.includePortals });
  if (options.includeAccessibility && options.mode !== "lite") {
    const accessibility = await readAccessibilitySummary(page);
    if (accessibility.length) snapshot.accessibility = accessibility;
    else snapshot.warnings.push("Accessibility snapshot unavailable; DOM extraction was used.");
  }
  if (options.screenshot && options.mode !== "lite") snapshot.screenshotPath = await captureScreenshot(page, options.screenshotName);
  return snapshot;
}

export function readHtmlSnapshot(html: string, url?: string, title?: string, options: PageReadOptions = {}): PageSnapshot {
  return extractSnapshotFromHtml(html, url, title, { mode: options.mode, includePortals: options.includePortals });
}

export function readHtmlSnapshotFromFile(filePath: string, url?: string, options: PageReadOptions = {}): PageSnapshot {
  return extractSnapshotFromFile(filePath, url, { mode: options.mode, includePortals: options.includePortals });
}
