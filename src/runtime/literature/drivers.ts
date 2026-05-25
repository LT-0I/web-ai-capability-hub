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
}

export function registerLiteratureDriver(db_slug: string, driver: LiteratureDriver): void {
  registry.set(db_slug, driver);
}

export function getLiteratureDriver(db_slug: string): LiteratureDriver | null {
  loadBuiltInDriversOnce();
  return registry.get(db_slug) || null;
}
