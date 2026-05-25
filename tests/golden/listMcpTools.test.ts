import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { listMcpTools } from "../../src/mcp/tools";

function minimalToolProjection() {
  return listMcpTools()
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema || null
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

test("listMcpTools golden snapshot preserves the current MCP surface", () => {
  const goldenPath = path.resolve(process.cwd(), "tests/golden/listMcpTools.196.json");
  const expected = JSON.parse(fs.readFileSync(goldenPath, "utf8")) as {
    count: number;
    captured_at: string;
    tools: ReturnType<typeof minimalToolProjection>;
  };
  const actual = JSON.parse(JSON.stringify({ count: listMcpTools().length, tools: minimalToolProjection() }));
  const expectedWithoutCapture = { count: expected.count, tools: expected.tools };

  assert.deepEqual(
    actual,
    expectedWithoutCapture,
    "listMcpTools() drifted from tests/golden/listMcpTools.196.json; regenerate only for an approved contract-surface change"
  );
});
