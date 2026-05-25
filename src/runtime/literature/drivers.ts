export type LiteratureDriver = (input: {
  db_slug: string;
  doc_id: string;
  requested_url: string | null;
}) => Promise<{ path: string; sha256: string; resolved_url: string | null }>;

const registry = new Map<string, LiteratureDriver>();
let attemptedBuiltInDriverLoad = false;

function loadBuiltInDriversOnce(): void {
  if (attemptedBuiltInDriverLoad) return;
  attemptedBuiltInDriverLoad = true;
  // Built-in literature drivers self-register at module init. Keep this lazy so
  // the shared registry can be imported without pulling MCP code into unrelated
  // runtime paths, while still letting the standalone worker discover drivers.
  require("../../mcp/submcp/literature/arxiv");
  require("../../mcp/submcp/literature/scoap3");
  require("../../mcp/submcp/literature/mdpi");
  require("../../mcp/submcp/literature/frontiers");
  require("../../mcp/submcp/literature/pubscholar");
  require("../../mcp/submcp/literature/scielo");
  require("../../mcp/submcp/literature/inspirehep");
  require("../../mcp/submcp/literature/aip");
  require("../../mcp/submcp/literature/aps");
  require("../../mcp/submcp/literature/iop");
  require("../../mcp/submcp/literature/optica");
  require("../../mcp/submcp/literature/opticsjournal");
  require("../../mcp/submcp/literature/siam");
  require("../../mcp/submcp/literature/aiaa");
  require("../../mcp/submcp/literature/asce");
  require("../../mcp/submcp/literature/asme");
  require("../../mcp/submcp/literature/ieee");
  require("../../mcp/submcp/literature/iest");
  require("../../mcp/submcp/literature/iet");
  require("../../mcp/submcp/literature/sae");
  require("../../mcp/submcp/literature/acm");
  require("../../mcp/submcp/literature/crc");
  require("../../mcp/submcp/literature/dblp");
  require("../../mcp/submcp/literature/incopat");
  require("../../mcp/submcp/literature/proquest");
  require("../../mcp/submcp/literature/wanfang");
  require("../../mcp/submcp/literature/worldsci");
  require("../../mcp/submcp/literature/wos");
}

export function registerLiteratureDriver(db_slug: string, driver: LiteratureDriver): void {
  registry.set(db_slug, driver);
}

export function getLiteratureDriver(db_slug: string): LiteratureDriver | null {
  loadBuiltInDriversOnce();
  return registry.get(db_slug) || null;
}
