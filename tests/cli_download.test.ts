const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
import { main } from "../src/cli";
import { ManagedBrowserLauncher } from "../src/browser/managedLauncher";
import { DownloadManager } from "../src/browser/downloads";
import { FakePage } from "./helpers";

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: any[]) => { lines.push(args.join(" ")); };
  try { await fn(); } finally { console.log = originalLog; }
  return lines.join("\n");
}

function tempDownloadDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wah-cli-downloads-"));
}

function mockManagedPage(t: any, page: any): void {
  const originalLaunch = ManagedBrowserLauncher.prototype.launch;
  const originalConnect = ManagedBrowserLauncher.prototype.connectOverCdp;
  ManagedBrowserLauncher.prototype.launch = async function(options: any) {
    return { profile: options.profile || "default", cdpEndpoint: "http://127.0.0.1:9222", cdpPort: 9222, connected: true } as any;
  };
  ManagedBrowserLauncher.prototype.connectOverCdp = async function() {
    return { contexts: () => [{ pages: () => [page] }], close: async () => undefined } as any;
  };
  t.after(() => {
    ManagedBrowserLauncher.prototype.launch = originalLaunch;
    ManagedBrowserLauncher.prototype.connectOverCdp = originalConnect;
  });
}

test("CLI browser:click --expect-download saves and returns download data", async (t: any) => {
  const dir = tempDownloadDir();
  const old = process.env.WAH_DOWNLOAD_DIR;
  process.env.WAH_DOWNLOAD_DIR = dir;
  const page = new FakePage("https://example.test") as any;
  page.waitForEvent = async (event: string) => {
    assert.equal(event, "download");
    return {
      suggestedFilename: async () => "report.csv",
      saveAs: async (filePath: string) => fs.writeFileSync(filePath, "a,b\n1,2\n", "utf-8"),
      url: () => "https://example.test/report.csv",
      failure: async () => null
    };
  };
  mockManagedPage(t, page);
  t.after(() => { if (old === undefined) delete process.env.WAH_DOWNLOAD_DIR; else process.env.WAH_DOWNLOAD_DIR = old; fs.rmSync(dir, { recursive: true, force: true }); });

  const stdout = await captureStdout(() => main(["browser:click", "--profile", "chatgpt", "--selector", "a[download]", "--expect-download", "--ms", "1234", "--confirmed", "--json"]));
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.action.expectDownload, true);
  assert.equal(parsed.action.timeoutMs, 1234);
  assert.equal(parsed.data.suggestedFilename, "report.csv");
  assert.equal(parsed.data.bytes, 8);
  assert.ok(fs.existsSync(parsed.data.savedPath));
  assert.match(parsed.data.artifactId, /artifacts/);
});

test("CLI browser:click --expect-download reports timeout without claiming success", async (t: any) => {
  const dir = tempDownloadDir();
  const old = process.env.WAH_DOWNLOAD_DIR;
  process.env.WAH_DOWNLOAD_DIR = dir;
  const page = new FakePage("https://example.test") as any;
  page.waitForEvent = async () => { throw new Error("Timeout 25ms exceeded"); };
  mockManagedPage(t, page);
  t.after(() => { if (old === undefined) delete process.env.WAH_DOWNLOAD_DIR; else process.env.WAH_DOWNLOAD_DIR = old; fs.rmSync(dir, { recursive: true, force: true }); });

  const stdout = await captureStdout(() => main(["browser:click", "--selector", "a[download]", "--expect-download", "--ms", "25", "--confirmed", "--json"]));
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "no download event within 25ms");
});

test("CLI browser:downloads lists tracked downloads", async (t: any) => {
  const dir = tempDownloadDir();
  const old = process.env.WAH_DOWNLOAD_DIR;
  process.env.WAH_DOWNLOAD_DIR = dir;
  t.after(() => { if (old === undefined) delete process.env.WAH_DOWNLOAD_DIR; else process.env.WAH_DOWNLOAD_DIR = old; fs.rmSync(dir, { recursive: true, force: true }); });
  await new DownloadManager(dir).saveBuffer({ filename: "one.txt", bytes: Buffer.from("hello"), profile: "chatgpt", sourceUrl: "https://example.test/one.txt", mimeType: "text/plain" });

  const stdout = await captureStdout(() => main(["browser:downloads", "--profile", "chatgpt", "--json"]));
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].profile, "chatgpt");
  assert.equal(parsed[0].suggestedFilename, "one.txt");
  assert.equal(parsed[0].sizeBytes, 5);
  assert.equal(parsed[0].sourceUrl, "https://example.test/one.txt");
});

test("CLI browser:download-url fetches through page request and tracks file", async (t: any) => {
  const dir = tempDownloadDir();
  const old = process.env.WAH_DOWNLOAD_DIR;
  process.env.WAH_DOWNLOAD_DIR = dir;
  const page = new FakePage("https://example.test") as any;
  page.request = {
    get: async (url: string) => ({
      ok: () => true,
      status: () => 200,
      headers: () => ({ "content-type": "text/csv", "content-disposition": "attachment; filename=remote.csv" }),
      body: async () => Buffer.from(`url,value\n${url},ok\n`)
    })
  };
  mockManagedPage(t, page);
  t.after(() => { if (old === undefined) delete process.env.WAH_DOWNLOAD_DIR; else process.env.WAH_DOWNLOAD_DIR = old; fs.rmSync(dir, { recursive: true, force: true }); });

  const stdout = await captureStdout(() => main(["browser:download-url", "--url", "https://example.test/remote.csv", "--confirmed", "--json"]));
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.suggestedFilename, "remote.csv");
  assert.equal(parsed.data.mimeType, "text/csv");
  assert.ok(fs.existsSync(parsed.data.savedPath));
  assert.match(fs.readFileSync(parsed.data.savedPath, "utf-8"), /remote.csv,ok/);
});
