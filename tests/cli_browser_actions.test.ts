const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
import { main } from "../src/cli";
import { ActionExecutor } from "../src/actions/executor";
import { ManagedBrowserLauncher } from "../src/browser/managedLauncher";
import { FakePage } from "./helpers";

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: any[]) => { lines.push(args.join(" ")); };
  try {
    await fn();
  } finally {
    console.log = originalLog;
  }
  return lines.join("\n");
}

test("CLI browser action commands invoke ActionExecutor with expected payloads and JSON output", async (t: any) => {
  const originalLaunch = ManagedBrowserLauncher.prototype.launch;
  const originalConnect = ManagedBrowserLauncher.prototype.connectOverCdp;
  const originalExecute = ActionExecutor.prototype.execute;
  const calls: any[] = [];
  const page = new FakePage("about:blank");

  ManagedBrowserLauncher.prototype.launch = async function(options: any) {
    return {
      profile: options.profile || "default",
      profileDir: "/tmp/wah-test-profile",
      cdpEndpoint: "http://127.0.0.1:9222",
      cdpPort: 9222,
      connected: true,
      launchedByPackage: false
    } as any;
  };
  ManagedBrowserLauncher.prototype.connectOverCdp = async function() {
    return {
      contexts: () => [{ pages: () => [page] }],
      close: async () => undefined
    } as any;
  };
  ActionExecutor.prototype.execute = async function(action: any) {
    calls.push(action);
    return { ok: true, action, message: `executed ${action.type}` } as any;
  };

  t.after(() => {
    ManagedBrowserLauncher.prototype.launch = originalLaunch;
    ManagedBrowserLauncher.prototype.connectOverCdp = originalConnect;
    ActionExecutor.prototype.execute = originalExecute;
  });

  const cases = [
    {
      argv: ["browser:click", "--profile", "claude", "--selector", "body", "--json"],
      expected: { type: "click", selector: "body" }
    },
    {
      argv: ["browser:type", "--profile", "claude", "--selector", "#prompt", "--text", "hello", "--json"],
      expected: { type: "type", selector: "#prompt", text: "hello" }
    },
    {
      argv: ["browser:select", "--profile", "claude", "--selector", "select[name=model]", "--value", "fast", "--json"],
      expected: { type: "select", selector: "select[name=model]", option: "fast" }
    },
    {
      argv: ["browser:upload", "--profile", "claude", "--selector", "input[type=file]", "--file", "package.json", "--file", "tsconfig.json", "--json"],
      expected: { type: "upload", selector: "input[type=file]", files: [path.resolve("package.json"), path.resolve("tsconfig.json")] }
    },
    {
      argv: ["browser:hover", "--profile", "claude", "--selector", "body", "--ms", "50", "--json"],
      expected: { type: "hover", selector: "body", timeoutMs: 50 }
    },
    {
      argv: ["browser:hover", "--profile", "claude", "--selector", "#more", "--dwell-ms", "450", "--settle-selector", "[role=menu]", "--json"],
      expected: { type: "hover", selector: "#more", dwellMs: 450, settleSelector: "[role=menu]" }
    },
    {
      argv: ["browser:select-text", "--profile", "claude", "--selector", "#answer", "--start", "1", "--end", "4", "--json"],
      expected: { type: "select-text", selector: "#answer", start: 1, end: 4 }
    },
    {
      argv: ["browser:drag", "--profile", "claude", "--selector", "#answer", "--from-offset", "10,15", "--to-offset", "200,20", "--steps", "4", "--hold-ms", "25", "--json"],
      expected: { type: "drag", selector: "#answer", fromOffset: [10, 15], toOffset: [200, 20], steps: 4, holdMs: 25 }
    },
    {
      argv: ["browser:drag", "--profile", "claude", "--from", "1,2", "--to", "30,40", "--json"],
      expected: { type: "drag", from: [1, 2], to: [30, 40], steps: 10, holdMs: 0 }
    },
    {
      argv: ["browser:press", "--profile", "claude", "--key", "Enter", "--json"],
      expected: { type: "press", key: "Enter" }
    },
    {
      argv: ["browser:wait", "--profile", "claude", "--selector", "#ready", "--state", "visible", "--ms", "250", "--json"],
      expected: { type: "wait", selector: "#ready", waitFor: "selector", timeoutMs: 250, state: "visible" }
    }
  ];

  for (const item of cases) {
    const stdout = await captureStdout(() => main(item.argv));
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.action, item.expected);
  }

  assert.deepEqual(calls, cases.map((item) => item.expected));
});
