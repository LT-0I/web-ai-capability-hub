const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
import { DownloadManager } from "../src/browser/downloads";
import { BrowserSessionManager } from "../src/browser/sessionManager";
import { CapabilityDatabase } from "../src/capabilities/database";

function tempDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "wah-test-")); }

test("download manager saves a mock download record", async () => {
  const dir = path.resolve(process.cwd(), "data/test-downloads");
  fs.rmSync(dir, { recursive: true, force: true });
  const manager = new DownloadManager(dir);
  const record = await manager.saveDownload({
    suggestedFilename: async () => "export.csv",
    saveAs: async (filePath: string) => fs.writeFileSync(filePath, "a,b\n1,2\n", "utf-8"),
    url: () => "https://example.test/export.csv",
    failure: async () => null
  });
  assert.ok(fs.existsSync(record.savedPath));
  assert.equal(manager.list().length, 1);
});

test("browser session records auto-saved downloads as artifacts when database and target are set", async () => {
  const root = tempDir();
  const downloadDir = path.join(root, "downloads");
  const db = new CapabilityDatabase({ dbPath: path.join(root, "capability.json"), preferSqlite: false });
  const session = new BrowserSessionManager({ downloadDir }) as any;
  session.setDatabase(db);
  session.setTarget("gemini");

  let downloadHandler: ((download: any) => Promise<void>) | undefined;
  const page = {
    url: () => "https://example.test",
    title: async () => "Example",
    on: (event: string, handler: any) => {
      if (event === "download") downloadHandler = handler;
    }
  };

  session.attachPage(page);
  assert.ok(downloadHandler, "download handler should be registered");
  await downloadHandler!({
    suggestedFilename: async () => "export.csv",
    saveAs: async (filePath: string) => fs.writeFileSync(filePath, "a,b\n1,2\n", "utf-8"),
    url: () => "https://example.test/export.csv",
    failure: async () => "interrupted"
  });

  const artifacts = db.exportJson("gemini").artifacts;
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].target_id, "gemini");
  assert.equal(artifacts[0].capture_id, null);
  assert.equal(artifacts[0].kind, "download");
  assert.ok(fs.existsSync(artifacts[0].path!));
  assert.deepEqual(artifacts[0].metadata, {
    suggestedFilename: "export.csv",
    url: "https://example.test/export.csv",
    failure: "interrupted"
  });
});
