const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
import { ActionExecutor } from "../src/actions/executor";
import { ConfirmationRequiredError } from "../src/actions/confirmationPolicy";
import { FakePage } from "./helpers";

test("action executor performs open, type, click, select, hover, select-text, and press on a fake page", async () => {
  const page = new FakePage();
  page.textContent["#answer"] = "hello world";
  const executor = new ActionExecutor({ getActivePage: () => page, openUrl: async (url) => { await page.goto(url); return page; } }, { mode: "never" });
  await executor.execute({ type: "open", url: "https://example.test" });
  await executor.execute({ type: "type", selector: "#q", text: "machine learning" });
  await executor.execute({ type: "click", selector: "#search" });
  await executor.execute({ type: "select", selector: "select[name=sort]", option: "date" });
  await executor.execute({ type: "hover", selector: "#toolbar-trigger", timeoutMs: 25 });
  const selectTextResult = await executor.execute({ type: "select-text", selector: "#answer", start: 1, end: 5 });
  await executor.execute({ type: "press", selector: "#q", key: "Enter" });
  assert.deepEqual((selectTextResult as any).data, { selectedText: "ello" });
  assert.deepEqual(page.events, [
    "goto:https://example.test",
    "fill:#q:machine learning",
    "click:#search",
    "select:select[name=sort]:date",
    "hover:#toolbar-trigger",
    "timeout:25",
    "selectText:#answer:1:5",
    "press:#q:Enter"
  ]);
});

test("action executor supports dry run and confirmation gates", async () => {
  const page = new FakePage();
  const executor = new ActionExecutor({ getActivePage: () => page }, { mode: "confirm-risky" });
  const dry = await executor.execute({ type: "click", selector: "#send", dryRun: true });
  assert.equal(dry.dryRun, true);
  await assert.rejects(() => executor.execute({ type: "click", selector: "#send" }), ConfirmationRequiredError);
  await executor.execute({ type: "click", selector: "#send", confirmed: true });
  assert.equal(page.events.at(-1), "click:#send");
});

test("action executor treats hover as low-risk and optionally holds", async () => {
  const page = new FakePage();
  const executor = new ActionExecutor({ getActivePage: () => page }, { mode: "confirm-risky" });

  const result = await executor.execute({ type: "hover", selector: "body", timeoutMs: 10 });

  assert.equal(result.ok, true);
  assert.deepEqual(page.events, ["hover:body", "timeout:10"]);
});

test("action executor performs selector-relative mouse drag sequence", async () => {
  const page = new FakePage();
  (page as any).locator = (selector: string) => ({
    boundingBox: async () => {
      page.events.push(`box:${selector}`);
      return { x: 100, y: 50, width: 300, height: 80 };
    }
  });
  (page as any).mouse = {
    move: async (x: number, y: number, options?: { steps?: number }) => {
      page.events.push(`mouse:move:${x}:${y}:${options?.steps ?? ""}`);
    },
    down: async () => { page.events.push("mouse:down"); },
    up: async () => { page.events.push("mouse:up"); }
  };
  const executor = new ActionExecutor({ getActivePage: () => page }, { mode: "confirm-risky" });

  const result = await executor.execute({
    type: "drag",
    selector: "#answer",
    fromOffset: [10, 15],
    toOffset: [200, 20],
    steps: 4,
    holdMs: 25
  });

  assert.equal(result.ok, true);
  assert.deepEqual((result as any).data, { startX: 110, startY: 65, endX: 300, endY: 70, steps: 4 });
  assert.deepEqual(page.events, [
    "box:#answer",
    "mouse:move:110:65:",
    "mouse:down",
    "timeout:25",
    "mouse:move:300:70:4",
    "mouse:up"
  ]);
});

test("action executor selects text ranges and returns selected text", async () => {
  const page = new FakePage();
  page.textContent["#answer"] = "selectable text";
  const executor = new ActionExecutor({ getActivePage: () => page }, { mode: "confirm-risky" });

  const ranged = await executor.execute({ type: "select-text", selector: "#answer", start: 0, end: 10 });
  const all = await executor.execute({ type: "select-text", selector: "#answer" });

  assert.deepEqual((ranged as any).data, { selectedText: "selectable" });
  assert.deepEqual((all as any).data, { selectedText: "selectable text" });
});

test("action executor captures screenshots and returns a screenshotPath", async () => {
  const page = new FakePage();
  (page as any).screenshot = async (options: { path: string; fullPage: boolean }) => {
    page.events.push(`screenshot:${options.fullPage}`);
    fs.writeFileSync(options.path, "fake-png");
  };
  const executor = new ActionExecutor({ getActivePage: () => page }, { mode: "never" });

  const result = await executor.execute({ type: "screenshot", confirmed: true } as any) as any;

  assert.equal(result.ok, true);
  assert.equal(result.action.type, "screenshot");
  assert.equal(result.message, "Captured screenshot");
  assert.match(result.screenshotPath, /data[\\/]screenshots[\\/].+Fake-Page\.png$/);
  assert.equal(fs.existsSync(result.screenshotPath), true);
  assert.equal(page.events.at(-1), "screenshot:true");
});
