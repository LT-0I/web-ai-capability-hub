import test from "node:test";
import assert from "node:assert/strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "webai-phase8-bucket-c-"));
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
  { slug: "aip", mcp: "webai_aip_download_pdf", cli: "webai:aip:download-pdf", tsExport: "webAiAipDownloadPdf", defaultProfile: "research-aip" },
  { slug: "aps", mcp: "webai_aps_download_pdf", cli: "webai:aps:download-pdf", tsExport: "webAiApsDownloadPdf", defaultProfile: "research-aps" },
  { slug: "iop", mcp: "webai_iop_download_pdf", cli: "webai:iop:download-pdf", tsExport: "webAiIopDownloadPdf", defaultProfile: "research-iop" },
  { slug: "optica", mcp: "webai_optica_download_pdf", cli: "webai:optica:download-pdf", tsExport: "webAiOpticaDownloadPdf", defaultProfile: "research-optica" },
  { slug: "opticsjournal", mcp: "webai_opticsjournal_download_pdf", cli: "webai:opticsjournal:download-pdf", tsExport: "webAiOpticsjournalDownloadPdf", defaultProfile: "research-opticsjournal" },
  { slug: "siam", mcp: "webai_siam_download_pdf", cli: "webai:siam:download-pdf", tsExport: "webAiSiamDownloadPdf", defaultProfile: "research-siam" },
  { slug: "aiaa", mcp: "webai_aiaa_download_pdf", cli: "webai:aiaa:download-pdf", tsExport: "webAiAiaaDownloadPdf", defaultProfile: "research-aiaa" },
  { slug: "asce", mcp: "webai_asce_download_pdf", cli: "webai:asce:download-pdf", tsExport: "webAiAsceDownloadPdf", defaultProfile: "research-asce" },
  { slug: "asme", mcp: "webai_asme_download_pdf", cli: "webai:asme:download-pdf", tsExport: "webAiAsmeDownloadPdf", defaultProfile: "research-asme" },
  { slug: "ieee", mcp: "webai_ieee_download_pdf", cli: "webai:ieee:download-pdf", tsExport: "webAiIeeeDownloadPdf", defaultProfile: "research-ieee" },
  { slug: "iest", mcp: "webai_iest_download_pdf", cli: "webai:iest:download-pdf", tsExport: "webAiIestDownloadPdf", defaultProfile: "research-iest" },
  { slug: "iet", mcp: "webai_iet_download_pdf", cli: "webai:iet:download-pdf", tsExport: "webAiIetDownloadPdf", defaultProfile: "research-iet" },
  { slug: "sae", mcp: "webai_sae_download_pdf", cli: "webai:sae:download-pdf", tsExport: "webAiSaeDownloadPdf", defaultProfile: "research-sae" }
];

function contract(): any {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "configs/consumer-contract.json"), "utf8"));
}

test("phase8 bucket C refuses to create a fresh logged-out browser profile", async () => {
  const { tools } = await loadRuntimeModules();
  const result: any = await tools.callMcpTool("webai_aip_download_pdf", {
    doc_id: "10.9999/missing-profile",
    pdf_url: "https://example.test/aip/missing-profile.pdf",
    profile: `phase8c-missing-profile-${Date.now()}`,
    output_dir: path.join(tempRoot, "aip", "missing-profile")
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

test("phase8 bucket C paywalled literature drivers self-register", async () => {
  const { drivers: { getLiteratureDriver } } = await loadRuntimeModules();
  for (const item of cases) {
    assert.equal(typeof getLiteratureDriver(item.slug), "function", `${item.slug} driver missing`);
  }
});
