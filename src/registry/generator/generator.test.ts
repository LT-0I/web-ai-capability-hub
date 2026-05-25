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
  const goldenPath = path.resolve(process.cwd(), "tests/golden/listMcpTools.236.json");
  const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8")) as {
    tools: Array<Record<string, unknown>>;
  };

  assert.equal(golden.tools.length, 236);
  for (const [index, tool] of golden.tools.entries()) {
    assert.equal(typeof tool.name, "string", `tools[${index}].name`);
    assert.equal(typeof tool.description, "string", `tools[${index}].description`);
    assert.equal(Object.prototype.hasOwnProperty.call(tool, "inputSchema"), true, `tools[${index}].inputSchema`);
  }
});

test("MCP golden migration preserves P1 wah facade tools plus W1 selectors plus Phase 8 literature tools", () => {
  const oldPath = path.resolve(process.cwd(), "tests/golden/listMcpTools.185.archived.json");
  const newPath = path.resolve(process.cwd(), "tests/golden/listMcpTools.236.json");
  const oldGolden = JSON.parse(fs.readFileSync(oldPath, "utf8")) as { tools: Array<Record<string, unknown>> };
  const newGolden = JSON.parse(fs.readFileSync(newPath, "utf8")) as { tools: Array<Record<string, unknown>> };
  const oldByName = new Map(oldGolden.tools.map((tool) => [tool.name, tool]));
  const newByName = new Map(newGolden.tools.map((tool) => [tool.name, tool]));
  const schemaEvolvedWebaiTools = new Set([
    "webai_chatgpt_send_prompt", "webai_gemini_send_prompt", "webai_chatgpt_select_model", "webai_claude_select_model",
    "webai_gemini_select_model", "webai_chatgpt_generate_image", "webai_gemini_generate_image", "webai_gemini_generate_video",
    "webai_gemini_music_generate", "webai_gemini_music_download_track", "webai_gemini_music_task_status", "webai_task_status",
    "webai_claude_send_prompt", "webai_claude_upload_and_query", "webai_claude_generate_file", "webai_chatgpt_upload_and_query",
    "webai_chatgpt_generate_file", "webai_gemini_upload_and_query", "webai_chatgpt_workspace", "webai_chatgpt_conversation_manage",
    "webai_claude_workspace", "webai_claude_conversation_manage", "webai_gemini_workspace", "webai_gemini_conversation_manage",
    "webai_chatgpt_deep_research", "webai_claude_deep_research", "webai_gemini_deep_research", "webai_chatgpt_codex_submit_task",
    "webai_chatgpt_codex_list_envs", "webai_chatgpt_codex_task_status", "webai_chatgpt_codex_get_diff", "webai_chatgpt_canvas_export",
    "webai_chatgpt_pulse_get", "webai_chatgpt_pulse_onboard", "webai_gemini_canvas_to_docs", "webai_gemini_canvas_edit",
    "webai_claude_design_create_project", "webai_claude_design_generate", "webai_claude_design_get_html", "webai_claude_design_present"
  ]);
  function normalizeForCompare(name: unknown, tool: unknown): unknown {
    const normalized = JSON.parse(JSON.stringify(tool));
    if (schemaEvolvedWebaiTools.has(String(name))) {
      if (normalized.inputSchema?.properties) delete normalized.inputSchema.properties.backend;
      if (name === "webai_task_status" && normalized.inputSchema?.properties) {
        delete normalized.inputSchema.properties.profile;
        delete normalized.inputSchema.properties.tab_url_contains;
      }
      if (["webai_chatgpt_conversation_manage", "webai_claude_conversation_manage", "webai_gemini_conversation_manage"].includes(String(name))) {
        const actionEnum = normalized.inputSchema?.properties?.action?.enum;
        if (Array.isArray(actionEnum)) normalized.inputSchema.properties.action.enum = actionEnum.filter((value: unknown) => value !== "list");
      }
    }
    return normalized;
  }
  const added = [...newByName.keys()].filter((name) => !oldByName.has(name)).sort();
  const removed = [...oldByName.keys()].filter((name) => !newByName.has(name)).sort();
  const changed = [...oldByName.entries()].filter(([name, oldTool]) => {
    const next = newByName.get(name);
    return JSON.stringify(normalizeForCompare(name, oldTool)) !== JSON.stringify(normalizeForCompare(name, next));
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
    "webai_scoap3_download_pdf",
    "webai_aip_download_pdf",
    "webai_aps_download_pdf",
    "webai_iop_download_pdf",
    "webai_optica_download_pdf",
    "webai_opticsjournal_download_pdf",
    "webai_siam_download_pdf",
    "webai_aiaa_download_pdf",
    "webai_asce_download_pdf",
    "webai_asme_download_pdf",
    "webai_ieee_download_pdf",
    "webai_iest_download_pdf",
    "webai_iet_download_pdf",
    "webai_sae_download_pdf",
    "webai_acs_download_pdf",
    "webai_cellpress_download_pdf",
    "webai_nature_download_pdf",
    "webai_rsc_download_pdf",
    "webai_royalsoc_download_pdf",
    "webai_cambridge_download_pdf",
    "webai_degruyter_download_pdf",
    "webai_emerald_download_pdf",
    "webai_sciencedirect_download_pdf",
    "webai_springer_download_pdf",
    "webai_tandf_download_pdf",
    "webai_wiley_download_pdf",
    "webai_acm_download_pdf",
    "webai_crc_download_pdf",
    "webai_dblp_download_pdf",
    "webai_incopat_download_pdf",
    "webai_proquest_download_pdf",
    "webai_wanfang_download_pdf",
    "webai_worldsci_download_pdf",
    "webai_wos_download_pdf"
  ].sort());
  assert.deepEqual(removed, []);
  assert.deepEqual(changed, []);
});
