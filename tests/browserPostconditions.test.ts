const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
import { waitForPostcondition, PostconditionTimeoutError } from "../src/browser/postconditions";

class DynamicLocator {
  visible = false; enabled = false; text = ""; boxes: any[] = [];
  async isVisible(): Promise<boolean> { return this.visible; }
  async isEnabled(): Promise<boolean> { return this.enabled; }
  async getAttribute(name: string): Promise<string | null> { return name === "disabled" && !this.enabled ? "" : null; }
  async textContent(): Promise<string> { return this.text; }
  async boundingBox(): Promise<any> { return this.boxes.length > 1 ? this.boxes.shift() : this.boxes[0]; }
}
class FakeBrowserSession extends EventEmitter { async send(): Promise<void> {} }
class FakePage { constructor(public loc: DynamicLocator, public browserSession?: any) {} locator(): DynamicLocator { return this.loc; } context(): any { return { browser: () => ({ newBrowserCDPSession: async () => this.browserSession }) }; } }

test("until=visible polls and resolves", async () => {
  const loc = new DynamicLocator();
  setTimeout(() => { loc.visible = true; }, 30);
  const result = await waitForPostcondition(new FakePage(loc), { until: "visible", selector: "#ready", timeoutMs: 500 });
  assert.equal(result.observedState, "visible");
});

test("until=enabled polls disabled to enabled transition", async () => {
  const loc = new DynamicLocator();
  setTimeout(() => { loc.enabled = true; }, 30);
  const result = await waitForPostcondition(new FakePage(loc), { until: "enabled", selector: "#ready", timeoutMs: 500 });
  assert.equal(result.observedState, "enabled");
});

test("until=stable resolves when bbox stops changing", async () => {
  const loc = new DynamicLocator();
  loc.boxes = [{ x: 0, y: 0, width: 1, height: 1 }, { x: 1, y: 0, width: 1, height: 1 }, { x: 1, y: 0, width: 1, height: 1 }];
  const result = await waitForPostcondition(new FakePage(loc), { until: "stable", selector: "#ready", stableMs: 20, timeoutMs: 800 });
  assert.equal(result.observedState, "stable");
});

test("until=download resolves on Browser.downloadWillBegin", async () => {
  const loc = new DynamicLocator();
  const session = new FakeBrowserSession();
  setTimeout(() => session.emit("Browser.downloadWillBegin", { guid: "g", suggestedFilename: "x.txt" }), 30);
  const result = await waitForPostcondition(new FakePage(loc, session), { until: "download", timeoutMs: 500 });
  assert.equal(result.guid, "g");
});

test("until=contentRegex matches delayed text update", async () => {
  const loc = new DynamicLocator();
  setTimeout(() => { loc.text = "done: 42"; }, 30);
  const result = await waitForPostcondition(new FakePage(loc), { until: "contentRegex", selector: "#out", contentRegex: "done: \\d+", timeoutMs: 500 });
  assert.equal(result.observedState, "matched");
});

test("postcondition timeout throws POSTCONDITION_TIMEOUT", async () => {
  const loc = new DynamicLocator();
  await assert.rejects(() => waitForPostcondition(new FakePage(loc), { until: "visible", selector: "#never", timeoutMs: 30 }), (error: any) => error instanceof PostconditionTimeoutError && error.errorCode === "POSTCONDITION_TIMEOUT");
});
