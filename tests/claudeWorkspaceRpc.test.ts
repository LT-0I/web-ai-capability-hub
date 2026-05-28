import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ClaudeWorkspaceRpcFetch,
  buildClaudeWorkspaceRpcRequests,
  webAiClaudeWorkspaceRpcWithFetch
} from "../src/mcp/claude_workspace_rpc";

const ORG_UUID = "9a23efa1-be5a-4da2-8039-74492ab9877e";
const CAPTURE_ROOT = path.join(process.cwd(), ".runs/path-c-claude-rpc/wave-a-captures");

type VariantCase = {
  variant: string;
  surface: "projects" | "integrations" | "skills" | "appearance" | "style_presets";
  surfaceJson: unknown;
  expectedSummary: RegExp;
  expectedReadPath?: RegExp;
};

const VARIANTS: VariantCase[] = [
  {
    variant: "surface_projects",
    surface: "projects",
    surfaceJson: { projects: [{ uuid: "p1", name: "Project One" }, { uuid: "p2", name: "Project Two" }] },
    expectedSummary: /2 project\(s\) visible/,
    expectedReadPath: /\/api\/organizations\/[^/]+\/projects_v2\?limit=30&offset=0&filter=is_creator&order_by=latest_activity&searchQuery=&is_archived=false$/
  },
  {
    variant: "surface_integrations",
    surface: "integrations",
    surfaceJson: [
      { type: "gcal", enabled: true, config: null },
      { type: "gdrive", enabled: true, config: { allow_indexing: false, allow_search: false } },
      { type: "github", enabled: true, config: {} },
      { type: "gmail", enabled: true, config: null }
    ],
    expectedSummary: /4 integration setting\(s\) visible/
  },
  {
    variant: "surface_skills",
    surface: "skills",
    surfaceJson: { skills: [{ name: "Analyst" }, { name: "Writer" }, { name: "Debugger" }] },
    expectedSummary: /3 skill\(s\) visible/,
    expectedReadPath: /\/api\/organizations\/[^/]+\/skills\/list-skills$/
  },
  {
    variant: "surface_appearance",
    surface: "appearance",
    surfaceJson: { experiences: [{ key: "theme" }] },
    expectedSummary: /Customize\/appearance surface visible/,
    expectedReadPath: /\/api\/organizations\/[^/]+\/experiences\/claude_web\?locale=en-US$/
  },
  {
    variant: "surface_style_presets",
    surface: "style_presets",
    surfaceJson: { styles: [{ key: "Default" }, { key: "Concise" }] },
    expectedSummary: /2 style preset\(s\) visible/,
    expectedReadPath: /\/api\/organizations\/[^/]+\/list_styles$/
  }
];

function capturedTemplate(variant: string): any {
  return JSON.parse(fs.readFileSync(path.join(CAPTURE_ROOT, `webai_claude_workspace--${variant}`, "payload-template.json"), "utf8"));
}

test("Claude workspace RPC integrations counts surfaces from captured response-stream fixture", async () => {
  const fixturePath = path.join(CAPTURE_ROOT, "webai_claude_workspace--surface_integrations/response-stream.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const integrations = fixture.json as Array<{ type: string }>;
  assert.equal(integrations.length, 4);
  assert.deepEqual(integrations.map((item) => item.type).sort(), ["gcal", "gdrive", "github", "gmail"]);

  const fetchRpc: ClaudeWorkspaceRpcFetch = async (request) => {
    assert.equal(request.method, "GET");
    assert.equal(request.purpose, "capture_probe");
    return { status: 200, contentType: "application/json", text: fixture.text_preview, elapsedMs: 5 };
  };
  const result: any = await webAiClaudeWorkspaceRpcWithFetch(
    { profile: "claude-9224", surface: "integrations" },
    fetchRpc,
    { orgId: ORG_UUID }
  );
  assert.equal(result.errorCode, null);
  assert.equal(result.summary, "4 integration setting(s) visible");
});

test("Claude workspace RPC projects counts surface_read response from captured projects payload-template", async () => {
  const fixturePath = path.join(CAPTURE_ROOT, "webai_claude_workspace--surface_projects/payload-template.json");
  const template = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  assert.equal(template.method, "GET");
  assert.equal(template.body_template, null);
  assert.deepEqual(template.placeholders, ["{{org_id}}"]);

  const surfaceProjects = { projects: [{ uuid: "p-real-1", name: "Captured Project A" }, { uuid: "p-real-2", name: "Captured Project B" }, { uuid: "p-real-3", name: "Captured Project C" }] };
  const fetchRpc: ClaudeWorkspaceRpcFetch = async (request) => {
    if (request.purpose === "capture_probe") return { status: 200, contentType: "application/json", text: "[]", elapsedMs: 3 };
    return { status: 200, contentType: "application/json", text: JSON.stringify(surfaceProjects), elapsedMs: 4 };
  };
  const result: any = await webAiClaudeWorkspaceRpcWithFetch(
    { profile: "claude-9224", surface: "projects" },
    fetchRpc,
    { orgId: ORG_UUID }
  );
  assert.equal(result.errorCode, null);
  assert.equal(result.summary, "3 project(s) visible");
});

for (const variantCase of VARIANTS) {
  test(`Claude workspace RPC ${variantCase.variant} sends captured probe and returns DOM-shaped summary`, async () => {
    const template = capturedTemplate(variantCase.variant);
    const built = buildClaudeWorkspaceRpcRequests({ profile: "claude-9224", surface: variantCase.surface }, ORG_UUID);
    assert.equal(built[0].method, template.method);
    assert.equal(built[0].url, `/api/organizations/${ORG_UUID}/sync/settings`);
    assert.equal(template.body_template, null);

    const seen: string[] = [];
    const fetchRpc: ClaudeWorkspaceRpcFetch = async (request) => {
      seen.push(`${request.method} ${request.purpose} ${request.url}`);
      assert.equal(request.profile, "claude-9224");
      assert.equal(request.method, "GET");
      assert.equal((request as any).body, undefined);
      if (request.purpose === "capture_probe") {
        assert.equal(request.url, `/api/organizations/${ORG_UUID}/sync/settings`);
        const probeJson = variantCase.surface === "integrations" ? variantCase.surfaceJson : [{ type: "gcal", enabled: true }];
        return { status: 200, contentType: "application/json", text: JSON.stringify(probeJson), elapsedMs: 3 };
      }
      assert.ok(variantCase.expectedReadPath?.test(request.url), `unexpected read URL ${request.url}`);
      return { status: 200, contentType: "application/json", text: JSON.stringify(variantCase.surfaceJson), elapsedMs: 4 };
    };

    const result: any = await webAiClaudeWorkspaceRpcWithFetch(
      { profile: "claude-9224", surface: variantCase.surface },
      fetchRpc,
      { orgId: ORG_UUID }
    );

    assert.equal(result.errorCode, null);
    assert.equal(result.surface, variantCase.surface);
    assert.match(result.summary, variantCase.expectedSummary);
    assert.equal(typeof result.url, "string");
    assert.ok(seen.length >= 1);
    if (variantCase.expectedReadPath) assert.equal(seen.length, 2);
  });
}
