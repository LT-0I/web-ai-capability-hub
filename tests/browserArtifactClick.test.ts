const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { spawnSync } = require("node:child_process");
import { artifactClickOnPage, ArtifactClickError, selectArtifactClickPage, waitForArtifactPageReady } from "../src/browser/artifactClick";

class FakeElement {
  public tagName = "BUTTON";
  public innerText = "";
  public textContent = "";
  public parentElement: any = undefined;
  private attrs: Record<string, string> = {};
  constructor(public box: any, public contextText = "", private onClick?: () => void, attrs: Record<string, string> = {}) {
    this.innerText = contextText;
    this.textContent = contextText;
    this.attrs = attrs;
  }
  async scrollIntoViewIfNeeded(): Promise<void> {}
  async boundingBox(): Promise<any> { return this.box; }
  async evaluate(fn?: any): Promise<string> {
    if (typeof fn === "function") return String(fn({
      innerText: this.innerText,
      textContent: this.textContent,
      parentElement: this.parentElement,
      getAttribute: (name: string) => this.attrs[name] || ""
    }));
    return this.contextText;
  }
  click(): void { this.onClick?.(); }
}
class FakeLocator {
  constructor(private elements: FakeElement[], private text = "") {}
  async elementHandles(): Promise<FakeElement[]> { return this.elements; }
  async innerText(): Promise<string> { return this.text; }
}
class FakeFrame {
  constructor(public urlValue: string, private map: Record<string, FakeElement[]> | (() => Record<string, FakeElement[]>), private text = "") {}
  url(): string { return this.urlValue; }
  childFrames(): any[] { return []; }
  locator(selector: string): FakeLocator {
    const map = typeof this.map === "function" ? this.map() : this.map;
    return selector === "body" ? new FakeLocator([], this.text) : new FakeLocator(map[selector] || []);
  }
}
class FakeCDP extends EventEmitter { sends: any[] = []; async send(method: string, params: any): Promise<void> { this.sends.push({ method, params }); } }
class FakePageCDP extends FakeCDP {
  constructor(private clickTarget?: FakeElement) { super(); }
  async send(method: string, params: any): Promise<void> { await super.send(method, params); if (method === "Input.dispatchMouseEvent" && params.type === "mouseReleased") this.clickTarget?.click(); }
}

class CoordinatePageCDP extends FakeCDP {
  constructor(private elements: FakeElement[]) { super(); }
  async send(method: string, params: any): Promise<void> {
    await super.send(method, params);
    if (method !== "Input.dispatchMouseEvent" || params.type !== "mouseReleased") return;
    for (const element of this.elements) {
      const box = await element.boundingBox();
      if (box && params.x >= box.x && params.x <= box.x + box.width && params.y >= box.y && params.y <= box.y + box.height) {
        element.click();
        break;
      }
    }
  }
}
class FakePage {
  public viewportValue: any = { width: 800, height: 600 };
  public viewportCalls: any[] = [];
  public evaluateCalls: Array<{ source: string; arg: any }> = [];
  public evaluateResult: any = { ranScroll: true, candidates: 2 };
  constructor(public frameList: any[] | (() => any[]), public pageCdp: any, public currentUrl = "about:blank") {}
  frames(): any[] { return typeof this.frameList === "function" ? this.frameList() : this.frameList; }
  url(): string { return this.currentUrl; }
  context(): any { return { newCDPSession: async () => this.pageCdp }; }
  async goto(url: string): Promise<void> { this.currentUrl = url; }
  async waitForLoadState(): Promise<void> {}
  viewportSize(): any { return this.viewportValue; }
  async setViewportSize(size: any): Promise<void> { this.viewportCalls.push(size); this.viewportValue = size; }
  async evaluate(fn: any, arg: any): Promise<any> { this.evaluateCalls.push({ source: String(fn), arg }); return this.evaluateResult; }
}
function tempDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "artifact-click-")); }
function fakeBrowser(session: any): any { return { newBrowserCDPSession: async () => session }; }
async function assertCode(fn: () => Promise<any>, code: string): Promise<void> {
  await assert.rejects(fn, (error: any) => error instanceof ArtifactClickError && error.errorCode === code);
}


test("waitForArtifactPageReady sets viewport size when requested dimensions differ", async () => {
  const dir = tempDir();
  const page = new FakePage([], new FakePageCDP());
  await waitForArtifactPageReady(page, { profile: "p", buttonSelector: "button", downloadDir: dir, viewportWidth: 1500, viewportHeight: 1000, frameMinCount: 0 });
  assert.deepEqual(page.viewportCalls, [{ width: 1500, height: 1000 }]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("waitForArtifactPageReady scroll-main-to-y triggers evaluate and waits", async () => {
  const dir = tempDir();
  const page = new FakePage([], new FakePageCDP());
  const started = Date.now();
  const evidence = await waitForArtifactPageReady(page, { profile: "p", buttonSelector: "button", downloadDir: dir, scrollMainToY: 900, scrollMainWaitMs: 25, frameMinCount: 0 });
  assert.equal(page.evaluateCalls.length, 1);
  assert.equal(page.evaluateCalls[0].arg, 900);
  assert.match(page.evaluateCalls[0].source, /scrollHeight > el\.clientHeight \+ 50/);
  assert.match(page.evaluateCalls[0].source, /getBoundingClientRect\(\)\.x > 200/);
  assert.ok(Date.now() - started >= 20);
  assert.deepEqual(evidence.scroll, { ranScroll: true, candidates: 2, scrolledTo: 900 });
  fs.rmSync(dir, { recursive: true, force: true });
});

test("selectArtifactClickPage chooses an existing tab whose URL matches --url pathname", async () => {
  const pages = [
    new FakePage([], new FakePageCDP(), "https://chatgpt.com/"),
    new FakePage([], new FakePageCDP(), "https://example.com/other"),
    new FakePage([], new FakePageCDP(), "https://chatgpt.com/c/target-conversation?model=gpt")
  ];
  const selected = await selectArtifactClickPage({ pages: () => pages }, { url: "https://chatgpt.com/c/target-conversation" });
  assert.equal(selected, pages[2]);
});

test("selectArtifactClickPage duplicate URL matches picks the page with more frames", async () => {
  const makeFrames = (count: number) => Array.from({ length: count }, (_, index) => new FakeFrame(`f${index}`, {}, ""));
  const pages = [
    new FakePage(makeFrames(4), new FakePageCDP(), "https://chatgpt.com/c/dupe"),
    new FakePage(makeFrames(7), new FakePageCDP(), "https://chatgpt.com/c/dupe")
  ];
  const selected = await selectArtifactClickPage({ pages: () => pages }, { url: "https://chatgpt.com/c/dupe" });
  assert.equal(selected, pages[1]);
});

test("selectArtifactClickPage rejects when no existing tab matches", async () => {
  const pages = [new FakePage([], new FakePageCDP(), "https://chatgpt.com/")];
  await assertCode(() => selectArtifactClickPage({ pages: () => pages }, { url: "https://chatgpt.com/c/missing" }), "INVALID_ARGS");
});

test("selectArtifactClickPage rejects missing --url and --tab-url-contains instead of picking pages()[0]", async () => {
  const pages = [new FakePage([], new FakePageCDP(), "https://chatgpt.com/")];
  await assertCode(() => selectArtifactClickPage({ pages: () => pages }, {}), "INVALID_ARGS");
});

test("artifactClickOnPage captures browser-level download, renames, and hashes deterministically", async () => {
  const dir = tempDir();
  const body = Buffer.from("known fixture buffer");
  const bcdp = new FakeCDP();
  const button = new FakeElement({ x: 10, y: 20, width: 30, height: 10 }, "引言与背景", () => {
    fs.writeFileSync(path.join(dir, "guid-1"), body);
    bcdp.emit("Browser.downloadWillBegin", { guid: "guid-1", suggestedFilename: "report.docx", url: "blob:test" });
    bcdp.emit("Browser.downloadProgress", { guid: "guid-1", state: "completed", suggestedFilename: "report.docx" });
  });
  const page = new FakePage([new FakeFrame("https://frame.test", { "button.export": [button] }, "frame has 引言与背景")], new FakePageCDP(button));
  const result = await artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.export", buttonAncestorText: "引言", frameTextFilter: "背景", downloadDir: dir, filenamePattern: "*.docx", renameTo: "final.docx", verifyMinBytes: 5, timeoutMs: 1000 });
  assert.equal(result.path, path.join(dir, "final.docx"));
  assert.equal(result.size, body.length);
  assert.equal(result.sha256, "4d66f5c7002d8194da197b4ed281f9584af55f22f662e38f899de6056ce3b77d");
  assert.equal(result.downloadGuid, "guid-1");
  assert.ok(fs.existsSync(result.path));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("artifactClickOnPage reports iframe-not-found", async () => {
  const dir = tempDir();
  const page = new FakePage([new FakeFrame("f", {}, "other text")], new FakePageCDP());
  await assertCode(() => artifactClickOnPage(fakeBrowser(new FakeCDP()), page, { profile: "p", buttonSelector: "button", frameTextFilter: "missing", downloadDir: dir, timeoutMs: 50, locateTimeoutMs: 10 }), "IFRAME_NOT_FOUND");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("artifactClickOnPage reports element-out-of-viewport", async () => {
  const dir = tempDir();
  const page = new FakePage([new FakeFrame("f", { button: [new FakeElement({ x: 0, y: 1200, width: 1, height: 1 }, "ctx")] }, "text")], new FakePageCDP());
  await assertCode(() => artifactClickOnPage(fakeBrowser(new FakeCDP()), page, { profile: "p", buttonSelector: "button", downloadDir: dir, timeoutMs: 50 }), "ELEMENT_OUT_OF_VIEWPORT");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("artifactClickOnPage reports download-timeout", async () => {
  const dir = tempDir();
  const button = new FakeElement({ x: 0, y: 10, width: 1, height: 1 }, "ctx");
  const page = new FakePage([new FakeFrame("f", { button: [button] }, "text")], new FakePageCDP(button));
  await assertCode(() => artifactClickOnPage(fakeBrowser(new FakeCDP()), page, { profile: "p", buttonSelector: "button", downloadDir: dir, timeoutMs: 80 }), "ARTIFACT_DOWNLOAD_TIMEOUT");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("artifactClickOnPage reports filename pattern mismatch", async () => {
  const dir = tempDir();
  const bcdp = new FakeCDP();
  const button = new FakeElement({ x: 0, y: 10, width: 1, height: 1 }, "ctx", () => {
    fs.writeFileSync(path.join(dir, "guid-2"), "abc");
    bcdp.emit("Browser.downloadWillBegin", { guid: "guid-2", suggestedFilename: "report.txt" });
    bcdp.emit("Browser.downloadProgress", { guid: "guid-2", state: "completed", suggestedFilename: "report.txt" });
  });
  const page = new FakePage([new FakeFrame("f", { button: [button] }, "text")], new FakePageCDP(button));
  await assertCode(() => artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button", downloadDir: dir, filenamePattern: "*.docx", timeoutMs: 500 }), "ARTIFACT_VERIFICATION_FAILED");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("artifactClickOnPage retries frame walk when iframes attach late", async () => {
  const dir = tempDir();
  const body = Buffer.from("retry fixture buffer");
  const bcdp = new FakeCDP();
  const button = new FakeElement({ x: 5, y: 15, width: 20, height: 10 }, "ctx", () => {
    fs.writeFileSync(path.join(dir, "guid-retry"), body);
    bcdp.emit("Browser.downloadWillBegin", { guid: "guid-retry", suggestedFilename: "retry.docx" });
    bcdp.emit("Browser.downloadProgress", { guid: "guid-retry", state: "completed", suggestedFilename: "retry.docx" });
  });
  let walks = 0;
  const frame = new FakeFrame("https://frame.retry", () => (++walks <= 1 ? ({} as Record<string, FakeElement[]>) : { button: [button] }), "text");
  const page = new FakePage([frame], new FakePageCDP(button), "https://chatgpt.com/c/retry");
  const result = await artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button", downloadDir: dir, timeoutMs: 1000, locateTimeoutMs: 700 });
  assert.equal(result.size, body.length);
  assert.ok(walks >= 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("artifactClickOnPage includes page/frame evidence after locate timeout", async () => {
  const dir = tempDir();
  const page = new FakePage([new FakeFrame("https://frame.none", {}, "text")], new FakePageCDP(), "https://chatgpt.com/c/no-match");
  await assert.rejects(
    () => artifactClickOnPage(fakeBrowser(new FakeCDP()), page, { profile: "p", buttonSelector: "button.missing", downloadDir: dir, timeoutMs: 1000, locateTimeoutMs: 10 }),
    (error: any) => {
      assert.ok(error instanceof ArtifactClickError);
      assert.equal(error.errorCode, "ELEMENT_NOT_FOUND");
      assert.equal(error.evidence.pageUrl, "https://chatgpt.com/c/no-match");
      assert.equal(error.evidence.frameCount, 1);
      assert.ok(Array.isArray(error.evidence.triedFrames));
      assert.ok(error.evidence.triedFrames.length >= 1);
      assert.deepEqual(error.evidence.triedFrames[0], { url: "https://frame.none", hadSelectorMatch: false });
      return true;
    }
  );
  fs.rmSync(dir, { recursive: true, force: true });
});


test("artifactClickOnPage attaches scroll evidence on element-not-found", async () => {
  const dir = tempDir();
  const page = new FakePage([new FakeFrame("https://frame.none", {}, "text")], new FakePageCDP(), "https://chatgpt.com/c/scroll-miss");
  const pageReadyEvidence = await waitForArtifactPageReady(page, { profile: "p", buttonSelector: "button.missing", downloadDir: dir, scrollMainToY: 900, scrollMainWaitMs: 1, frameMinCount: 0 });
  await assert.rejects(
    () => artifactClickOnPage(fakeBrowser(new FakeCDP()), page, { profile: "p", buttonSelector: "button.missing", downloadDir: dir, timeoutMs: 1000, locateTimeoutMs: 10, pageReadyEvidence }),
    (error: any) => {
      assert.ok(error instanceof ArtifactClickError);
      assert.equal(error.errorCode, "ELEMENT_NOT_FOUND");
      assert.deepEqual(error.evidence.scroll, { ranScroll: true, candidates: 2, scrolledTo: 900 });
      return true;
    }
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("followUpTextRegex matches an item by innerText", async () => {
  const dir = tempDir();
  const body = Buffer.from("regex inner fixture");
  const bcdp = new FakeCDP();
  const button = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "export");
  const follow = new FakeElement({ x: 20, y: 30, width: 40, height: 10 }, "下载 DOCX", () => {
    fs.writeFileSync(path.join(dir, "guid-regex-inner"), body);
    bcdp.emit("Browser.downloadWillBegin", { guid: "guid-regex-inner", suggestedFilename: "inner.docx" });
    bcdp.emit("Browser.downloadProgress", { guid: "guid-regex-inner", state: "completed", suggestedFilename: "inner.docx" });
  });
  const frame = new FakeFrame("f", { "button.export": [button], '[role="menuitem"], button, a, [role="button"], li': [follow] }, "text");
  const page = new FakePage([frame], new CoordinatePageCDP([button, follow]));
  const result = await artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.export", followUpTextRegex: "DOCX", downloadDir: dir, timeoutMs: 1000 });
  assert.equal(result.size, body.length);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("followUpTextRegex matches by aria-label", async () => {
  const dir = tempDir();
  const body = Buffer.from("regex aria fixture");
  const bcdp = new FakeCDP();
  const button = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "export");
  const follow = new FakeElement({ x: 20, y: 30, width: 40, height: 10 }, "", () => {
    fs.writeFileSync(path.join(dir, "guid-regex-aria"), body);
    bcdp.emit("Browser.downloadWillBegin", { guid: "guid-regex-aria", suggestedFilename: "aria.docx" });
    bcdp.emit("Browser.downloadProgress", { guid: "guid-regex-aria", state: "completed", suggestedFilename: "aria.docx" });
  }, { "aria-label": "导出为 Word" });
  const frame = new FakeFrame("f", { "button.export": [button], '[role="menuitem"], button, a, [role="button"], li': [follow] }, "text");
  const page = new FakePage([frame], new CoordinatePageCDP([button, follow]));
  const result = await artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.export", followUpTextRegex: "Word", downloadDir: dir, timeoutMs: 1000 });
  assert.equal(result.size, body.length);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("followUpTextRegex skips out-of-viewport items", async () => {
  const dir = tempDir();
  const button = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "export");
  const follow = new FakeElement({ x: 20, y: 1201, width: 40, height: 10 }, "下载 DOCX");
  const frame = new FakeFrame("f", { "button.export": [button], '[role="menuitem"], button, a, [role="button"], li': [follow] }, "text");
  const page = new FakePage([frame], new FakePageCDP(button));
  await assertCode(() => artifactClickOnPage(fakeBrowser(new FakeCDP()), page, { profile: "p", buttonSelector: "button.export", followUpTextRegex: "DOCX", downloadDir: dir, timeoutMs: 1000, locateTimeoutMs: 10 }), "ELEMENT_OUT_OF_VIEWPORT");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("pollDownload is aborted when follow-up locate fails", async () => {
  const dir = tempDir();
  const bcdp = new FakeCDP();
  const button = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "export");
  const page = new FakePage([new FakeFrame("f", { "button.export": [button] }, "text")], new FakePageCDP(button));
  let unhandled = 0;
  const onUnhandled = () => { unhandled++; };
  process.on("unhandledRejection", onUnhandled);
  try {
    await assert.rejects(
      () => artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.export", followUpSelector: "button.missing", downloadDir: dir, timeoutMs: 2000, locateTimeoutMs: 10 }),
      (error: any) => {
        assert.ok(error instanceof ArtifactClickError);
        assert.equal(error.errorCode, "ELEMENT_NOT_FOUND");
        assert.match(error.message, /--follow-up-selector/);
        return true;
      }
    );
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(unhandled, 0);
  } finally {
    process.off("unhandledRejection", onUnhandled);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pollDownload abort: follow-up failure emits one JSON CLI error", () => {
  const script = `
    const artifact = require(${JSON.stringify(path.resolve(__dirname, "../src/browser/artifactClick.js"))});
    artifact.runArtifactClick = async () => { throw new artifact.ArtifactClickError("ELEMENT_NOT_FOUND", "No element matched --follow-up-selector", { selector: "button.missing" }); };
    const cli = require(${JSON.stringify(path.resolve(__dirname, "../src/cli.js"))});
    process.argv = [process.execPath, "cli", "browser:artifact-click", "--profile", "p", "--button-selector", "button.export", "--follow-up-selector", "button.missing", "--download-dir", ${JSON.stringify(tempDir())}, "--output-json"];
    cli.main(process.argv.slice(2)).catch((error) => {
      const parsed = { options: { "output-json": true } };
      const message = error instanceof Error ? error.message : String(error);
      const errorCode = error && error.errorCode;
      console.error(JSON.stringify({ ok: false, ...(errorCode ? { errorCode } : {}), error: message, ...(error.evidence ? { evidence: error.evidence } : {}) }));
      process.exitCode = 1;
    });
  `;
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8" });
  assert.equal(result.status, 1);
  const lines = result.stderr.trim().split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), { ok: false, errorCode: "ELEMENT_NOT_FOUND", error: "No element matched --follow-up-selector", evidence: { selector: "button.missing" } });
  assert.equal(result.stdout.trim(), "");
});

test("browser:artifact-click JSON CLI error redacts sensitive evidence", () => {
  const dir = tempDir();
  const cli = path.resolve(__dirname, "../src/cli.js");
  const sensitive = "https://chatgpt.com/c/abcdef1234567890abcdef12[";
  const result = spawnSync(process.execPath, [cli, "browser:artifact-click", "--profile", "chatgpt", "--button-selector", "button", "--download-dir", dir, "--follow-up-text-regex", sensitive, "--output-json"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stderr.trim());
  assert.equal(parsed.errorCode, "INVALID_ARGS");
  assert.equal(JSON.stringify(parsed).includes("abcdef1234567890abcdef12"), false);
  assert.equal(parsed.evidence.followUpTextRegex, "https://chatgpt.com/c/<conversation-id>[");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("followUpTextRegex at y=1050 passes when viewportHeight raises max viewport y", async () => {
  const dir = tempDir();
  const body = Buffer.from("regex tall viewport fixture");
  const bcdp = new FakeCDP();
  const button = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "export");
  const follow = new FakeElement({ x: 20, y: 1050, width: 40, height: 10 }, "下载 DOCX", () => {
    fs.writeFileSync(path.join(dir, "guid-regex-tall"), body);
    bcdp.emit("Browser.downloadWillBegin", { guid: "guid-regex-tall", suggestedFilename: "tall.docx" });
    bcdp.emit("Browser.downloadProgress", { guid: "guid-regex-tall", state: "completed", suggestedFilename: "tall.docx" });
  });
  const frame = new FakeFrame("f", { "button.export": [button], '[role="menuitem"], button, a, [role="button"], li': [follow] }, "text");
  const page = new FakePage([frame], new CoordinatePageCDP([button, follow]));
  const result = await artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.export", followUpTextRegex: "DOCX", downloadDir: dir, viewportHeight: 1500, timeoutMs: 1000 });
  assert.equal(result.size, body.length);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("followUpTextRegex at y=1050 fails by default and reports maxViewportY evidence", async () => {
  const dir = tempDir();
  const button = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "export");
  const follow = new FakeElement({ x: 20, y: 1050, width: 40, height: 10 }, "下载 DOCX");
  const frame = new FakeFrame("f", { "button.export": [button], '[role="menuitem"], button, a, [role="button"], li': [follow] }, "text");
  const page = new FakePage([frame], new FakePageCDP(button));
  await assert.rejects(
    () => artifactClickOnPage(fakeBrowser(new FakeCDP()), page, { profile: "p", buttonSelector: "button.export", followUpTextRegex: "DOCX", downloadDir: dir, timeoutMs: 1000, locateTimeoutMs: 10 }),
    (error: any) => {
      assert.ok(error instanceof ArtifactClickError);
      assert.equal(error.errorCode, "ELEMENT_OUT_OF_VIEWPORT");
      assert.equal(error.evidence.maxViewportY, 1000);
      return true;
    }
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("followUpTextRegex scrolls an initially below-viewport item before rejecting it", async () => {
  const dir = tempDir();
  const body = Buffer.from("regex scroll recovery fixture");
  const bcdp = new FakeCDP();
  const button = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "export");
  const follow = new FakeElement({ x: 20, y: 1500, width: 40, height: 10 }, "下载 DOCX", () => {
    fs.writeFileSync(path.join(dir, "guid-regex-scroll"), body);
    bcdp.emit("Browser.downloadWillBegin", { guid: "guid-regex-scroll", suggestedFilename: "scroll.docx" });
    bcdp.emit("Browser.downloadProgress", { guid: "guid-regex-scroll", state: "completed", suggestedFilename: "scroll.docx" });
  });
  let scrolls = 0;
  follow.scrollIntoViewIfNeeded = async () => { scrolls++; follow.box = { x: 20, y: 200, width: 40, height: 10 }; };
  const frame = new FakeFrame("f", { "button.export": [button], '[role="menuitem"], button, a, [role="button"], li': [follow] }, "text");
  const page = new FakePage([frame], new CoordinatePageCDP([button, follow]));
  const result = await artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.export", followUpTextRegex: "DOCX", downloadDir: dir, timeoutMs: 1000 });
  assert.equal(result.size, body.length);
  assert.equal(scrolls, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("generate-file artifact click uses suggestedFilename instead of browser GUID", async () => {
  const dir = tempDir();
  const body = Buffer.from("docx-ish fixture");
  const bcdp = new FakeCDP();
  const button = new FakeElement({ x: 0, y: 10, width: 10, height: 10 }, "ctx", () => {
    fs.writeFileSync(path.join(dir, "guid-docx"), body);
    bcdp.emit("Browser.downloadWillBegin", { guid: "guid-docx", suggestedFilename: "report.docx" });
    bcdp.emit("Browser.downloadProgress", { guid: "guid-docx", state: "completed", suggestedFilename: "report.docx" });
  });
  const page = new FakePage([new FakeFrame("f", { button: [button] }, "text")], new FakePageCDP(button));
  const result = await artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button", downloadDir: dir, filenamePattern: "\\.docx$", timeoutMs: 500 });
  assert.equal(result.path, path.join(dir, "report.docx"));
  assert.equal(result.downloadFilename, "report.docx");
  assert.equal(result.suggestedFilename, "report.docx");
  assert.ok(!fs.existsSync(path.join(dir, "guid-docx")));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("generate-file artifact click falls back when suggested filename is missing", async () => {
  const dir = tempDir();
  const body = Buffer.from("fallback fixture");
  const digest = require("node:crypto").createHash("sha256").update(body).digest("hex").slice(0, 12);
  const bcdp = new FakeCDP();
  const button = new FakeElement({ x: 0, y: 10, width: 10, height: 10 }, "ctx", () => {
    fs.writeFileSync(path.join(dir, "guid-missing"), body);
    bcdp.emit("Browser.downloadWillBegin", { guid: "guid-missing" });
    bcdp.emit("Browser.downloadProgress", { guid: "guid-missing", state: "completed" });
  });
  const page = new FakePage([new FakeFrame("f", { button: [button] }, "text")], new FakePageCDP(button));
  const result = await artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button", downloadDir: dir, filenamePattern: "\\.docx$", timeoutMs: 500 });
  assert.equal(result.downloadFilename, `download-${digest}.docx`);
  assert.equal(result.path, path.join(dir, `download-${digest}.docx`));
  assert.match(result.warn || "", /suggestedFilename/);
  fs.rmSync(dir, { recursive: true, force: true });
});
