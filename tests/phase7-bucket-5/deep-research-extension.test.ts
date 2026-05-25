import test from "node:test";
import assert from "node:assert/strict";

import { ConsumerErrorCodes } from "../../src/consumer/errorCodes";
import { createExtensionAssistedCdpBackend } from "../../src/browser/backends/extensionAssistedCdpBackend";
import { registerBackend } from "../../src/browser/backends";
import { webAiChatgptDeepResearch, webAiClaudeDeepResearch, webAiGeminiDeepResearch } from "../../src/mcp/tools";

type Service = "chatgpt" | "claude" | "gemini";

function serviceFromUrl(url: string): Service {
  if (url.includes("claude")) return "claude";
  if (url.includes("gemini")) return "gemini";
  return "chatgpt";
}

function selectorOf(target: any): string {
  return typeof target === "string" ? target : target?.selector || "unknown";
}

function conversationUrl(service: Service): string {
  if (service === "chatgpt") return "https://chatgpt.com/c/phase7b5";
  if (service === "claude") return "https://claude.ai/chat/phase7b5";
  return "https://gemini.google.com/app/phase7b5";
}

function fakeExtensionPage(service: Service, calls: string[]) {
  let url = service === "chatgpt"
    ? "https://chatgpt.com/?phase7b5=1"
    : service === "claude"
      ? "https://claude.ai/new?phase7b5=1"
      : "https://gemini.google.com/app?phase7b5=1";
  let promptText = "";
  let sent = false;
  let assistantCount = 0;
  return {
    navigate: async (nextUrl?: string) => {
      if (nextUrl) url = nextUrl;
      calls.push(`${service}:navigate:${url}`);
      return { url };
    },
    textSnapshot: async () => ({
      url,
      title: service,
      text: sent ? `${service} deep research submitted` : `${service} deep research ready ${promptText}`
    }),
    waitForSelector: async (selector: string) => {
      if (selector.includes("Not now")) throw new Error("optional dialog absent");
      calls.push(`${service}:wait:${selector}`);
      return undefined;
    },
    queryElements: async () => [],
    fill: async (target: any, value: string) => {
      calls.push(`${service}:fill:${selectorOf(target)}:${value.slice(0, 16)}`);
      promptText = value;
    },
    click: async (target: any) => {
      const selector = selectorOf(target);
      calls.push(`${service}:click:${selector}`);
      if (/send-button|Send message|Send/i.test(selector)) {
        sent = true;
        promptText = "";
        assistantCount += 1;
        url = conversationUrl(service);
      }
    },
    evaluateReadOnly: async (_expression: string, arg: any) => ({
      url,
      promptPresent: Boolean(promptText && String(arg?.prompt || "").includes(promptText)),
      stopVisible: false,
      assistantCount
    }),
    assetsList: async () => [],
    assetsBundle: async () => ({ assets: [], capturedAt: "2026-05-25T00:00:00.000Z" }),
    finalize: async () => undefined
  } as any;
}

test("phase7 bucket5 backend=extension-assisted-cdp routes ChatGPT, Claude, and Gemini deep_research to the extension backend", async (t) => {
  const calls: string[] = [];
  registerBackend("extension-assisted-cdp", () => ({
    kind: "extension-assisted-cdp",
    ping: async () => ({ ok: true, kind: "extension-assisted-cdp", connected: true }),
    listTabs: async () => [],
    claimTab: async (options: any) => {
      const service = serviceFromUrl(String(options?.url || ""));
      calls.push(`claim:${service}`);
      return fakeExtensionPage(service, calls);
    },
    newTab: async (options: any) => {
      const service = serviceFromUrl(String(options?.url || ""));
      calls.push(`new:${service}`);
      return fakeExtensionPage(service, calls);
    },
    finalize: async () => undefined
  }) as any);
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));

  const runtime: any = { launcher: { launch: async () => { throw new Error("managed path must not run"); } } };
  const chatgpt: any = await webAiChatgptDeepResearch({ profile: "p7-chatgpt-dr-ext", prompt: "short research", backend: "extension-assisted-cdp", response_timeout_ms: 2500 }, runtime);
  const claude: any = await webAiClaudeDeepResearch({ profile: "p7-claude-dr-ext", prompt: "short research", backend: "extension-assisted-cdp", response_timeout_ms: 2500 }, runtime);
  const gemini: any = await webAiGeminiDeepResearch({ profile: "p7-gemini-dr-ext", prompt: "short research", confirmed: true, backend: "extension-assisted-cdp", response_timeout_ms: 2500 }, runtime);

  assert.equal(chatgpt.errorCode, null);
  assert.equal(typeof chatgpt.task_id, "string");
  assert.match(chatgpt.chat_url, /chatgpt\.com\/c\/phase7b5/);
  assert.equal(claude.errorCode, null);
  assert.equal(typeof claude.task_id, "string");
  assert.match(claude.chat_url, /claude\.ai\/chat\/phase7b5/);
  assert.equal(gemini.errorCode, null);
  assert.equal(typeof gemini.task_id, "string");
  assert.match(gemini.chat_url, /gemini\.google\.com\/app\/phase7b5/);
  assert.deepEqual(calls.filter((entry) => entry.startsWith("new:")).sort(), ["new:chatgpt", "new:claude", "new:gemini"]);
  assert.equal(calls.some((entry) => entry.includes("Deep research")), true);
  assert.equal(calls.some((entry) => entry.includes("Research")), true);
});

test("phase7 bucket5 backend=managed-cdp still routes ChatGPT, Claude, and Gemini deep_research to managed-cdp", async (t) => {
  let extensionFactoryCalls = 0;
  registerBackend("extension-assisted-cdp", () => {
    extensionFactoryCalls += 1;
    throw new Error("extension backend must not be touched");
  });
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));
  const runtime: any = { launcher: { launch: async () => { throw new Error("managed path touched"); } } };

  await assert.rejects(
    () => webAiChatgptDeepResearch({ profile: "p7-chatgpt-dr-managed", prompt: "short research", backend: "managed-cdp" }, runtime),
    /managed path touched/
  );
  await assert.rejects(
    () => webAiClaudeDeepResearch({ profile: "p7-claude-dr-managed", prompt: "short research", backend: "managed-cdp" }, runtime),
    /managed path touched/
  );
  await assert.rejects(
    () => webAiGeminiDeepResearch({ profile: "p7-gemini-dr-managed", prompt: "short research", confirmed: true, backend: "managed-cdp" }, runtime),
    /managed path touched/
  );
  assert.equal(extensionFactoryCalls, 0);
});

test("phase7 bucket5 invalid backend returns INVALID_ARGS for all deep_research tools", async () => {
  const chatgpt: any = await webAiChatgptDeepResearch({ profile: "p7-chatgpt-dr-invalid", prompt: "short research", backend: "bogus" }, {} as any);
  const claude: any = await webAiClaudeDeepResearch({ profile: "p7-claude-dr-invalid", prompt: "short research", backend: "bogus" }, {} as any);
  const gemini: any = await webAiGeminiDeepResearch({ profile: "p7-gemini-dr-invalid", prompt: "short research", backend: "bogus" }, {} as any);

  assert.equal(chatgpt.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(chatgpt.message), /webai_chatgpt_deep_research backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
  assert.equal(claude.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(claude.message), /webai_claude_deep_research backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
  assert.equal(gemini.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(gemini.message), /webai_gemini_deep_research backend must be "managed-cdp" or "extension-assisted-cdp", got bogus/);
});
