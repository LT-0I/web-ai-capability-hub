const path = require("node:path");
import { getStoragePaths, safeFilename, timestampForFilename } from "../utils/paths";

export async function captureScreenshot(page: any, name = "page"): Promise<string> {
  const storage = getStoragePaths();
  const title = typeof page.title === "function" ? await page.title().catch(() => name) : name;
  const filePath = path.join(storage.screenshotDir, `${timestampForFilename()}-${safeFilename(title || name)}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}
