#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = process.cwd();
const golden185Path = path.join(root, 'tests/golden/listMcpTools.185.json');
const golden = fs.existsSync(golden185Path) ? JSON.parse(fs.readFileSync(golden185Path, 'utf8')) : { tools: [] };
const descriptions = new Map(golden.tools.map((tool) => [tool.name, tool.description]));
const contract = JSON.parse(fs.readFileSync(path.join(root, 'configs/consumer-contract.json'), 'utf8'));

const WAH_TOOLS = [
  ['wah_capability_query', 'wah:capability:query', 'wahCapabilityQuery', 'Query manifest-backed capabilities and legacy tool aliases without exposing local browser internals.'],
  ['wah_adapter_health', 'wah:adapter:health', 'wahAdapterHealth', 'Return adapter and manifest health for a provider, including generated-tool availability.'],
  ['wah_policy_explain', 'wah:policy:explain', 'wahPolicyExplain', 'Explain the policy, safety class, approvals, and stable error codes for a capability.'],
  ['wah_task_start', 'wah:task:start', 'wahTaskStart', 'Start a manifest-backed task or return its dry-run execution plan.'],
  ['wah_task_status', 'wah:task:status', 'wahTaskStatus', 'Read status and event metadata for a manifest-backed task run.'],
  ['wah_task_cancel', 'wah:task:cancel', 'wahTaskCancel', 'Request cancellation for a manifest-backed task run.'],
  ['wah_task_resume', 'wah:task:resume', 'wahTaskResume', 'Resume or re-plan a manifest-backed task run from persisted evidence.'],
  ['wah_artifact_get', 'wah:artifact:get', 'wahArtifactGet', 'Read redacted metadata for a persisted run artifact by id or path.']
];

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function writeYaml(file, data) { ensureDir(path.dirname(file)); fs.writeFileSync(file, yaml.dump(data, { lineWidth: 120, noRefs: true, sortKeys: false }), 'utf8'); }
function opFromMcp(mcp) { return mcp.split('_').pop(); }
function safetyClass(row) { return row.safety_class === 'read' ? 'read' : 'write'; }
function providerFromResearch(mcp) { return mcp.replace(/^research_/, '').replace(/_(search|filter|export)$/, ''); }
function providerFromWebai(mcp) { const parts = mcp.replace(/^webai_/, '').split('_'); return parts[0] || 'task'; }
function webaiOperation(mcp) { const parts = mcp.replace(/^webai_/, '').split('_'); return parts.slice(1).join('_') || 'status'; }
function descFor(mcp, fallback) { return descriptions.get(mcp) || fallback || `${mcp} manifest-backed tool.`; }
function directManifest(id, target, operation, row, description) {
  return {
    id,
    version: '1.0.0',
    target,
    operation,
    kind: 'direct',
    maturity: row?.maturity || 'experimental',
    safety: { class: row ? safetyClass(row) : 'read', requiresApproval: row ? row.safety_class !== 'read' : false },
    descriptionLiteral: description,
    inputSchemaRef: './src/mcp/schemas.ts#generatedManifestInput',
    outputSchemaRef: './src/mcp/schemas.ts#generatedManifestOutput',
    direct: { handler: './src/facade/legacy/aliases.ts#runLegacyAlias' }
  };
}
function firstUrlLiteral(flowText) {
  const match = flowText.match(/https:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/);
  return match ? match[0].replace(/["'`);,]+$/g, '') : undefined;
}

// 120 researchdb manifests (40 x search/filter/export), preserving current MCP descriptions from the P0 golden.
const researchRoot = path.join(root, 'src/mcp/researchdb');
const legacyRoot = path.join(root, 'src/handlers/researchdb/legacy');
const dbSet = new Set();
if (fs.existsSync(researchRoot)) for (const name of fs.readdirSync(researchRoot)) if (fs.existsSync(path.join(researchRoot, name, 'flow.ts'))) dbSet.add(name);
if (fs.existsSync(legacyRoot)) for (const name of fs.readdirSync(legacyRoot)) if (/\.ts$/.test(name)) dbSet.add(name.replace(/\.ts$/, ''));
const dbs = [...dbSet].sort();
for (const db of dbs) {
  const flowPath = fs.existsSync(path.join(researchRoot, db, 'flow.ts')) ? path.join(researchRoot, db, 'flow.ts') : path.join(legacyRoot, `${db}.ts`);
  const flowText = fs.readFileSync(flowPath, 'utf8');
  const baseUrl = firstUrlLiteral(flowText);
  for (const op of ['search', 'filter', 'export']) {
    const mcp = `research_${db}_${op}`;
    const row = contract.commands.find((command) => command.mcp_name === mcp) || { maturity: 'experimental', safety_class: op === 'export' ? 'mutate' : 'read' };
    const manifest = directManifest(`researchdb.${db}.${op}`, { kind: 'researchdb', provider: db, ...(baseUrl ? { baseUrl } : {}) }, op, row, descFor(mcp));
    manifest.direct.handler = `./src/handlers/researchdb/${op}.ts#runResearchDb${op[0].toUpperCase()}${op.slice(1)}`;
    writeYaml(path.join(root, 'configs/adapters/researchdb', db, `${op}.yaml`), manifest);
  }
}

// The remaining 39 webai + research inventory manifests needed for the 159 legacy MCP rows.
for (const row of contract.commands.filter((command) => typeof command.mcp_name === 'string' && (command.mcp_name.startsWith('webai_') || command.mcp_name === 'research_inventory_import'))) {
  const mcp = row.mcp_name;
  if (mcp === 'research_inventory_import') {
    writeYaml(path.join(root, 'configs/adapters/meta/research_inventory_import.yaml'), directManifest('meta.research_inventory.import', { kind: 'generic', provider: 'research_inventory' }, 'import', row, descFor(mcp)));
    continue;
  }
  const provider = providerFromWebai(mcp);
  const operation = webaiOperation(mcp);
  writeYaml(path.join(root, 'configs/adapters/webai', provider, `${operation}.yaml`), directManifest(`webai.${provider}.${operation}`, { kind: 'webai', provider }, operation, row, descFor(mcp)));
}

// P1 wah facade manifests (8 additive tools).
for (const [mcp, cli, tsExport, description] of WAH_TOOLS) {
  const op = mcp.replace(/^wah_/, '');
  writeYaml(path.join(root, 'configs/adapters/wah', `${op}.yaml`), {
    id: `wah.${op.replace(/_/g, '.')}`,
    version: '1.0.0',
    target: { kind: 'generic', provider: 'wah' },
    operation: op,
    kind: 'direct',
    maturity: 'stable',
    safety: { class: ['task_start', 'task_cancel', 'task_resume'].includes(op) ? 'write' : 'read', requiresApproval: false },
    descriptionLiteral: description,
    inputSchemaRef: './src/mcp/schemas.ts#generatedManifestInput',
    outputSchemaRef: './src/mcp/schemas.ts#generatedManifestOutput',
    direct: { handler: `./src/facade/wah/${tsExport.replace(/^wah/, '').replace(/^[A-Z]/, (c) => c.toLowerCase())}.ts#${tsExport}` }
  });
}

const manifestCount = fs.readdirSync(path.join(root, 'configs/adapters'), { recursive: true }).filter((name) => /\.ya?ml$/.test(String(name))).length;
console.log(JSON.stringify({ ok: true, research_dbs: dbs.length, wrote_research_manifests: dbs.length * 3, total_yaml_under_configs_adapters: manifestCount }, null, 2));
