import test from "node:test";
import assert from "node:assert/strict";

import { ConsumerErrorCodes } from "../../src/consumer/errorCodes";
import { createExtensionAssistedCdpBackend } from "../../src/browser/backends/extensionAssistedCdpBackend";
import { registerBackend } from "../../src/browser/backends";
import {
  callMcpTool,
  webAiChatgptConversationManage,
  webAiChatgptWorkspace,
  webAiClaudeConversationManage,
  webAiClaudeWorkspace,
  webAiGeminiConversationManage,
  webAiGeminiWorkspace
} from "../../src/mcp/tools";

type Service = "chatgpt" | "claude" | "gemini";

function serviceFromUrl(url: string): Service {
  if (url.includes("claude")) return "claude";
  if (url.includes("gemini") || url.includes("notebooklm")) return "gemini";
  return "chatgpt";
}

function fakeExtensionPage(service: Service, initialUrl: string, calls: string[]) {
  let url = initialUrl;
  return {
    navigate: async (nextUrl: string) => {
      url = nextUrl;
      calls.push(`${service}:navigate:${nextUrl}`);
      return { url };
    },
    textSnapshot: async () => ({ url, title: service, text: `${service} workspace/conversation ready` }),
    evaluateReadOnly: async (_expression: string, arg?: any) => {
      calls.push(`${service}:evaluate:${Array.isArray(arg?.selectors) ? arg.selectors.join("|") : ""}`);
      return [{ text: `${service} item`, href: `${url}#item`, role: "link" }];
    },
    waitForSelector: async (selector: string) => {
      calls.push(`${service}:wait:${selector}`);
      return undefined;
    },
    queryElements: async () => [],
    click: async (target: any) => {
      calls.push(`${service}:click:${typeof target === "string" ? target : target?.selector || "unknown"}`);
    },
    assetsList: async () => [],
    assetsBundle: async () => ({ assets: [], capturedAt: "2026-05-25T00:00:00.000Z" }),
    finalize: async () => undefined
  } as any;
}

test("phase7 bucket4 backend=extension-assisted-cdp routes all workspace + conversation_manage tools to the extension backend", async (t) => {
  const calls: string[] = [];
  registerBackend("extension-assisted-cdp", () => ({
    kind: "extension-assisted-cdp",
    ping: async () => ({ ok: true, kind: "extension-assisted-cdp", connected: true }),
    listTabs: async () => [],
    claimTab: async (options: any) => {
      const service = serviceFromUrl(String(options?.url || ""));
      calls.push(`claim:${service}`);
      return fakeExtensionPage(service, String(options?.url || ""), calls);
    },
    newTab: async (options: any) => {
      const service = serviceFromUrl(String(options?.url || ""));
      calls.push(`new:${service}`);
      return fakeExtensionPage(service, String(options?.url || ""), calls);
    },
    finalize: async () => undefined
  }) as any);
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));

  const runtime: any = { launcher: { launch: async () => { throw new Error("managed path must not run"); } } };
  const chatgptWorkspace: any = await callMcpTool("webai_chatgpt_workspace", { profile: "p7-chatgpt-workspace-ext", surface: "projects", backend: "extension-assisted-cdp" }, runtime);
  const chatgptConversation: any = await callMcpTool("webai_chatgpt_conversation_manage", { profile: "p7-chatgpt-conv-ext", action: "list", backend: "extension-assisted-cdp" }, runtime);
  const claudeWorkspace: any = await callMcpTool("webai_claude_workspace", { profile: "p7-claude-workspace-ext", surface: "projects", backend: "extension-assisted-cdp" }, runtime);
  const claudeConversation: any = await callMcpTool("webai_claude_conversation_manage", { profile: "p7-claude-conv-ext", action: "list", backend: "extension-assisted-cdp" }, runtime);
  const geminiWorkspace: any = await callMcpTool("webai_gemini_workspace", { profile: "p7-gemini-workspace-ext", surface: "gems", backend: "extension-assisted-cdp" }, runtime);
  const geminiConversation: any = await callMcpTool("webai_gemini_conversation_manage", { profile: "p7-gemini-conv-ext", action: "list", backend: "extension-assisted-cdp" }, runtime);

  assert.equal(chatgptWorkspace.errorCode, null);
  assert.match(chatgptWorkspace.summary, /1 visible workspace item/);
  assert.equal(chatgptConversation.errorCode, null);
  assert.equal(chatgptConversation.results_count, 1);
  assert.equal(claudeWorkspace.errorCode, null);
  assert.match(claudeWorkspace.summary, /1 visible workspace item/);
  assert.equal(claudeConversation.errorCode, null);
  assert.equal(claudeConversation.results_count, 1);
  assert.equal(geminiWorkspace.errorCode, null);
  assert.match(geminiWorkspace.summary, /1 visible workspace item/);
  assert.equal(geminiConversation.errorCode, null);
  assert.equal(geminiConversation.results_count, 1);
  assert.deepEqual(calls.filter((entry) => entry.startsWith("new:")).sort(), ["new:chatgpt", "new:chatgpt", "new:claude", "new:claude", "new:gemini", "new:gemini"]);
});

test("phase7 bucket4 backend=managed-cdp still routes all workspace + conversation_manage tools to managed-cdp", async (t) => {
  let extensionFactoryCalls = 0;
  registerBackend("extension-assisted-cdp", () => {
    extensionFactoryCalls += 1;
    throw new Error("extension backend must not be touched");
  });
  t.after(() => registerBackend("extension-assisted-cdp", createExtensionAssistedCdpBackend));
  const runtime: any = { launcher: { launch: async () => { throw new Error("managed path touched"); } } };

  await assert.rejects(() => webAiChatgptWorkspace({ profile: "p7-chatgpt-workspace-managed", surface: "projects", backend: "managed-cdp" }, runtime), /managed path touched/);
  await assert.rejects(() => webAiChatgptConversationManage({ profile: "p7-chatgpt-conv-managed", action: "search", backend: "managed-cdp" }, runtime), /managed path touched/);
  await assert.rejects(() => webAiClaudeWorkspace({ profile: "p7-claude-workspace-managed", surface: "projects", backend: "managed-cdp" }, runtime), /managed path touched/);
  await assert.rejects(() => webAiClaudeConversationManage({ profile: "p7-claude-conv-managed", action: "search", backend: "managed-cdp" }, runtime), /managed path touched/);
  await assert.rejects(() => webAiGeminiWorkspace({ profile: "p7-gemini-workspace-managed", surface: "gems", backend: "managed-cdp" }, runtime), /managed path touched/);
  await assert.rejects(() => webAiGeminiConversationManage({ profile: "p7-gemini-conv-managed", action: "search", backend: "managed-cdp" }, runtime), /managed path touched/);
  assert.equal(extensionFactoryCalls, 0);
});

test("phase7 bucket4 invalid backend returns INVALID_ARGS for all workspace + conversation_manage tools", async () => {
  const cases: Array<[string, () => Promise<any>]> = [
    ["webai_chatgpt_workspace", () => webAiChatgptWorkspace({ profile: "p7-chatgpt-workspace-invalid", surface: "projects", backend: "bogus" })],
    ["webai_chatgpt_conversation_manage", () => webAiChatgptConversationManage({ profile: "p7-chatgpt-conv-invalid", action: "list", backend: "bogus" })],
    ["webai_claude_workspace", () => webAiClaudeWorkspace({ profile: "p7-claude-workspace-invalid", surface: "projects", backend: "bogus" })],
    ["webai_claude_conversation_manage", () => webAiClaudeConversationManage({ profile: "p7-claude-conv-invalid", action: "list", backend: "bogus" })],
    ["webai_gemini_workspace", () => webAiGeminiWorkspace({ profile: "p7-gemini-workspace-invalid", surface: "gems", backend: "bogus" })],
    ["webai_gemini_conversation_manage", () => webAiGeminiConversationManage({ profile: "p7-gemini-conv-invalid", action: "list", backend: "bogus" })]
  ];
  for (const [tool, run] of cases) {
    const result: any = await run();
    assert.equal(result.errorCode, ConsumerErrorCodes.INVALID_ARGS, tool);
    assert.match(String(result.message), new RegExp(`${tool} backend must be "managed-cdp" or "extension-assisted-cdp", got bogus`));
  }
});
