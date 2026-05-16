const test = require("node:test");
const assert = require("node:assert/strict");
import { buildIetSearchUrl, buildIetFilterUrl, buildIetArticleUrl, parseIetResultCount, parseIetItemsFromHtml, parseIetItemsFromVisibleText } from "../src/mcp/researchdb/iet/flow";

test("IET URL builders preserve verified Literatum advanced-search and facet parameters", () => {
  assert.equal(
    buildIetSearchUrl({ query: "unmanned aerial vehicle AND navigation", area: "AllField", page_size: 20 }),
    "https://digital-library.theiet.org/action/doSearch?field1=AllField&text1=unmanned+aerial+vehicle+AND+navigation&field2=AllField&pageSize=20"
  );
  const filter = buildIetFilterUrl({ query: "unmanned aerial vehicle AND navigation", area: "Title", concept_id: "504247", contrib_raw: "Colone, Fabiola", series_key: "icp", alphabet_range: "u", ppub: "20240101-20261231" });
  assert.equal(filter, "https://digital-library.theiet.org/action/doSearch?field1=Title&text1=unmanned+aerial+vehicle+AND+navigation&field2=AllField&Ppub=20240101-20261231&ConceptID=504247&ContribRaw=Colone%2C+Fabiola&SeriesKey=icp&alphabetRange=u");
  assert.equal(buildIetArticleUrl("10.1049/stg2.70000"), "https://digital-library.theiet.org/doi/10.1049/stg2.70000");
});

test("IET result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><head><title>Search Result | IET Digital Library</title></head><body>
      <span class="result__count">1,023</span>
      <div class="search-result doSearch"><ul class="rlist search-result__body">
        <li class="search-item clearfix">
          <h4 class="meta__title"><a href="/doi/10.1049/stg2.70000">Unmanned aerial vehicles versus smart grids</a></h4>
          <span>H. Khayyam, B. Javadi and R.N. Jazar</span>
          <span>IET Smart Grid, Volume 8, Issue 1, 2025</span>
        </li>
        <li class="search-item clearfix">
          <h4 class="meta__title"><a href="/doi/10.1049/icp.2024.1234">Navigation of unmanned aerial vehicles in complex airspace</a></h4>
          <span>A. Pilot, C. Sensor</span>
          <span>International Conference on Navigation, 2024</span>
        </li>
      </ul></div>
    </body></html>`;
  assert.equal(parseIetResultCount("1,023"), 1023);
  const items = parseIetItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Unmanned aerial vehicles versus smart grids");
  assert.equal(items[0].doi, "10.1049/stg2.70000");
  assert.equal(items[0].journal, "IET Smart Grid");
  assert.equal(items[0].year, 2025);
  assert.equal(items[1].doi, "10.1049/icp.2024.1234");
});

test("IET visible-text fallback extracts DOI/year without live network", () => {
  const text = "1,023 results Unmanned aerial vehicles versus smart grids H. Khayyam, B. Javadi and R.N. Jazar IET Smart Grid, Volume 8, Issue 1, 2025 https://doi.org/10.1049/stg2.70000 PDF";
  const items = parseIetItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.1049/stg2.70000");
  assert.equal(items[0].year, 2025);
});
