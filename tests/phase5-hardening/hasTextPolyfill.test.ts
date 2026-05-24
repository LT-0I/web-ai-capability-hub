import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ExtensionAssistedPagePort } from "../../src/browser/backends/extensionAssistedCdpBackend";
import { BridgeClient } from "../../src/runtime/extension/bridgeClient";
import { VENDOR_BROWSER_TOOL_NAMES } from "../../src/runtime/extension/protocol";

// -----------------------------------------------------------------------------
// 1. Static contract: the injected script template MUST embed the :has-text polyfill.
//    This protects against future edits that quietly drop it (the polyfill is
//    what lets Playwright-style selectors work through CDP querySelector).
// -----------------------------------------------------------------------------

test('phase5 :has-text polyfill is embedded in injected JS templates', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src", "browser", "backends", "extensionAssistedCdpBackend.ts"),
    "utf8"
  );
  // Helper block must define both __parseSelector and __qsa, and waitForSelector/queryElements
  // must call __qs / __qsa instead of raw document.querySelector / document.querySelectorAll.
  assert.match(src, /__parseSelector/);
  assert.match(src, /__qsa\s*=/);
  assert.match(src, /:has-text/);
  // waitForSelectorScript should route through __qs (the polyfilled accessor).
  const waitBlock = src.slice(src.indexOf("function waitForSelectorScript"), src.indexOf("function queryElementsScript"));
  assert.match(waitBlock, /__qs\(selector\)/);
  assert.doesNotMatch(waitBlock, /document\.querySelector\(selector\)/);
  // queryElementsScript should route through __qsa.
  const qBlock = src.slice(src.indexOf("function queryElementsScript"), src.indexOf("function assetsListScript"));
  assert.match(qBlock, /__qsa\(selector\)/);
  assert.doesNotMatch(qBlock, /document\.querySelectorAll\(selector\)/);
});

// -----------------------------------------------------------------------------
// 2. Behavioral contract: the polyfill logic itself (reimplemented in pure TS,
//    matching the JS in the template character-for-character semantics).
//    This locks the parse + filter logic so regressions surface without needing
//    a real DOM or live Chrome.
// -----------------------------------------------------------------------------

type FakeEl = { innerText: string; id: string; getAttribute: (k: string) => string | null };

function fakeEl(role: string, id: string, innerText: string): FakeEl {
  return {
    innerText,
    id,
    getAttribute: (k) => (k === "role" ? role : k === "id" ? id : null)
  };
}

function parseSelector(raw: string): { base: string; text: string | null } {
  const m = raw.match(/^(.*?):has-text\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)]*))\s*\)\s*$/);
  if (!m) return { base: raw, text: null };
  const base = (m[1] || "").trim() || "*";
  const text =
    m[2] !== undefined
      ? m[2]
      : m[3] !== undefined
        ? m[3]
        : (m[4] || "").trim().replace(/^["']|["']$/g, "");
  return { base, text };
}

function fakeQsa(raw: string, all: FakeEl[]): FakeEl[] {
  const { base, text } = parseSelector(raw);
  // Tiny CSS shim: accepts [role="X"] or pure tag selectors used in the tests.
  const roleMatch = base.match(/^\[role="?([^"\]]+)"?\]/);
  const filteredBase = roleMatch ? all.filter((e) => e.getAttribute("role") === roleMatch[1]) : all;
  if (text === null) return filteredBase;
  const needle = text.toLowerCase();
  return filteredBase.filter((el) => (el.innerText || "").toLowerCase().includes(needle));
}

test('phase5 parseSelector splits :has-text("...") into base + text', () => {
  assert.deepEqual(parseSelector('[role="menuitemradio"]:has-text("Create image")'), {
    base: '[role="menuitemradio"]',
    text: "Create image"
  });
  assert.deepEqual(parseSelector("[role=menuitemradio]:has-text('Deep research')"), {
    base: "[role=menuitemradio]",
    text: "Deep research"
  });
  assert.deepEqual(parseSelector("[role=menuitemradio]:has-text(Bare)"), {
    base: "[role=menuitemradio]",
    text: "Bare"
  });
});

test('phase5 parseSelector leaves vanilla CSS selectors untouched', () => {
  assert.deepEqual(parseSelector("#composer-plus-btn"), { base: "#composer-plus-btn", text: null });
  assert.deepEqual(parseSelector('button[data-testid="send-button"]'), {
    base: 'button[data-testid="send-button"]',
    text: null
  });
});

test('phase5 fakeQsa with :has-text filters by visible text', () => {
  const items = [
    fakeEl("menuitemradio", "r1", "Create image"),
    fakeEl("menuitemradio", "r2", "Deep research"),
    fakeEl("menuitemradio", "r3", "Web search")
  ];
  const matches = fakeQsa('[role="menuitemradio"]:has-text("Create image")', items);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "r1");
});

test('phase5 fakeQsa with vanilla CSS returns all matches', () => {
  const items = [
    fakeEl("menuitemradio", "r1", "A"),
    fakeEl("menuitemradio", "r2", "B")
  ];
  const matches = fakeQsa('[role="menuitemradio"]', items);
  assert.equal(matches.length, 2);
});

// -----------------------------------------------------------------------------
// 3. End-to-end contract: click() / fill() must transparently resolve :has-text
//    selectors to cssPath before sending to the vendor (which does NOT understand
//    :has-text). Verified via a fake bridge that records calls.
// -----------------------------------------------------------------------------

interface RecordedCall {
  tool: string;
  args: any;
}

function makeBridge(responder: (tool: string, args: any) => any): BridgeClient & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  return {
    calls,
    async request(tool: string, args: any) {
      calls.push({ tool, args });
      const out = responder(tool, args);
      return { content: [{ type: "text", text: JSON.stringify(out) }], isError: false };
    },
    async dispose() {}
  } as any;
}

test('phase5 click({selector:":has-text(...)"}) resolves to cssPath via queryElements before vendor click', async () => {
  const bridge = makeBridge((tool, _args) => {
    if (tool === VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT) {
      // Simulate the polyfilled queryElements result: one element with serialized cssPath.
      return [
        { index: 0, tagName: "div", text: "Create image", selector: "#r1", attributes: { id: "r1", role: "menuitemradio" } }
      ];
    }
    return { success: true };
  });

  const port = new ExtensionAssistedPagePort(bridge as any, 42);
  await port.click({ selector: '[role="menuitemradio"]:has-text("Create image")' } as any);

  const clickCall = bridge.calls.find((c) => c.tool === VENDOR_BROWSER_TOOL_NAMES.CLICK);
  assert.ok(clickCall, "expected a vendor CLICK call");
  assert.equal(clickCall.args.selector, "#r1", "click must use resolved cssPath, not the :has-text selector");
});

test('phase5 click({selector:"#vanilla"}) sends selector through unchanged with no extra query', async () => {
  let jsCalls = 0;
  let clickSelector: string | undefined;
  const bridge = makeBridge((tool, args) => {
    if (tool === VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT) {
      jsCalls += 1;
      return [];
    }
    if (tool === VENDOR_BROWSER_TOOL_NAMES.CLICK) {
      clickSelector = args.selector;
      return { success: true };
    }
    return { success: true };
  });
  const port = new ExtensionAssistedPagePort(bridge as any, 1);
  await port.click({ selector: "#composer-plus-btn" } as any);
  assert.equal(jsCalls, 0, "vanilla CSS selectors should NOT trigger an extra JS query");
  assert.equal(clickSelector, "#composer-plus-btn");
});

test('phase5 fill({selector:":has-text(...)"}) also routes through cssPath resolution', async () => {
  const bridge = makeBridge((tool, _args) => {
    if (tool === VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT) {
      return [
        { index: 0, tagName: "textarea", text: "ph", selector: "#prompt-textarea", attributes: { id: "prompt-textarea" } }
      ];
    }
    return { success: true };
  });
  const port = new ExtensionAssistedPagePort(bridge as any, 7);
  await port.fill({ selector: 'textarea:has-text("ph")' } as any, "hello");
  const fillCall = bridge.calls.find((c) => c.tool === VENDOR_BROWSER_TOOL_NAMES.FILL);
  assert.ok(fillCall);
  assert.equal(fillCall.args.selector, "#prompt-textarea");
  assert.equal(fillCall.args.value, "hello");
});
