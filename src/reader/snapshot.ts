import { PageSnapshot } from "../shared/types";
import { extractSnapshotFromFile, extractSnapshotFromHtml, extractSnapshotFromPage } from "./domExtract";
import { readAccessibilitySummary } from "./accessibility";
import { captureScreenshot } from "./screenshot";

export interface PageReadOptions {
  includeAccessibility?: boolean;
  screenshot?: boolean;
  screenshotName?: string;
}

export async function readPageSnapshot(page: any, options: PageReadOptions = {}): Promise<PageSnapshot> {
  const snapshot = await extractSnapshotFromPage(page);
  if (options.includeAccessibility) {
    const accessibility = await readAccessibilitySummary(page);
    if (accessibility.length) snapshot.accessibility = accessibility;
    else snapshot.warnings.push("Accessibility snapshot unavailable; DOM extraction was used.");
  }
  if (options.screenshot) snapshot.screenshotPath = await captureScreenshot(page, options.screenshotName);
  return snapshot;
}

export function readHtmlSnapshot(html: string, url?: string, title?: string): PageSnapshot {
  return extractSnapshotFromHtml(html, url, title);
}

export function readHtmlSnapshotFromFile(filePath: string, url?: string): PageSnapshot {
  return extractSnapshotFromFile(filePath, url);
}
