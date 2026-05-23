const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
import { CapabilityDatabase } from "../src/capabilities/database";
import { CAPABILITY_DB_SCHEMA_VERSION, SQLITE_MIGRATIONS } from "../src/capabilities/migrations";
import { CapabilityLibraryImporter } from "../src/adapters/research/capabilityLibraryImporter";
import { callMcpTool, listMcpTools } from "../src/mcp/tools";
import { listMcpResources, readMcpResource } from "../src/mcp/resources";

function tempDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "wah-integration-registry-")); }
function tempDb(preferSqlite = false): CapabilityDatabase { return new CapabilityDatabase({ dbPath: path.join(tempDir(), preferSqlite ? "capability.sqlite" : "capability.json"), preferSqlite }); }
function seed(): any { return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "docs/capability-library.json"), "utf-8")); }
function contract(): any { return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "configs/consumer-contract.json"), "utf-8")); }
function mcpTokens(value: unknown): string[] { return String(value || "").match(/webai_[a-z0-9_]+/g) || []; }

function statusTally(rows: Array<{ status: string }>): Record<string, number> {
  return rows.reduce((acc: Record<string, number>, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc; }, {});
}

test("integration registry migration mirrors site registry as a sibling table", () => {
  assert.equal(CAPABILITY_DB_SCHEMA_VERSION, 2);
  const ddl = SQLITE_MIGRATIONS.find((migration) => migration.includes("CREATE TABLE IF NOT EXISTS integration_registry"));
  assert.ok(ddl, "integration_registry migration missing");
  assert.match(ddl, /feature_id TEXT PRIMARY KEY/);
  assert.match(ddl, /raw TEXT NOT NULL/);
  assert.match(ddl, /CHECK\(status IN \('IMPLEMENTED_GREEN','EXPLORED_PATH_KNOWN','UNEXPLORED','IN_PROGRESS','BLOCKED_NEEDS_USER','OUT_OF_SCOPE'\)\)/);
  assert.equal(SQLITE_MIGRATIONS.some((migration) => migration.includes("integration_registry_fts")), false);
});

test("capability library import round-trips seed features through integration_registry", () => {
  const db = tempDb(false);
  const result = new CapabilityLibraryImporter(db).importFile(path.resolve(process.cwd(), "docs/capability-library.json"));
  const rows = db.listIntegrationRegistry();
  const raw = seed();
  assert.equal(result.imported, raw.features.length);
  assert.equal(rows.length, raw.features.length);
  assert.equal(statusTally(rows).IMPLEMENTED_GREEN, statusTally(raw.features).IMPLEMENTED_GREEN);
  assert.ok(rows.every((row) => row.raw && typeof row.raw === "object"));
});

test("integration registry enforces campaign status enum integrity", () => {
  const db = tempDb(false);
  assert.throws(() => db.importIntegrationRegistry([{
    feature_id: "typo-status",
    service: "chatgpt",
    name: "Typo status",
    status: "IMPLEMENTED_GREN" as any,
    mcp_tool: "webai_chatgpt_send_prompt",
    raw: { status: "IMPLEMENTED_GREN" },
    imported_at: new Date().toISOString()
  }]), /Invalid integration registry status: IMPLEMENTED_GREN/);
});

test("integration registry JSON fallback import and query parity works", () => {
  const db = tempDb(false);
  const importer = new CapabilityLibraryImporter(db);
  importer.importFile(path.resolve(process.cwd(), "docs/capability-library.json"));
  const allRows = db.listIntegrationRegistry();
  const greenRows = db.queryIntegrationRegistry("IMPLEMENTED_GREEN");
  assert.equal(allRows.length, seed().features.length);
  assert.equal(greenRows.length, seed().features.filter((feature: any) => feature.status === "IMPLEMENTED_GREEN").length);
  assert.ok(greenRows.every((row) => row.status === "IMPLEMENTED_GREEN"));
});

test("integration registry mcp_tool tokens are bidirectionally consistent with consumer contract webai commands", () => {
  const db = tempDb(false);
  new CapabilityLibraryImporter(db).importFile(path.resolve(process.cwd(), "docs/capability-library.json"));
  const rows = db.listIntegrationRegistry();
  const commandNames = new Set(contract().commands.map((command: any) => command.mcp_name).filter(Boolean));
  const rowTokens = new Set<string>();

  for (const row of rows) {
    const tokens = mcpTokens(row.mcp_tool);
    for (const token of tokens) rowTokens.add(token);
    if (row.status === "IMPLEMENTED_GREEN" && row.mcp_tool) {
      for (const token of tokens) assert.ok(commandNames.has(token), `${row.feature_id} references missing command ${token}`);
    }
  }

  const webaiCommands = contract().commands.filter((command: any) => String(command.mcp_name || "").startsWith("webai_"));
  assert.equal(webaiCommands.length, 40);
  for (const command of webaiCommands) assert.ok(rowTokens.has(command.mcp_name), `contract command missing from integration registry: ${command.mcp_name}`);
});

test("capability library import surfaces round-trip through MCP tool and resource", async () => {
  const db = tempDb(false);
  const tools = new Set(listMcpTools().map((tool) => tool.name));
  const resources = new Set(listMcpResources().map((resource) => resource.uri));
  assert.ok(tools.has("capability_library_import"));
  assert.ok(resources.has("capability-library://features"));
  const result: any = await callMcpTool("capability_library_import", { path: path.resolve(process.cwd(), "docs/capability-library.json") }, { database: db } as any);
  assert.equal(result.imported, seed().features.length);
  const rows: any = readMcpResource("capability-library://features", db);
  assert.equal(rows.length, seed().features.length);
});
