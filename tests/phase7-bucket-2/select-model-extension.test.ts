import test from "node:test";
import assert from "node:assert/strict";

import { ConsumerErrorCodes } from "../../src/consumer/errorCodes";
import { createExtensionAssistedCdpBackend } from "../../src/browser/backends/extensionAssistedCdpBackend";
import { registerBackend } from "../../src/browser/backends";
import { webAiChatgptSelectModel, webAiClaudeSelectModel, webAiGeminiSelectModel } from "../../src/mcp/tools";

type Service = "chatgpt" | "claude" | "gemini";

function serviceFromUrl(url: string): Service {
  if (url.includes("claude")) return "claude";
  if (url.includes("gemini")) return "gemini";
  return "chatgpt";
}

function fakeExtensionPage(service: Service, clicks: string[]) {
  const url = service === "chatgpt"
    ? "https://chatgpt.com/?phase7b2=1"
    : service === "claude"
      ? "https://claude.ai/new?phase7b2=1"
      : "https://gemini.google.com/app?phase7b2=1";
  return {
    navigate: async () => ({ url }),
    textSnapshot: async () => ({ url, title: service, text: `${service} ready` }),
    waitForSelector: async (selector: string) => {
      if (selector.includes("Not now")) throw new Error("optional dialog absent");
      return undefined;
    },
    queryElements: async () => [],
    click: async (target: any) => {
      clicks.push(`${service}:${typeof target === "string" ? target : target?.selector || "unknown"}`);
    },
    evaluateReadOnly: async () => false,
    finalize: async () => undefined
  } as any;
}

test("phase7 bucket2 select_model backend=extension-assisted-cdp routes ChatGPT, Claude, and Gemini to the extension backend", async (t) => {
  const calls: string[] = [];
  const clicks: string[] = [];
  registerBackend("extension-assisted-cdp", () => ({
    kind: "extension-assisted-cdp",
    ping: async () => ({ ok: true, kind: "extension-assisted-cdp", connected: true }),
    listTabs: async () => [],
    claimTab: async (options: any) => {
      const service = serviceFromUrl(String(options?.url || ""));
      calls.push(`claim:${service}`);
      return fakeExtensionPage(service, clicks);
    },
    newTab: async (options: any) => {
      const service = serviceFromUrl(String(options?.url || ""));
      calls.push(`new:${service}`);
      return fakeExtensionPage(service, clicks);
    },
    finalize: async () => undefined
  }) as any);
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));

  const runtime: any = { launcher: { launch: async () => { throw new Error("managed path must not run"); } } };
  const chatgpt: any = await webAiChatgptSelectModel({ profile: "p7-chatgpt-ext", model: "Thinking", backend: "extension-assisted-cdp" }, runtime);
  const claude: any = await webAiClaudeSelectModel({ profile: "p7-claude-ext", model: "Sonnet 4.6", backend: "extension-assisted-cdp" }, runtime);
  const gemini: any = await webAiGeminiSelectModel({ profile: "p7-gemini-ext", model: "Fastest answers", backend: "extension-assisted-cdp" }, runtime);

  assert.equal(chatgpt.errorCode, null);
  assert.equal(chatgpt.selected_model, "Thinking");
  assert.equal(claude.errorCode, null);
  assert.equal(claude.selected_model, "Sonnet 4.6");
  assert.equal(gemini.errorCode, null);
  assert.equal(gemini.selected_model, "Fastest answers");
  assert.deepEqual(calls.sort(), ["new:chatgpt", "new:claude", "new:gemini"]);
  assert.equal(clicks.some((entry) => entry.startsWith("chatgpt:")), true);
  assert.equal(clicks.some((entry) => entry.startsWith("claude:")), true);
  assert.equal(clicks.some((entry) => entry.startsWith("gemini:")), true);
});

test("phase7 bucket2 select_model backend=managed-cdp still routes ChatGPT, Claude, and Gemini to managed-cdp", async (t) => {
  let extensionFactoryCalls = 0;
  registerBackend("extension-assisted-cdp", () => {
    extensionFactoryCalls += 1;
    throw new Error("extension backend must not be touched");
  });
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));
  const runtime: any = { launcher: { launch: async () => { throw new Error("managed path touched"); } } };

  await assert.rejects(
    () => webAiChatgptSelectModel({ profile: "p7-chatgpt-managed", model: "Thinking", backend: "managed-cdp" }, runtime),
    /managed path touched/
  );
  await assert.rejects(
    () => webAiClaudeSelectModel({ profile: "p7-claude-managed", model: "Sonnet 4.6", backend: "managed-cdp" }, runtime),
    /managed path touched/
  );
  await assert.rejects(
    () => webAiGeminiSelectModel({ profile: "p7-gemini-managed", model: "3.1-flash-lite", backend: "managed-cdp" }, runtime),
    /managed path touched/
  );
  assert.equal(extensionFactoryCalls, 0);
});

test("phase7 bucket2 select_model invalid backend returns INVALID_ARGS with backend message", async () => {
  const chatgpt: any = await webAiChatgptSelectModel({ profile: "p7-chatgpt-invalid", model: "Thinking", backend: "bogus" }, {} as any);
  const claude: any = await webAiClaudeSelectModel({ profile: "p7-claude-invalid", model: "Sonnet 4.6", backend: "bogus" }, {} as any);
  const gemini: any = await webAiGeminiSelectModel({ profile: "p7-gemini-invalid", model: "3.1-flash-lite", backend: "bogus" }, {} as any);

  assert.equal(chatgpt.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(chatgpt.message), /webai_chatgpt_select_model: backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
  assert.equal(claude.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(claude.message), /webai_claude_select_model: backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
  assert.equal(gemini.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(gemini.message), /webai_gemini_select_model: backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
});
