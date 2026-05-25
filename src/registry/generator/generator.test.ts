import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { generateToolSpecs } from "./toolSpec";
import { verifyContractVersion } from "../../../scripts/verify-contract-version";

test("generator skeleton returns no generated specs for an empty manifest set", () => {
  assert.deepEqual(generateToolSpecs([]), []);
  assert.equal(typeof verifyContractVersion, "function");
});

test("golden MCP tool snapshot has the expected minimal shape", () => {
  const goldenPath = path.resolve(process.cwd(), "tests/golden/listMcpTools.203.json");
  const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8")) as {
    tools: Array<Record<string, unknown>>;
  };

  assert.equal(golden.tools.length, 203);
  for (const [index, tool] of golden.tools.entries()) {
    assert.equal(typeof tool.name, "string", `tools[${index}].name`);
    assert.equal(typeof tool.description, "string", `tools[${index}].description`);
    assert.equal(Object.prototype.hasOwnProperty.call(tool, "inputSchema"), true, `tools[${index}].inputSchema`);
  }
});

test("MCP golden migration preserves P1 wah facade tools plus W1 selectors plus literature tools", () => {
  const oldPath = path.resolve(process.cwd(), "tests/golden/listMcpTools.185.archived.json");
  const newPath = path.resolve(process.cwd(), "tests/golden/listMcpTools.203.json");
  const oldGolden = JSON.parse(fs.readFileSync(oldPath, "utf8")) as { tools: Array<Record<string, unknown>> };
  const newGolden = JSON.parse(fs.readFileSync(newPath, "utf8")) as { tools: Array<Record<string, unknown>> };
  const oldByName = new Map(oldGolden.tools.map((tool) => [tool.name, tool]));
  const newByName = new Map(newGolden.tools.map((tool) => [tool.name, tool]));
  const added = [...newByName.keys()].filter((name) => !oldByName.has(name)).sort();
  const removed = [...oldByName.keys()].filter((name) => !newByName.has(name)).sort();
  const changed = [...oldByName.entries()].filter(([name, oldTool]) => {
    const next = newByName.get(name);
    return JSON.stringify(oldTool) !== JSON.stringify(next);
  }).map(([name]) => name).sort();

  assert.deepEqual(added, [
    "wah_adapter_health",
    "wah_artifact_get",
    "wah_capability_query",
    "wah_policy_explain",
    "wah_task_cancel",
    "wah_task_resume",
    "wah_task_start",
    "wah_task_status",
    "webai_chatgpt_select_model",
    "webai_claude_select_model",
    "webai_literature_task_status",
    "webai_arxiv_download_pdf",
    "webai_frontiers_download_pdf",
    "webai_inspirehep_download_pdf",
    "webai_mdpi_download_pdf",
    "webai_pubscholar_download_pdf",
    "webai_scielo_download_pdf",
    "webai_scoap3_download_pdf"
  ].sort());
  assert.deepEqual(removed, []);
  assert.deepEqual(changed, []);
});
