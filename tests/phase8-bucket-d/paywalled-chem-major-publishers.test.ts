import test from "node:test";
import assert from "node:assert/strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "webai-phase8-bucket-d-"));
process.env.WEBAI_LITERATURE_RATE_LIMIT_DB = path.join(tempRoot, "literature-rate-limit.sqlite");
process.env.WEBAI_LITERATURE_QUEUE_DB = path.join(tempRoot, "literature-queue.sqlite");

type RuntimeModules = {
  tools: typeof import("../../src/mcp/tools");
  quota: typeof import("../../src/runtime/literature/quota");
  queue: typeof import("../../src/runtime/literature/queue");
  drivers: typeof import("../../src/runtime/literature/drivers");
};

let runtimeModules: Promise<RuntimeModules> | undefined;
async function loadRuntimeModules(): Promise<RuntimeModules> {
  runtimeModules ||= Promise.all([
    import("../../src/mcp/tools"),
    import("../../src/runtime/literature/quota"),
    import("../../src/runtime/literature/queue"),
    import("../../src/runtime/literature/drivers")
  ]).then(([tools, quota, queue, drivers]) => ({ tools, quota, queue, drivers }));
  return runtimeModules;
}

interface DriverCase {
  slug: string;
  mcp: string;
  cli: string;
  tsExport: string;
  defaultProfile: string;
}

const cases: DriverCase[] = [
  { slug: "acs", mcp: "webai_acs_download_pdf", cli: "webai:acs:download-pdf", tsExport: "webAiAcsDownloadPdf", defaultProfile: "research-acs" },
  { slug: "cellpress", mcp: "webai_cellpress_download_pdf", cli: "webai:cellpress:download-pdf", tsExport: "webAiCellpressDownloadPdf", defaultProfile: "research-cellpress" },
  { slug: "nature", mcp: "webai_nature_download_pdf", cli: "webai:nature:download-pdf", tsExport: "webAiNatureDownloadPdf", defaultProfile: "research-nature" },
  { slug: "rsc", mcp: "webai_rsc_download_pdf", cli: "webai:rsc:download-pdf", tsExport: "webAiRscDownloadPdf", defaultProfile: "research-rsc" },
  { slug: "royalsoc", mcp: "webai_royalsoc_download_pdf", cli: "webai:royalsoc:download-pdf", tsExport: "webAiRoyalsocDownloadPdf", defaultProfile: "research-royalsoc" },
  { slug: "cambridge", mcp: "webai_cambridge_download_pdf", cli: "webai:cambridge:download-pdf", tsExport: "webAiCambridgeDownloadPdf", defaultProfile: "research-cambridge" },
  { slug: "degruyter", mcp: "webai_degruyter_download_pdf", cli: "webai:degruyter:download-pdf", tsExport: "webAiDegruyterDownloadPdf", defaultProfile: "research-degruyter" },
  { slug: "emerald", mcp: "webai_emerald_download_pdf", cli: "webai:emerald:download-pdf", tsExport: "webAiEmeraldDownloadPdf", defaultProfile: "research-emerald" },
  { slug: "sciencedirect", mcp: "webai_sciencedirect_download_pdf", cli: "webai:sciencedirect:download-pdf", tsExport: "webAiSciencedirectDownloadPdf", defaultProfile: "research-sciencedirect" },
  { slug: "springer", mcp: "webai_springer_download_pdf", cli: "webai:springer:download-pdf", tsExport: "webAiSpringerDownloadPdf", defaultProfile: "research-springer" },
  { slug: "tandf", mcp: "webai_tandf_download_pdf", cli: "webai:tandf:download-pdf", tsExport: "webAiTandfDownloadPdf", defaultProfile: "research-tandf" },
  { slug: "wiley", mcp: "webai_wiley_download_pdf", cli: "webai:wiley:download-pdf", tsExport: "webAiWileyDownloadPdf", defaultProfile: "research-wiley" }
];

function contract(): any {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "configs/consumer-contract.json"), "utf8"));
}

test("phase8 bucket D refuses to create a fresh logged-out browser profile", async () => {
  const { tools } = await loadRuntimeModules();
  const result: any = await tools.callMcpTool("webai_acs_download_pdf", {
    doc_id: "10.9999/missing-profile",
    pdf_url: "https://example.test/acs/missing-profile.pdf",
    profile: `phase8d-missing-profile-${Date.now()}`,
    output_dir: path.join(tempRoot, "acs", "missing-profile")
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "PROFILE_NOT_FOUND");
  assert.match(result.message, /refusing to spawn a fresh logged-out Chrome/);
});

for (const item of cases) {
  test(`${item.mcp} routes, validates args, queues on quota, and requires pdf_url fallback`, async () => {
    const { tools, quota, queue } = await loadRuntimeModules();
    const row = contract().commands.find((command: any) => command.mcp_name === item.mcp);
    assert.equal(row?.cli_name, item.cli);
    assert.equal(row?.ts_export, item.tsExport);
    assert.deepEqual(row?.required_args, ["doc_id"]);
    for (const arg of ["pdf_url", "profile", "output_dir", "cdp_port"]) assert.ok(row?.optional_args?.includes(arg), `${item.mcp} missing optional ${arg}`);
    assert.equal(typeof (tools as any)[item.tsExport], "function");

    const spec = tools.listMcpTools().find((tool) => tool.name === item.mcp) as any;
    assert.ok(spec, `${item.mcp} missing from listMcpTools`);
    assert.equal(spec.inputSchema?.properties?.doc_id?.type, "string");
    assert.equal(spec.inputSchema?.properties?.pdf_url?.type, "string");
    assert.equal(spec.inputSchema?.properties?.profile?.type, "string");
    assert.equal(spec.inputSchema?.properties?.output_dir?.type, "string");
    assert.equal(spec.inputSchema?.properties?.cdp_port?.type, "number");
    assert.deepEqual(spec.inputSchema?.required, ["doc_id"]);

    const invalid: any = await tools.callMcpTool(item.mcp, {});
    assert.equal(invalid.ok, false);
    assert.equal(invalid.errorCode, "INVALID_ARGS");

    const unresolvedDocId = `10.1234/${item.slug}.unresolved`;
    const unresolved: any = await tools.callMcpTool(item.mcp, { doc_id: unresolvedDocId, output_dir: path.join(tempRoot, item.slug, "unresolved") });
    assert.equal(unresolved.ok, false);
    assert.equal(unresolved.errorCode, "ELEMENT_NOT_FOUND");
    assert.match(unresolved.message, new RegExp(`research_${item.slug}_get_metadata`));
    assert.match(unresolved.message, /pass pdf_url/);

    for (let i = 0; i < 20; i++) {
      quota.recordLiteratureDownload(item.slug, `cap-${i}`, `/tmp/${item.slug}-${i}.pdf`, `sha-${i}`, null, Date.now() + i);
    }
    const queuedDocId = `10.9999/${item.slug}/queued`;
    const queued: any = await (tools as any)[item.tsExport]({
      doc_id: queuedDocId,
      pdf_url: `https://example.test/${item.slug}/queued.pdf`,
      profile: item.defaultProfile,
      output_dir: path.join(tempRoot, item.slug, "queued")
    });
    assert.equal(queued.ok, true);
    assert.equal(queued.errorCode, "LITERATURE_QUEUED");
    assert.match(queued.task_id, /^[0-9a-f-]{36}$/i);
    assert.equal(queued.path, null);
    assert.equal(queued.sha256, null);
    const status = queue.getLiteratureTaskStatus(queued.task_id);
    assert.equal(status?.db_slug, item.slug);
    assert.equal(status?.doc_id, queuedDocId);
    assert.equal(status?.status, "queued");
  });
}

test("phase8 bucket D paywalled literature drivers self-register", async () => {
  const { drivers: { getLiteratureDriver } } = await loadRuntimeModules();
  for (const item of cases) {
    assert.equal(typeof getLiteratureDriver(item.slug), "function", `${item.slug} driver missing`);
  }
});
