const test = require("node:test");
const assert = require("node:assert/strict");
import { buildCellpressSearchUrl, buildCellpressFilterUrl, buildCellpressCitationUrl, buildCellpressDownloadUrl, normalizeCellpressPiiForObjectUri, parseCellpressResultCount, parseCellpressItemsFromHtml, parseCellpressItemsFromVisibleText } from "../src/mcp/researchdb/cellpress/flow";

test("Cell Press URL builders preserve verified pii-keyed Literatum query, facet, and export parameters", () => {
  assert.equal(
    buildCellpressSearchUrl({ query: "CRISPR gene editing", area: "AllField", page_size: 50 }),
    "https://www.cell.com/action/doSearch?text1=CRISPR+gene+editing&field1=AllField&pageSize=50"
  );
  const filter = buildCellpressFilterUrl({ query: "CRISPR gene editing", area: "Title", content_item_type: "fla", after_year: 2020, before_year: 2024, sort_by: "relevancy", access: "open", page_size: 20 });
  assert.equal(filter, "https://www.cell.com/action/doSearch?text1=CRISPR+gene+editing&field1=Title&pageSize=20&ContentItemType=fla&AfterYear=2020&BeforeYear=2024&openAccess=true&sortBy=relevancy");
  assert.equal(buildCellpressCitationUrl("S2589-0042(22)01284-6"), "https://www.cell.com/action/showCitFormats?pii=S2589-0042%2822%2901284-6");
  assert.equal(normalizeCellpressPiiForObjectUri("S2589-0042(22)01284-6"), "S2589004222012846");
  assert.equal(buildCellpressDownloadUrl({ pii: "S2589-0042(22)01284-6", download_file_name: "marlin_isci25" }), "https://www.cell.com/action/downloadCitationSecure?objectUri=pii%3AS2589004222012846&downloadFileName=marlin_isci25&direct=true");
});

test("Cell Press result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><head><title>Cell Press search results</title></head><body>
      <h1>Search Results 17,398 results</h1>
      <li class="search__item clearfix separator">
        <h3 class="meta__title"><a href="/doi/full/10.1016/j.isci.2022.105012">A kinematic blueprint for the fastest shark</a></h3>
        <span>Jean H. Smith, Keiko Tanaka and Alex Doe</span>
        <span>iScience, Volume 25, Issue 9, 2022</span>
        <a href="https://doi.org/10.1016/j.isci.2022.105012">https://doi.org/10.1016/j.isci.2022.105012</a>
        <a class="search-result__export-citations" href="/action/showCitFormats?pii=S2589-0042%2822%2901284-6">Citation</a>
      </li>
      <li class="search__item clearfix separator">
        <h3 class="meta__title"><a href="/doi/full/10.1016/j.cell.2024.01.001">CRISPR circuits in mammalian cells</a></h3>
        <span>Maria Rossi and Q. Liu</span><span>Cell, Volume 187, 2024</span>
        <a>https://doi.org/10.1016/j.cell.2024.01.001</a>
      </li>
    </body></html>`;
  assert.equal(parseCellpressResultCount("Search Results 17,398 results"), 17398);
  const items = parseCellpressItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "A kinematic blueprint for the fastest shark");
  assert.equal(items[0].doi, "10.1016/j.isci.2022.105012");
  assert.equal(items[0].pii, "S2589-0042(22)01284-6");
  assert.equal(items[0].year, 2022);
  assert.equal(items[1].doi, "10.1016/j.cell.2024.01.001");
});

test("Cell Press visible-text fallback extracts items without live network", () => {
  const text = "Search Results 6,188 results Article A kinematic blueprint for the fastest shark Jean H. Smith, Keiko Tanaka and Alex Doe iScience, Volume 25, Issue 9, 2022 https://doi.org/10.1016/j.isci.2022.105012 Citation";
  const items = parseCellpressItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.1016/j.isci.2022.105012");
  assert.equal(items[0].year, 2022);
});
