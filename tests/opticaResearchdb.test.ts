const test = require("node:test");
const assert = require("node:assert/strict");
import { buildOpticaSearchUrl, buildOpticaFilterUrl, parseOpticaResultCounts, parseOpticaItemsFromHtml, parseOpticaItemsFromVisibleText } from "../src/mcp/researchdb/optica/flow";

test("Optica URL builders preserve verified search.cfm GET primitive", () => {
  assert.equal(
    buildOpticaSearchUrl({ query: "metasurface AND polarization" }),
    "https://opg.optica.org/search.cfm?q=metasurface+AND+polarization&ibsearch=false"
  );
  assert.equal(
    buildOpticaFilterUrl({ query: "metasurface AND polarization", year: 2025, page_size: 20 }),
    "https://opg.optica.org/search.cfm?q=metasurface+AND+polarization&ibsearch=false&pageSize=20"
  );
});

test("Optica result count parsing supports unfiltered and filtered count text", () => {
  assert.deepEqual(parseOpticaResultCounts("2126 results (filtered) of 2126 total results"), { result_count: 2126, total_count: 2126 });
  assert.deepEqual(parseOpticaResultCounts("353 results (filtered) of 2126 total results Clear Facets"), { result_count: 353, total_count: 2126 });
  assert.deepEqual(parseOpticaResultCounts("2,126 total results"), { result_count: 2126, total_count: 2126 });
});

test("Optica item parsing extracts selectable article records from deterministic fixture DOM", () => {
  const html = `
    <html><body>
      <div>2126 results (filtered) of 2126 total results</div>
      <div class="result-item">
        <input type="checkbox" name="articles" value="col-22-12-123701">
        <a class="article-title" href="/col/fulltext.cfm?uri=col-22-12-123701">Mechanically reconfigurable terahertz polarization converter by coupling-mediated metasurfaces</a>
        <span>Yao Wang, Lei Chen and Ming Liu</span>
        <span>Chinese Optics Letters Vol. 22, Issue 12, 123701 (2024)</span>
        <a>https://doi.org/10.1364/COL.22.123701</a>
      </div>
      <div class="result-item">
        <input type="checkbox" name="articles" value="oe-33-1-100">
        <a class="article-title">Metasurface polarization optics</a>
        <span>Ada Liu and Kai Zhang</span><span>Optics Express 2025</span>
        <a>10.1364/OE.555555</a>
      </div>
    </body></html>`;
  const items = parseOpticaItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].article_id, "col-22-12-123701");
  assert.equal(items[0].title, "Mechanically reconfigurable terahertz polarization converter by coupling-mediated metasurfaces");
  assert.equal(items[0].doi, "10.1364/COL.22.123701");
  assert.equal(items[0].publication, "Chinese Optics Letters");
  assert.equal(items[0].year, 2024);
  assert.equal(items[1].article_id, "oe-33-1-100");
});

test("Optica visible-text fallback extracts basic article metadata without live network", () => {
  const text = "2126 results (filtered) of 2126 total results 1. Mechanically reconfigurable terahertz polarization converter by coupling-mediated metasurfaces Yao Wang and Lei Chen Chinese Optics Letters 2024 https://doi.org/10.1364/COL.22.123701";
  const items = parseOpticaItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.1364/COL.22.123701");
  assert.equal(items[0].publication, "Chinese Optics Letters");
  assert.equal(items[0].year, 2024);
});
