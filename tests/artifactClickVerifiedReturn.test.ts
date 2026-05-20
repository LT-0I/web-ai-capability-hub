const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
import { artifactClickOnPage, ArtifactClickError, recoverGovernedArtifactFromDisk } from "../src/browser/artifactClick";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04]);
const RECOVERY_WARN = "follow-up download control not found, but the governed artifact was delivered by the browser";
const RESULT_KEYS = ["bbox", "downloadFilename", "downloadGuid", "elapsedMs", "frameUrl", "path", "sha256", "size", "suggestedFilename", "warn"].sort();

class FakeElement {
  public tagName = "BUTTON";
  public innerText = "";
  public textContent = "";
  public parentElement: any = undefined;
  constructor(public box: any, text = "", private onClick?: () => void) {
    this.innerText = text;
    this.textContent = text;
  }
  async scrollIntoViewIfNeeded(): Promise<void> {}
  async boundingBox(): Promise<any> { return this.box; }
  async evaluate(fn?: any): Promise<string> {
    if (typeof fn === "function") return String(fn({ innerText: this.innerText, textContent: this.textContent, parentElement: this.parentElement, getAttribute: () => "" }));
    return this.innerText;
  }
  click(): void { this.onClick?.(); }
}
class FakeLocator {
  constructor(private elements: FakeElement[], private text = "") {}
  async elementHandles(): Promise<FakeElement[]> { return this.elements; }
  async innerText(): Promise<string> { return this.text; }
}
class FakeFrame {
  constructor(private map: Record<string, FakeElement[]>, private text = "") {}
  url(): string { return "https://frame.test"; }
  childFrames(): any[] { return []; }
  locator(selector: string): FakeLocator { return selector === "body" ? new FakeLocator([], this.text) : new FakeLocator(this.map[selector] || []); }
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
      if (box && params.x >= box.x && params.x <= box.x + box.width && params.y >= box.y && params.y <= box.y + box.height) element.click();
    }
  }
}
class FakePage {
  constructor(private frameList: any[], private pageCdp: any) {}
  frames(): any[] { return this.frameList; }
  url(): string { return "https://chatgpt.com/c/test"; }
  context(): any { return { newCDPSession: async () => this.pageCdp }; }
}
function tempDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "artifact-verified-")); }
function fakeBrowser(session: any): any { return { newBrowserCDPSession: async () => session }; }
function emitDownload(bcdp: any, dir: string, guid: string, suggestedFilename: string, body: Buffer): void {
  fs.writeFileSync(path.join(dir, guid), body);
  bcdp.emit("Browser.downloadWillBegin", { guid, suggestedFilename, url: "blob:test" });
  bcdp.emit("Browser.downloadProgress", { guid, state: "completed", suggestedFilename });
}
async function expectArtifactError(fn: () => Promise<any>, expected: ArtifactClickError): Promise<void> {
  await assert.rejects(fn, (error: any) => {
    assert.equal(error, expected);
    assert.ok(error instanceof ArtifactClickError);
    assert.equal(error.errorCode, expected.errorCode);
    assert.equal(error.message, expected.message);
    return true;
  });
}

test("valid governed PNG returns ok when follow-up selector throws ELEMENT_NOT_FOUND", async () => {
  const dir = tempDir();
  try {
    const bcdp = new FakeCDP();
    const open = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "open", () => emitDownload(bcdp, dir, "guid-png", "ChatGPT Image May 18, 2026, 01:40:19 AM.png", PNG_BYTES));
    const page = new FakePage([new FakeFrame({ "button.open": [open] })], new FakePageCDP(open));
    const result = await artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.open", followUpSelector: "button.missing", downloadDir: dir, filenamePattern: "\\.(png|jpg|jpeg|webp)$", timeoutMs: 500, locateTimeoutMs: 5 });
    assert.equal(result.path, path.join(dir, "ChatGPT_Image_May_18_2026_01_40_19_AM.png"));
    assert.equal(result.downloadFilename, "ChatGPT_Image_May_18_2026_01_40_19_AM.png");
    assert.doesNotMatch(path.basename(result.path), /[\s,:]/);
    assert.equal(result.warn, "follow-up download control not found, but the governed artifact was delivered by the browser");
    assert.equal(fs.readFileSync(result.path).subarray(0, 8).equals(PNG_BYTES.subarray(0, 8)), true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("real governed PNG on disk returns ok when downloadPromise yields nothing", async () => {
  const dir = tempDir();
  try {
    const bcdp = new FakeCDP();
    const diskPath = path.join(dir, "ChatGPT Image May 18, 2026, 01_40_19 AM.png");
    const open = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "open", () => setTimeout(() => fs.writeFileSync(diskPath, PNG_BYTES), 350));
    const page = new FakePage([new FakeFrame({ "button.open": [open] })], new FakePageCDP(open));
    const result = await artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.open", followUpSelector: "button.missing", downloadDir: dir, filenamePattern: "\\.(png|jpg|jpeg|webp)$", timeoutMs: 1000, locateTimeoutMs: 5 });
    assert.deepEqual(Object.keys(result).sort(), RESULT_KEYS);
    assert.equal(result.path, diskPath);
    assert.equal(result.size, PNG_BYTES.length);
    assert.equal(result.warn, RECOVERY_WARN);
    assert.equal(fs.readFileSync(result.path).subarray(0, 8).equals(PNG_BYTES.subarray(0, 8)), true);
    assert.equal(result.downloadFilename, path.basename(result.path));
    assert.ok(result.sha256);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("recoverGovernedArtifactFromDisk waits for a governed PNG written within settleMs", async () => {
  const dir = tempDir();
  try {
    const diskPath = path.join(dir, "late.png");
    const started = Date.now();
    setTimeout(() => fs.writeFileSync(diskPath, PNG_BYTES), 50);
    const recovered = await recoverGovernedArtifactFromDisk(dir, started, 1000);
    assert.equal(recovered.ok, true);
    if (recovered.ok) assert.equal(recovered.realPath, fs.realpathSync(diskPath));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("recoverGovernedArtifactFromDisk returns ok false after bounded settle with no governed PNG", async () => {
  const dir = tempDir();
  try {
    const started = Date.now();
    const before = Date.now();
    const recovered = await recoverGovernedArtifactFromDisk(dir, started, 100);
    assert.deepEqual(recovered, { ok: false });
    assert.ok(Date.now() - before >= 100);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("empty governed dir returns ok false within settleMs without fabricated path", async () => {
  const dir = tempDir();
  try {
    assert.deepEqual(fs.readdirSync(dir), []);
    const started = Date.now();
    const before = Date.now();
    const recovered = await recoverGovernedArtifactFromDisk(dir, started, 75);
    const elapsed = Date.now() - before;
    assert.deepEqual(recovered, { ok: false });
    assert.equal(Object.prototype.hasOwnProperty.call(recovered, "realPath"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(recovered, "path"), false);
    assert.ok(elapsed >= 75, `settled too early: ${elapsed}ms`);
    assert.ok(elapsed < 1000, `settled too late: ${elapsed}ms`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("nothing on disk and no download events preserves original follow-up ELEMENT_NOT_FOUND", async () => {
  const dir = tempDir();
  try {
    const bcdp = new FakeCDP();
    const open = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "open");
    const page = new FakePage([new FakeFrame({ "button.open": [open] })], new FakePageCDP(open));
    await assert.rejects(
      () => artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.open", followUpSelector: "button.missing", downloadDir: dir, filenamePattern: "\\.(png|jpg|jpeg|webp)$", timeoutMs: 1000, locateTimeoutMs: 5 }),
      (error: any) => error instanceof ArtifactClickError && error.errorCode === "ELEMENT_NOT_FOUND" && /--follow-up-selector/.test(error.message)
    );
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("stale governed PNG without download events preserves original follow-up ELEMENT_NOT_FOUND", async () => {
  const dir = tempDir();
  try {
    const stalePath = path.join(dir, "stale.png");
    fs.writeFileSync(stalePath, PNG_BYTES);
    const oldDate = new Date(Date.now() - 60000);
    fs.utimesSync(stalePath, oldDate, oldDate);
    const bcdp = new FakeCDP();
    const open = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "open");
    const page = new FakePage([new FakeFrame({ "button.open": [open] })], new FakePageCDP(open));
    await assert.rejects(
      () => artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.open", followUpSelector: "button.missing", downloadDir: dir, filenamePattern: "\\.(png|jpg|jpeg|webp)$", timeoutMs: 1000, locateTimeoutMs: 5 }),
      (error: any) => error instanceof ArtifactClickError && error.errorCode === "ELEMENT_NOT_FOUND" && /--follow-up-selector/.test(error.message)
    );
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("fresh symlinked PNG outside governed dir without download events preserves original follow-up ELEMENT_NOT_FOUND", async () => {
  const dir = tempDir();
  const outside = tempDir();
  try {
    const outsidePng = path.join(outside, "outside.png");
    const bcdp = new FakeCDP();
    const open = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "open", () => {
      fs.writeFileSync(outsidePng, PNG_BYTES);
      fs.symlinkSync(outsidePng, path.join(dir, "linked.png"));
    });
    const page = new FakePage([new FakeFrame({ "button.open": [open] })], new FakePageCDP(open));
    await assert.rejects(
      () => artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.open", followUpSelector: "button.missing", downloadDir: dir, filenamePattern: "\\.(png|jpg|jpeg|webp)$", timeoutMs: 1000, locateTimeoutMs: 5 }),
      (error: any) => error instanceof ArtifactClickError && error.errorCode === "ELEMENT_NOT_FOUND" && /--follow-up-selector/.test(error.message)
    );
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});

test("fresh non-PNG magic without download events preserves original follow-up ELEMENT_NOT_FOUND", async () => {
  const dir = tempDir();
  try {
    const bcdp = new FakeCDP();
    const open = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "open", () => fs.writeFileSync(path.join(dir, "whatever.png"), Buffer.from("not a png")));
    const page = new FakePage([new FakeFrame({ "button.open": [open] })], new FakePageCDP(open));
    await assert.rejects(
      () => artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.open", followUpSelector: "button.missing", downloadDir: dir, filenamePattern: "\\.(png|jpg|jpeg|webp)$", timeoutMs: 1000, locateTimeoutMs: 5 }),
      (error: any) => error instanceof ArtifactClickError && error.errorCode === "ELEMENT_NOT_FOUND" && /--follow-up-selector/.test(error.message)
    );
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("gemini-shaped disk fallback returns populated governed PNG without service branch", async () => {
  const dir = tempDir();
  try {
    const bcdp = new FakeCDP();
    const diskPath = path.join(dir, "Gemini image, 10_11 AM.png");
    const open = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "image", () => setTimeout(() => fs.writeFileSync(diskPath, PNG_BYTES), 350));
    const page = new FakePage([new FakeFrame({ "img.generated": [open] })], new FakePageCDP(open));
    const result = await artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "img.generated", followUpSelector: 'button[data-test-id="image-download-button"]', downloadDir: dir, filenamePattern: "\\.(png|jpg|jpeg|webp)$", timeoutMs: 1000, locateTimeoutMs: 5 });
    assert.equal(result.path, diskPath);
    assert.equal(result.size, PNG_BYTES.length);
    assert.equal(result.warn, RECOVERY_WARN);
    assert.equal(result.downloadFilename, path.basename(result.path));
    assert.ok(result.sha256);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("zero-byte artifact preserves original follow-up ELEMENT_NOT_FOUND", async () => {
  const dir = tempDir();
  try {
    const bcdp = new FakeCDP();
    const open = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "open", () => emitDownload(bcdp, dir, "guid-empty", "empty.png", Buffer.alloc(0)));
    const page = new FakePage([new FakeFrame({ "button.open": [open] })], new FakePageCDP(open));
    await assert.rejects(
      () => artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.open", followUpSelector: "button.missing", downloadDir: dir, filenamePattern: "\\.(png|jpg|jpeg|webp)$", timeoutMs: 500, locateTimeoutMs: 5 }),
      (error: any) => error instanceof ArtifactClickError && error.errorCode === "ELEMENT_NOT_FOUND" && /--follow-up-selector/.test(error.message)
    );
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("symlink escape artifact preserves original follow-up ELEMENT_NOT_FOUND", async () => {
  const dir = tempDir();
  const outside = tempDir();
  try {
    const outsidePng = path.join(outside, "outside.png");
    fs.writeFileSync(outsidePng, PNG_BYTES);
    const bcdp = new FakeCDP();
    const open = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "open", () => {
      fs.symlinkSync(outsidePng, path.join(dir, "guid-link"));
      bcdp.emit("Browser.downloadWillBegin", { guid: "guid-link", suggestedFilename: "linked.png", url: "blob:test" });
      bcdp.emit("Browser.downloadProgress", { guid: "guid-link", state: "completed", suggestedFilename: "linked.png" });
    });
    const page = new FakePage([new FakeFrame({ "button.open": [open] })], new FakePageCDP(open));
    await assert.rejects(
      () => artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.open", followUpSelector: "button.missing", downloadDir: dir, filenamePattern: "\\.(png|jpg|jpeg|webp)$", timeoutMs: 500, locateTimeoutMs: 5 }),
      (error: any) => error instanceof ArtifactClickError && error.errorCode === "ELEMENT_NOT_FOUND" && /--follow-up-selector/.test(error.message)
    );
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});

test("non-PNG magic preserves original follow-up ELEMENT_NOT_FOUND", async () => {
  const dir = tempDir();
  try {
    const bcdp = new FakeCDP();
    const open = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "open", () => emitDownload(bcdp, dir, "guid-text", "not-png.png", Buffer.from("not a png")));
    const page = new FakePage([new FakeFrame({ "button.open": [open] })], new FakePageCDP(open));
    await assert.rejects(
      () => artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.open", followUpSelector: "button.missing", downloadDir: dir, filenamePattern: "\\.(png|jpg|jpeg|webp)$", timeoutMs: 500, locateTimeoutMs: 5 }),
      (error: any) => error instanceof ArtifactClickError && error.errorCode === "ELEMENT_NOT_FOUND" && /--follow-up-selector/.test(error.message)
    );
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("gemini-shaped follow-up selector returns valid governed PNG without service branch", async () => {
  const dir = tempDir();
  try {
    const bcdp = new FakeCDP();
    const open = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "image", () => emitDownload(bcdp, dir, "guid-gemini", "Gemini image, 10:11 AM.png", PNG_BYTES));
    const page = new FakePage([new FakeFrame({ "img.generated": [open] })], new FakePageCDP(open));
    const result = await artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "img.generated", followUpSelector: 'button[data-test-id="image-download-button"]', downloadDir: dir, filenamePattern: "\\.(png|jpg|jpeg|webp)$", timeoutMs: 500, locateTimeoutMs: 5 });
    assert.equal(result.path, path.join(dir, "Gemini_image_10_11_AM.png"));
    assert.equal(result.warn, "follow-up download control not found, but the governed artifact was delivered by the browser");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("happy path follow-up success preserves result shape", async () => {
  const dir = tempDir();
  try {
    const bcdp = new FakeCDP();
    const open = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "open");
    const save = new FakeElement({ x: 30, y: 10, width: 20, height: 10 }, "save", () => emitDownload(bcdp, dir, "guid-happy", "happy.png", PNG_BYTES));
    const page = new FakePage([new FakeFrame({ "button.open": [open], "button.save": [save] })], new CoordinatePageCDP([open, save]));
    const result = await artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.open", followUpSelector: "button.save", downloadDir: dir, filenamePattern: "\\.(png|jpg|jpeg|webp)$", timeoutMs: 1000, locateTimeoutMs: 5 });
    assert.deepEqual(Object.keys(result).sort(), ["bbox", "downloadFilename", "downloadGuid", "elapsedMs", "frameUrl", "path", "sha256", "size", "suggestedFilename", "warn"].sort());
    assert.equal(result.path, path.join(dir, "happy.png"));
    assert.equal(result.downloadFilename, "happy.png");
    assert.equal(result.suggestedFilename, "happy.png");
    assert.equal(result.downloadGuid, "guid-happy");
    assert.equal(result.warn, undefined);
    assert.equal(result.size, PNG_BYTES.length);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("non-throwing follow-up recovers governed PNG when downloadWillBegin is missed", async () => {
  const dir = tempDir();
  try {
    const bcdp = new FakeCDP();
    const diskPath = path.join(dir, "save-wrote-real.png");
    const open = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "open");
    const save = new FakeElement({ x: 30, y: 10, width: 20, height: 10 }, "save", () => fs.writeFileSync(diskPath, PNG_BYTES));
    const page = new FakePage([new FakeFrame({ "button.open": [open], "button.save": [save] })], new CoordinatePageCDP([open, save]));
    const result = await artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.open", followUpSelector: "button.save", downloadDir: dir, filenamePattern: "\\.(png|jpg|jpeg|webp)$", timeoutMs: 1000, locateTimeoutMs: 5 });
    assert.deepEqual(Object.keys(result).sort(), RESULT_KEYS);
    assert.equal(result.path, fs.realpathSync(diskPath));
    assert.equal(result.size, PNG_BYTES.length);
    assert.equal(result.sha256, crypto.createHash("sha256").update(PNG_BYTES).digest("hex"));
    assert.equal(result.warn, RECOVERY_WARN);
    assert.equal(result.downloadGuid, "");
    assert.equal(result.downloadFilename, path.basename(diskPath));
    assert.equal(result.suggestedFilename, undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("non-throwing follow-up rethrows download timeout verbatim when no governed PNG exists", async () => {
  const dir = tempDir();
  try {
    const bcdp = new FakeCDP();
    const open = new FakeElement({ x: 0, y: 10, width: 20, height: 10 }, "open");
    const save = new FakeElement({ x: 30, y: 10, width: 20, height: 10 }, "save");
    const page = new FakePage([new FakeFrame({ "button.open": [open], "button.save": [save] })], new CoordinatePageCDP([open, save]));
    await assert.rejects(
      () => artifactClickOnPage(fakeBrowser(bcdp), page, { profile: "p", buttonSelector: "button.open", followUpSelector: "button.save", downloadDir: dir, filenamePattern: "\\.(png|jpg|jpeg|webp)$", timeoutMs: 1000, locateTimeoutMs: 5 }),
      (error: any) => {
        assert.ok(error instanceof ArtifactClickError);
        assert.equal(error.errorCode, "ARTIFACT_DOWNLOAD_TIMEOUT");
        assert.equal(error.message, "No Browser.downloadWillBegin event was observed");
        assert.deepEqual(error.evidence, { timeoutMs: 1000, bufferedBytes: 0, "bodies.size": 0, responseReceivedSeen: 0, imageGatePassed: 0, streamArmAttempts: 0, eagerRawBodyEntries: 0 });
        assert.deepEqual(fs.readdirSync(dir), []);
        return true;
      }
    );
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
