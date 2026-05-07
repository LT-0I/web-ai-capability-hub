const test = require("node:test");
const assert = require("node:assert/strict");
import { PageRegistry } from "../src/browser/pageRegistry";
import { BrowserSessionManager } from "../src/browser/sessionManager";

test("page registry public listings do not expose raw browser page objects", async () => {
  const registry = new PageRegistry();
  const fakePage = { url: () => "https://example.test", title: async () => "Example" };

  registry.register(fakePage);
  const pages = await registry.refresh();

  assert.equal(pages.length, 1);
  assert.equal(pages[0].url, "https://example.test");
  assert.equal(pages[0].title, "Example");
  assert.equal("page" in pages[0], false);
  assert.equal(registry.getActive(), fakePage);
});

test("CDP browser session close closes the Playwright connection without closing contexts directly", async () => {
  const session = new BrowserSessionManager({ cdpEndpoint: "http://127.0.0.1:9223" }) as any;
  const calls: string[] = [];
  session.started = true;
  session.context = { close: async () => calls.push("context.close") };
  session.browser = {
    disconnect: () => calls.push("browser.disconnect"),
    close: async () => calls.push("browser.close")
  };

  await session.close();

  assert.deepEqual(calls, ["browser.close"]);
  assert.equal(session.isStarted(), false);
});
