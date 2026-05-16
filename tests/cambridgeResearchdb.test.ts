const test = require("node:test");
const assert = require("node:assert/strict");
import { buildCambridgeSearchUrl, buildCambridgeFilterUrl, parseCambridgeResultCount, parseCambridgeItemsFromHtml, parseCambridgeItemsFromVisibleText } from "../src/mcp/researchdb/cambridge/flow";

test("Cambridge Core URL builders preserve mandatory q and verified facet parameters", () => {
  assert.equal(
    buildCambridgeSearchUrl({ query: "unmanned aerial vehicle AND control" }),
    "https://www.cambridge.org/core/search?q=unmanned+aerial+vehicle+AND+control"
  );
  const filter = buildCambridgeFilterUrl({ query: "unmanned aerial vehicle AND control", product_type: "JOURNAL_ARTICLE", start_year: 2013, end_year: 2026, only_show_available: true });
  assert.equal(filter, "https://www.cambridge.org/core/search?q=unmanned+aerial+vehicle+AND+control&aggs%5BproductTypes%5D%5Bfilters%5D=JOURNAL_ARTICLE&aggs%5BonlyShowAvailable%5D%5Bfilters%5D=true&dateRange.from=2013&dateRange.to=2026");
  assert.throws(() => buildCambridgeSearchUrl({ query: "" }), /INVALID_ARGS/);
});

test("Cambridge Core result count and fixture DOM parsing are deterministic", () => {
  const html = `
    <html><body>
      <h1 class="title">Search Results</h1><p>128,732 results for unmanned aerial vehicle AND control</p>
      <div class="part-result"><a class="export-citation-component" data-prod-id="3CFBF3E6A859422D6018A62C84003E0C">Citation Tools</a>
        <h3><a class="part-link">INTEGRATED PID CONTROLLER DESIGN FOR AN UNMANNED AERIAL VEHICLE WITH STATIC STABILITY</a></h3>
        <span>LI R, SHI Y.J. and XU H.L.</span><span>The ANZIAM Journal</span><span>2013</span>
        <a href="https://doi.org/10.1017/S1446181113000199">https://doi.org/10.1017/S1446181113000199</a>
      </div>
    </body></html>`;
  assert.equal(parseCambridgeResultCount("128,732 results for unmanned aerial vehicle AND control"), 128732);
  const items = parseCambridgeItemsFromHtml(html);
  assert.equal(items.length, 1);
  assert.equal(items[0].product_id, "3CFBF3E6A859422D6018A62C84003E0C");
  assert.equal(items[0].doi, "10.1017/S1446181113000199");
  assert.equal(items[0].year, 2013);
});

test("Cambridge Core visible-text fallback extracts DOI/year without live network", () => {
  const text = "121,571 results for unmanned aerial vehicle AND control Type: Articles (121571) Citation Tools Article INTEGRATED PID CONTROLLER DESIGN FOR AN UNMANNED AERIAL VEHICLE WITH STATIC STABILITY Published online: 2013 DOI: 10.1017/S1446181113000199";
  const items = parseCambridgeItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.1017/S1446181113000199");
  assert.equal(items[0].year, 2013);
});

test("Cambridge Core RIS validator accepts journal, book, and chapter RIS while rejecting non-RIS", () => {
  const journalRis = "TY  - JOUR\nTI  - Journal article\nDO  - 10.1017/S1446181113000199\nER  -\n";
  const bookRis = "TY  - BOOK\nTI  - Cambridge book\nDO  - 10.1017/9781009000000\nER  -\n";
  const chapterRis = "TY  - CHAP\nTI  - Cambridge chapter\nDO  - 10.1017/9781009000000.002\nER  -\n";
  const htmlError = "<!doctype html><html><body>Page not found</body></html>";
  const { isValidCambridgeRisArtifact } = require("../src/mcp/researchdb/cambridge/flow");
  assert.equal(isValidCambridgeRisArtifact(journalRis), true);
  assert.equal(isValidCambridgeRisArtifact(bookRis), true);
  assert.equal(isValidCambridgeRisArtifact(chapterRis), true);
  assert.equal(isValidCambridgeRisArtifact(htmlError), false);
  assert.equal(isValidCambridgeRisArtifact("TY  - BOOK\nTI  - Missing terminator\nDO  - 10.1017/9781009000000\n"), false);
});
