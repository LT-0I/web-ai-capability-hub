import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ConsumerErrorCodes } from "../src/consumer/errorCodes";
import {
  ClaudeConversationManageRpcFetch,
  buildClaudeConversationManageRpcRequests,
  webAiClaudeConversationManageRpcWithFetch
} from "../src/mcp/claude_conversation_manage_rpc";

const ORG_UUID = "9a23efa1-be5a-4da2-8039-74492ab9877e";
const CONVERSATION_UUID = "d0ebcece-d3c8-4bbb-9f57-44b5e961b773";
const CAPTURE_ROOT = path.join(process.cwd(), ".runs/path-c-claude-rpc/wave-a-captures");

function capturedTemplate(variant: string): any {
  return JSON.parse(fs.readFileSync(path.join(CAPTURE_ROOT, `webai_claude_conversation_manage--${variant}`, "payload-template.json"), "utf8"));
}

const CONVERSATIONS = [
  { uuid: "4b0cbf0c-3bfe-4e8c-98e7-662c89c13ffd", name: "Wave A search target" },
  { uuid: "d0ebcece-d3c8-4bbb-9f57-44b5e961b773", name: "Share fixture" }
];

test("Claude conversation_manage RPC decodes captured action_share request body and refuses sharing without confirmation", async () => {
  const sharePromptPath = path.join(CAPTURE_ROOT, "webai_claude_conversation_manage--action_share/requests/request-24.body.txt");
  const sharePrompt = JSON.parse(fs.readFileSync(sharePromptPath, "utf8"));
  assert.equal(typeof sharePrompt.prompt, "string");
  assert.match(sharePrompt.prompt, /RPC_CLAUDE_CONV_SHARE/);
  assert.equal(sharePrompt.attachments?.length ?? 0, 0);

  let calls = 0;
  const result: any = await webAiClaudeConversationManageRpcWithFetch(
    { profile: "claude-9224", action: "share", tab_url_contains: `https://claude.ai/chat/${CONVERSATION_UUID}` },
    async () => { calls += 1; throw new Error("captured share must not fetch when confirmation absent"); },
    { orgId: ORG_UUID }
  );
  assert.equal(calls, 0);
  assert.equal(result.errorCode, ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD);
  assert.equal(result.action, "share");
  assert.equal((result as any).conversationId, null);
});

test("Claude conversation_manage RPC builds list+details requests from captured payload templates", () => {
  const listTemplate = capturedTemplate("action_list");
  assert.equal(listTemplate.method, "GET");
  assert.equal(listTemplate.body_template, null);
  const listReqs = buildClaudeConversationManageRpcRequests({ profile: "claude-9224", action: "list" }, ORG_UUID);
  assert.equal(listReqs.length, 2);
  assert.deepEqual(listReqs.map((r) => r.purpose), ["capture_probe", "conversation_list"]);
  assert.match(listReqs[1].url, /chat_conversations_v2\?limit=30&starred=false&consistency=eventual$/);

  const shareReqs = buildClaudeConversationManageRpcRequests(
    { profile: "claude-9224", action: "share", tab_url_contains: `https://claude.ai/chat/${CONVERSATION_UUID}` },
    ORG_UUID
  );
  assert.equal(shareReqs.length, 1);
  assert.equal(shareReqs[0].purpose, "conversation_details");
  assert.match(shareReqs[0].url, new RegExp(`/chat_conversations/${CONVERSATION_UUID}\\?tree=True&rendering_mode=messages&render_all_tools=true&consistency=eventual$`));
});

test("Claude conversation_manage RPC action_list reads captured probe then conversation list", async () => {
  const template = capturedTemplate("action_list");
  const requests = buildClaudeConversationManageRpcRequests({ profile: "claude-9224", action: "list" }, ORG_UUID);
  assert.equal(requests[0].method, template.method);
  assert.equal(requests[0].url, `/api/organizations/${ORG_UUID}/sync/settings`);
  assert.match(requests[1].url, /\/chat_conversations_v2\?limit=30&starred=false&consistency=eventual$/);

  const purposes: string[] = [];
  const fetchRpc: ClaudeConversationManageRpcFetch = async (request) => {
    purposes.push(request.purpose);
    assert.equal(request.method, "GET");
    assert.equal((request as any).body, undefined);
    if (request.purpose === "capture_probe") return { status: 200, contentType: "application/json", text: "[]", elapsedMs: 2 };
    return { status: 200, contentType: "application/json", text: JSON.stringify(CONVERSATIONS), elapsedMs: 4 };
  };

  const result: any = await webAiClaudeConversationManageRpcWithFetch({ profile: "claude-9224", action: "list" }, fetchRpc, { orgId: ORG_UUID });
  assert.deepEqual(purposes, ["capture_probe", "conversation_list"]);
  assert.equal(result.errorCode, null);
  assert.equal(result.action, "list");
  assert.equal(result.results_count, 2);
  assert.match(result.results[0].href, /https:\/\/claude\.ai\/chat\//);
});

test("Claude conversation_manage RPC action_search filters captured conversation list", async () => {
  const template = capturedTemplate("action_search");
  assert.equal(template.body_template, null);
  const fetchRpc: ClaudeConversationManageRpcFetch = async (request) => {
    if (request.purpose === "capture_probe") return { status: 200, contentType: "application/json", text: "[]", elapsedMs: 2 };
    return { status: 200, contentType: "application/json", text: JSON.stringify(CONVERSATIONS), elapsedMs: 4 };
  };
  const result: any = await webAiClaudeConversationManageRpcWithFetch({ profile: "claude-9224", action: "search", query: "search target" }, fetchRpc, { orgId: ORG_UUID });
  assert.equal(result.errorCode, null);
  assert.equal(result.action, "search");
  assert.equal(result.results_count, 1);
  assert.equal(result.results[0].text, "Wave A search target");
});

test("Claude conversation_manage RPC action_share keeps captured variant safe without public sharing", async () => {
  const template = capturedTemplate("action_share");
  assert.equal(template.method, "POST");
  const capturedPromptBody = fs.readFileSync(path.join(CAPTURE_ROOT, "webai_claude_conversation_manage--action_share", "requests/request-24.body.txt"), "utf8");
  assert.match(capturedPromptBody, /RPC_CLAUDE_CONV_SHARE/);
  let calls = 0;
  const result: any = await webAiClaudeConversationManageRpcWithFetch(
    { profile: "claude-9224", action: "share", tab_url_contains: `https://claude.ai/chat/${CONVERSATION_UUID}` },
    async () => { calls += 1; throw new Error("unconfirmed share must not fetch"); },
    { orgId: ORG_UUID }
  );
  assert.equal(calls, 0);
  assert.equal(result.errorCode, ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD);
  assert.equal(result.action, "share");
});

test("Claude conversation_manage RPC action_sidebar_options returns canonical handoff without DOM fallback", async () => {
  const template = capturedTemplate("action_sidebar_options");
  assert.equal(template.body_template, null);
  let calls = 0;
  const result: any = await webAiClaudeConversationManageRpcWithFetch(
    { profile: "claude-9224", action: "sidebar_options" },
    async () => { calls += 1; throw new Error("sidebar_options must not fetch"); },
    { orgId: ORG_UUID }
  );
  assert.equal(calls, 0);
  assert.equal(result.errorCode, ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED);
  assert.equal(result.reason, "sidebar_kebab_radix_portal_unreliable");
});
