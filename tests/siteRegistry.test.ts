const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
import { CapabilityDatabase } from "../src/capabilities/database";
import { SiteRegistryImporter, normalizeInstitutionalUrls } from "../src/adapters/research/siteRegistryImporter";

function tempDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "research-registry-test-")); }
function tempDb(): CapabilityDatabase { return new CapabilityDatabase({ dbPath: path.join(tempDir(), "capability.sqlite"), preferSqlite: false }); }
function writeJson(value: unknown): string {
  const file = path.join(tempDir(), "seed.json");
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf-8");
  return file;
}

test("research inventory schema seed maps to namespaced research database entries without persisted base URLs", () => {
  const file = writeJson({
    schema_version: "research-inventory-1.0",
    records: [{
      resource_id: "research-nav-1",
      title: "Engineering Index",
      subject: "工程",
      science_engineering: true,
      matched_subjects: ["工程"],
      has_external_url: true,
      nav_entry_id: "1",
      proxy_url: "https://libproxy.institution.example.edu/example"
    }]
  });

  const entries = new SiteRegistryImporter(tempDb()).parseFile(file);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].site_id, "research-inventory-research-nav-1");
  assert.equal(entries[0].title, "Engineering Index");
  assert.equal(entries[0].kind, "research-database");
  assert.equal(entries[0].base_url, undefined);
  assert.equal((entries[0].raw as any).classification.science_engineering, true);
  assert.deepEqual((entries[0].raw as any).classification.matched_subjects, ["工程"]);
  assert.equal((entries[0].raw as any).classification.source, "research-inventory-1.0");
  assert.equal((entries[0].raw as any).proxy_url, "[REDACTED_INSTITUTIONAL_URL]");
});

test("legacy array and sites seeds keep shipped parser shape", () => {
  const importer = new SiteRegistryImporter(tempDb());
  const arrayEntries = importer.parseFile(writeJson([{ id: "cnki", name: "CNKI", home_url: "https://example.test/cnki" }]));
  assert.equal(arrayEntries.length, 1);
  assert.deepEqual({
    site_id: arrayEntries[0].site_id,
    title: arrayEntries[0].title,
    kind: arrayEntries[0].kind,
    base_url: arrayEntries[0].base_url,
    raw: arrayEntries[0].raw
  }, {
    site_id: "cnki",
    title: "CNKI",
    kind: "research-database",
    base_url: "https://example.test/cnki",
    raw: { id: "cnki", name: "CNKI", home_url: "https://example.test/cnki" }
  });
  assert.match(arrayEntries[0].imported_at, /^\d{4}-\d{2}-\d{2}T/);

  const sitesEntries = importer.parseFile(writeJson({ sites: [{ id: "wanfang", name: "Wanfang", home_url: "https://example.test/wanfang" }] }));
  assert.equal(sitesEntries.length, 1);
  assert.deepEqual({
    site_id: sitesEntries[0].site_id,
    title: sitesEntries[0].title,
    kind: sitesEntries[0].kind,
    base_url: sitesEntries[0].base_url,
    raw: sitesEntries[0].raw
  }, {
    site_id: "wanfang",
    title: "Wanfang",
    kind: "research-database",
    base_url: "https://example.test/wanfang",
    raw: { id: "wanfang", name: "Wanfang", home_url: "https://example.test/wanfang" }
  });
});

test("institutional URL normalizer redacts proxy and nav URLs while preserving benign values", () => {
  const normalized = normalizeInstitutionalUrls({
    proxy_url: "https://libproxy.institution.example.edu/login?target=x",
    direct_url: "https://vendor.example/resource",
    nested: {
      homepage: "https://lib.institution.example.edu/database",
      benign: "https://example.test/resource",
      label: "普通资源"
    },
    list: ["libproxy wrapped value", "https://safe.example/path"]
  });

  assert.equal(normalized.proxy_url, "[REDACTED_INSTITUTIONAL_URL]");
  assert.equal(normalized.direct_url, "[REDACTED_INSTITUTIONAL_URL]");
  assert.equal(normalized.nested.homepage, "[REDACTED_INSTITUTIONAL_URL]");
  assert.equal(normalized.nested.benign, "https://example.test/resource");
  assert.equal(normalized.nested.label, "普通资源");
  assert.equal(normalized.list[0], "[REDACTED_INSTITUTIONAL_URL]");
  assert.equal(normalized.list[1], "https://safe.example/path");
});

test("importing research inventory seed is collision-safe for unrelated site ids", () => {
  const db = tempDb();
  db.importSiteRegistry([{ site_id: "research-nav-8258648", title: "Existing", kind: "legacy", base_url: "https://example.test", raw: { keep: true }, imported_at: new Date(0).toISOString() }]);

  const result = new SiteRegistryImporter(db).importFile(path.resolve(process.cwd(), "configs/research/research_inventory.json"));
  const exported = db.exportJson();
  const existing = exported.site_registry_entries.find((row: any) => row.site_id === "research-nav-8258648") as any;

  assert.equal(result.imported, 159);
  assert.equal(existing.title, "Existing");
  assert.equal(existing.kind, "legacy");
  assert.equal(existing.base_url, "https://example.test");
  assert.deepEqual(existing.raw, { keep: true });
  assert.ok(exported.site_registry_entries.some((row: any) => row.site_id === "research-inventory-research-nav-8258648"));
});

test("real research inventory parses to 159 clean entries with at least 75 science/engineering classifications", () => {
  const entries = new SiteRegistryImporter(tempDb()).parseFile(path.resolve(process.cwd(), "configs/research/research_inventory.json"));
  const stemCount = entries.filter((entry) => (entry.raw as any).classification?.science_engineering === true).length;

  assert.equal(entries.length, 159);
  assert.equal(entries.every((entry) => entry.site_id.startsWith("research-inventory-")), true);
  assert.equal(entries.every((entry) => entry.kind === "research-database"), true);
  assert.equal(entries.every((entry) => entry.base_url === undefined), true);
  assert.equal(/institution\.example\.edu|libproxy/i.test(JSON.stringify(entries.map((entry) => entry.raw))), false);
  assert.ok(stemCount >= 75, `stemCount=${stemCount}`);
});
