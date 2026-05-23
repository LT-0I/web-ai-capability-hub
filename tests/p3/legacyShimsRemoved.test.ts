import test from "node:test";
import assert from "node:assert/strict";
const fs = require("node:fs");
const path = require("node:path");

const DELETED_SHIMS = [
  "src/mcp/researchdb/acm/index.ts","src/mcp/researchdb/acm/tools.ts","src/mcp/researchdb/acs/tools.ts",
  "src/mcp/researchdb/aiaa/index.ts","src/mcp/researchdb/aiaa/tools.ts","src/mcp/researchdb/aip/tools.ts",
  "src/mcp/researchdb/aps/tools.ts","src/mcp/researchdb/arxiv/tools.ts","src/mcp/researchdb/asce/tools.ts",
  "src/mcp/researchdb/asme/tools.ts","src/mcp/researchdb/cambridge/tools.ts","src/mcp/researchdb/cellpress/tools.ts",
  "src/mcp/researchdb/crc/tools.ts","src/mcp/researchdb/dblp/tools.ts","src/mcp/researchdb/degruyter/tools.ts",
  "src/mcp/researchdb/emerald/tools.ts","src/mcp/researchdb/frontiers/tools.ts","src/mcp/researchdb/ieee/tools.ts",
  "src/mcp/researchdb/iest/tools.ts","src/mcp/researchdb/iet/tools.ts","src/mcp/researchdb/incopat/tools.ts",
  "src/mcp/researchdb/inspirehep/tools.ts","src/mcp/researchdb/iop/tools.ts","src/mcp/researchdb/mdpi/tools.ts",
  "src/mcp/researchdb/nature/tools.ts","src/mcp/researchdb/optica/tools.ts","src/mcp/researchdb/opticsjournal/tools.ts",
  "src/mcp/researchdb/proquest/tools.ts","src/mcp/researchdb/pubscholar/tools.ts","src/mcp/researchdb/royalsoc/tools.ts",
  "src/mcp/researchdb/rsc/tools.ts","src/mcp/researchdb/sae/tools.ts","src/mcp/researchdb/scielo/tools.ts",
  "src/mcp/researchdb/sciencedirect/tools.ts","src/mcp/researchdb/scoap3/tools.ts","src/mcp/researchdb/siam/tools.ts",
  "src/mcp/researchdb/springer/tools.ts","src/mcp/researchdb/tandf/tools.ts","src/mcp/researchdb/wanfang/tools.ts",
  "src/mcp/researchdb/wiley/tools.ts","src/mcp/researchdb/worldsci/tools.ts","src/mcp/researchdb/wos/index.ts",
  "src/mcp/researchdb/wos/tools.ts"
];

test("p3: all 43 deleted per-DB MCP shim files no longer exist on disk", () => {
  assert.equal(DELETED_SHIMS.length, 43, "test-data sanity: expected 43 shim paths enumerated");
  const stillThere = DELETED_SHIMS.filter((p) => fs.existsSync(path.join(process.cwd(), p)));
  assert.deepEqual(stillThere, [], `deleted shims must not exist: ${JSON.stringify(stillThere)}`);
});

test("p3: no remaining .ts file under src/ imports from researchdb/<deleted-db>/tools", () => {
  const dbs = ["acm","acs","aiaa","aip","aps","arxiv","asce","asme","cambridge","cellpress","crc","dblp","degruyter",
    "emerald","frontiers","ieee","iest","iet","incopat","inspirehep","iop","mdpi","nature","optica","opticsjournal",
    "proquest","pubscholar","royalsoc","rsc","sae","scielo","sciencedirect","scoap3","siam","springer","tandf",
    "wanfang","wiley","worldsci","wos"];
  function walk(dir: string, acc: string[] = []): string[] {
    if (!fs.existsSync(dir)) return acc;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, acc);
      else if (entry.isFile() && /\.ts$/.test(entry.name)) acc.push(full);
    }
    return acc;
  }
  const tsFiles = walk(path.join(process.cwd(), "src"));
  const violators: string[] = [];
  for (const f of tsFiles) {
    const body = fs.readFileSync(f, "utf8");
    for (const db of dbs) {
      const re = new RegExp(`from ['"][^'"]*researchdb/${db}/tools['"]`);
      if (re.test(body)) { violators.push(`${f}:${db}`); break; }
    }
  }
  assert.deepEqual(violators, [], `remaining deleted-shim imports: ${JSON.stringify(violators)}`);
});
