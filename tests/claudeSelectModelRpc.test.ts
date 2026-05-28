import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ClaudeSelectModelRpcFetch,
  buildClaudeSelectModelRpcRequests,
  normalizeClaudeRpcModel,
  webAiClaudeSelectModelRpcWithFetch
} from "../src/mcp/claude_select_model_rpc";

const ORG_UUID = "9a23efa1-be5a-4da2-8039-74492ab9877e";
const CAPTURE_ROOT = path.join(process.cwd(), ".runs/path-c-claude-rpc/wave-a-captures");

type VariantCase = {
  variant: "haiku" | "sonnet" | "adaptive_on";
  args: Record<string, unknown>;
  expectedPurposes: string[];
  capturedBodies: Array<string | null>;
  expectedModel: string | null;
  expectedThinking: string | null;
};

const VARIANTS: VariantCase[] = [
  {
    variant: "haiku",
    args: { model: "Haiku 4.5" },
    expectedPurposes: ["model_config", "set_paprika", "set_default_model"],
    capturedBodies: [null, "requests/request-22.body.txt", "requests/request-23.body.txt"],
    expectedModel: "Haiku 4.5",
    expectedThinking: null
  },
  {
    variant: "sonnet",
    args: { model: "Sonnet 4.6" },
    expectedPurposes: ["capture_probe", "set_paprika", "set_default_model"],
    capturedBodies: [null, "requests/request-21.body.txt", "requests/request-22.body.txt"],
    expectedModel: "Sonnet 4.6",
    expectedThinking: null
  },
  {
    variant: "adaptive_on",
    args: { thinking_level: "extended" },
    expectedPurposes: ["capture_probe", "set_paprika"],
    capturedBodies: [null, "requests/request-23.body.txt"],
    expectedModel: null,
    expectedThinking: "extended"
  }
];

function capturePath(variant: string, rel: string): string {
  return path.join(CAPTURE_ROOT, `webai_claude_select_model--${variant}`, rel);
}

function readCaptureBody(variant: string, rel: string | null): string | undefined {
  if (!rel) return undefined;
  return fs.readFileSync(capturePath(variant, rel), "utf8").trim();
}

for (const variantCase of VARIANTS) {
  test(`Claude select_model RPC ${variantCase.variant} sends captured settings request bodies`, async () => {
    const template = JSON.parse(fs.readFileSync(capturePath(variantCase.variant, "payload-template.json"), "utf8"));
    const requests = buildClaudeSelectModelRpcRequests({ profile: "claude-9224", ...variantCase.args }, ORG_UUID);
    assert.deepEqual(requests.map((request) => request.purpose), variantCase.expectedPurposes);
    assert.equal(requests[0].method, template.method);

    const seenBodies: Array<string | undefined> = [];
    const fetchRpc: ClaudeSelectModelRpcFetch = async (request) => {
      assert.equal(request.profile, "claude-9224");
      seenBodies.push(request.body);
      if (request.purpose === "model_config") {
        assert.match(request.url, /\/model_configs\/claude-haiku-4-5-20251001$/);
        return { status: 200, contentType: "application/json", text: JSON.stringify({ api_model: "claude-haiku-4-5-20251001", image_in: true, pdf_in: true, max_tokens_cap: 64000 }), elapsedMs: 3 };
      }
      if (request.purpose === "capture_probe") {
        assert.equal(request.url, `/api/organizations/${ORG_UUID}/sync/settings`);
        return { status: 200, contentType: "application/json", text: "[]", elapsedMs: 2 };
      }
      assert.equal(request.method, "PATCH");
      assert.equal(request.url, "/api/account/settings");
      return { status: 202, contentType: "application/json", text: "null", elapsedMs: 5 };
    };

    const result: any = await webAiClaudeSelectModelRpcWithFetch(
      { profile: "claude-9224", ...variantCase.args },
      fetchRpc,
      { orgId: ORG_UUID }
    );

    assert.equal(result.errorCode, null);
    assert.equal(result.selected_model, variantCase.expectedModel);
    assert.equal(result.selected_thinking_level, variantCase.expectedThinking);
    assert.equal(result.http_status, 202);
    for (const [index, rel] of variantCase.capturedBodies.entries()) {
      assert.equal(seenBodies[index], readCaptureBody(variantCase.variant, rel));
    }
  });
}

test("Claude select_model RPC decodes captured haiku model_config response to api_model id", async () => {
  const fixturePath = path.join(CAPTURE_ROOT, "webai_claude_select_model--haiku/response-stream.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  assert.equal(fixture.json.api_model, "claude-haiku-4-5-20251001");
  assert.equal(fixture.json.image_in, true);
  assert.equal(fixture.json.pdf_in, true);
  assert.equal(fixture.json.max_tokens_cap, 64000);

  const seenUrls: string[] = [];
  const fetchRpc: ClaudeSelectModelRpcFetch = async (request) => {
    seenUrls.push(`${request.method} ${request.purpose}`);
    if (request.purpose === "model_config") {
      assert.match(request.url, /\/model_configs\/claude-haiku-4-5-20251001$/);
      return { status: 200, contentType: "application/json", text: fixture.text_preview, elapsedMs: 4 };
    }
    return { status: 202, contentType: "application/json", text: "null", elapsedMs: 5 };
  };

  const result: any = await webAiClaudeSelectModelRpcWithFetch(
    { profile: "claude-9224", model: "Haiku 4.5" },
    fetchRpc,
    { orgId: ORG_UUID }
  );
  assert.equal(result.errorCode, null);
  assert.equal(result.selected_model, "Haiku 4.5");
  assert.equal(result.http_status, 202);
  assert.deepEqual(seenUrls, ["GET model_config", "PATCH set_paprika", "PATCH set_default_model"]);
});

test("Claude select_model RPC normalizes captured UI labels to account setting ids", () => {
  assert.equal(normalizeClaudeRpcModel("Haiku 4.5"), "claude-haiku-4-5-20251001");
  assert.equal(normalizeClaudeRpcModel("Sonnet 4.6"), "claude-sonnet-4-6");
});
