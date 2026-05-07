const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
import { ActionExecutor } from "../src/actions/executor";
import { ConfirmationRequiredError } from "../src/actions/confirmationPolicy";
import { FakePage } from "./helpers";

test("action executor performs open, type, click, select, and press on a fake page", async () => {
  const page = new FakePage();
  const executor = new ActionExecutor({ getActivePage: () => page, openUrl: async (url) => { await page.goto(url); return page; } }, { mode: "never" });
  await executor.execute({ type: "open", url: "https://example.test" });
  await executor.execute({ type: "type", selector: "#q", text: "machine learning" });
  await executor.execute({ type: "click", selector: "#search" });
  await executor.execute({ type: "select", selector: "select[name=sort]", option: "date" });
  await executor.execute({ type: "press", selector: "#q", key: "Enter" });
  assert.deepEqual(page.events, [
    "goto:https://example.test",
    "fill:#q:machine learning",
    "click:#search",
    "select:select[name=sort]:date",
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
