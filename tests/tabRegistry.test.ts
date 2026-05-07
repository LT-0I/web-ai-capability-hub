const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
import { TabRegistry } from "../src/browser/tabRegistry";
import { activeManagedPage } from "../src/browser/managedPageRouting";

function tempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wah-tabs-"));
}

class FakeCdpSession {
  detached = false;
  constructor(private targetId: string) {}
  async send(method: string): Promise<any> {
    assert.equal(method, "Target.getTargetInfo");
    return { targetInfo: { targetId: this.targetId } };
  }
  async detach(): Promise<void> {
    this.detached = true;
  }
}

class FakePage {
  navigations: string[] = [];
  loadStates: string[] = [];
  constructor(private currentUrl: string, private targetId: string) {}
  url(): string {
    return this.currentUrl;
  }
  context(): any {
    return { newCDPSession: async () => new FakeCdpSession(this.targetId) };
  }
  async goto(url: string): Promise<void> {
    this.currentUrl = url;
    this.navigations.push(url);
  }
  async waitForLoadState(state: string): Promise<void> {
    this.loadStates.push(state);
  }
}

function fakeBrowser(pages: FakePage[]): any {
  return { contexts: () => [{ pages: () => pages }] };
}

test("tab registry persists, replaces, filters, and unregisters tab entries", async () => {
  const dataDir = tempDataDir();
  const registry = new TabRegistry(dataDir);

  await registry.register({ tabId: "task-A", pageId: "page-1", url: "https://example.test/a", profile: "gemini", allocatedAt: "2026-05-06T00:00:00.000Z", status: "active" });
  await registry.register({ tabId: "task-B", pageId: "page-2", url: "https://example.test/b", profile: "claude", allocatedAt: "2026-05-06T00:01:00.000Z", status: "active" });
  await registry.register({ tabId: "task-A", pageId: "page-3", url: "https://example.test/c", profile: "gemini", allocatedAt: "2026-05-06T00:02:00.000Z", status: "active" });

  const reloaded = new TabRegistry(dataDir);
  assert.deepEqual((await reloaded.get("task-A"))?.pageId, "page-3");
  assert.deepEqual((await reloaded.list()).map((entry) => entry.tabId).sort(), ["task-A", "task-B"]);

  await reloaded.unregister("task-A");

  assert.equal(await reloaded.get("task-A"), undefined);
  assert.deepEqual((await reloaded.list()).map((entry) => entry.tabId), ["task-B"]);
});

test("activeManagedPage resolves an explicit tab id by CDP page id instead of matching URL", async () => {
  const dataDir = tempDataDir();
  const registry = new TabRegistry(dataDir);
  const pageA = new FakePage("https://gemini.google.com/app", "target-A");
  const pageB = new FakePage("https://gemini.google.com/app", "target-B");

  await registry.register({ tabId: "smoke-A", pageId: "target-A", url: "https://gemini.google.com/app", profile: "gemini", allocatedAt: "2026-05-06T00:00:00.000Z", status: "active" });
  await registry.register({ tabId: "smoke-B", pageId: "target-B", url: "https://gemini.google.com/app", profile: "gemini", allocatedAt: "2026-05-06T00:00:01.000Z", status: "active" });

  const page = await activeManagedPage(fakeBrowser([pageA, pageB]), undefined, "smoke-B", dataDir);

  assert.equal(page, pageB);
  assert.deepEqual(pageA.navigations, []);
  assert.deepEqual(pageB.loadStates, ["domcontentloaded"]);
});

test("activeManagedPage reports a missing explicit tab id before URL fallback", async () => {
  await assert.rejects(
    activeManagedPage(fakeBrowser([new FakePage("https://gemini.google.com/app", "target-A")]), "https://gemini.google.com/app", "missing-tab", tempDataDir()),
    /Tab ID "missing-tab" not found in registry/
  );
});
