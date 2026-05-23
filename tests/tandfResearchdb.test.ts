const test = require("node:test");
const assert = require("node:assert/strict");
import { buildTandfSearchUrl, buildTandfFilterUrl, buildTandfCitationUrl, parseTandfResultCount, parseTandfItemsFromHtml, parseTandfItemsFromVisibleText } from "../src/handlers/researchdb/legacy/tandf";

test("Taylor & Francis URL builders preserve verified Literatum query and date facet parameters", () => {
  assert.equal(
    buildTandfSearchUrl({ query: "hypersonic boundary layer transition", area: "AllField", page_size: 50 }),
    "https://www.tandfonline.com/action/doSearch?AllField=hypersonic+boundary+layer+transition&pageSize=50"
  );
  const filter = buildTandfFilterUrl({ query: "hypersonic boundary layer transition", area: "Title", after_year: 2022, before_year: 2024, content_item_type: "research-article", pub_type: "journal", journal: "tcfm20", access: "full", page_size: 20 });
  assert.equal(filter, "https://www.tandfonline.com/action/doSearch?Title=hypersonic+boundary+layer+transition&pageSize=20&AfterYear=2022&BeforeYear=2024&ContentItemType=research-article&pubType=journal&journal=tcfm20&access=on");
  assert.equal(buildTandfCitationUrl("10.1080/19942060.2024.2350745"), "https://www.tandfonline.com/action/showCitFormats?doi=10.1080%2F19942060.2024.2350745");
});

test("Taylor & Francis result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><head><title>Search results | Taylor & Francis Online</title></head><body>
      <div>Showing 1-10 of 704 results for search: All: hypersonic boundary layer transition</div>
      <div class="search__item">
        <h3><a href="/doi/full/10.1080/19942060.2024.2350745">Embedded large eddy simulation of boundary layer transition behind a micro-ramp</a></h3>
        <span>Yujing Lin, Jian Wang & Andy Augousti</span>
        <span>Engineering Applications of Computational Fluid Mechanics, Volume 18, 2024 - Issue 1</span>
        <span>Article | Published Online: 07 May 2024</span>
      </div>
      <div class="search__item">
        <h3><a href="/doi/abs/10.1080/10618562.2025.2468101">Analysis of Slip Effects on the Stability of Mach 5 Flat-Plate Boundary-Layer Waves</a></h3>
        <span>Lun Zhang, Zhongzheng Jiang & Hongwei Liu</span>
        <span>International Journal of Computational Fluid Dynamics, Volume 39, 2025 - Issue 2</span>
      </div>
    </body></html>`;
  assert.equal(parseTandfResultCount("Showing 1-10 of 704 results for search: All: hypersonic boundary layer transition"), 704);
  const items = parseTandfItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Embedded large eddy simulation of boundary layer transition behind a micro-ramp");
  assert.equal(items[0].doi, "10.1080/19942060.2024.2350745");
  assert.equal(items[0].year, 2024);
  assert.equal(items[1].doi, "10.1080/10618562.2025.2468101");
});

test("Taylor & Francis visible-text fallback extracts items without live network", () => {
  const text = "Showing 1-10 of 154 results for search: [All: hypersonic boundary layer transition] AND [Publication Date: (01/01/2022 TO 12/31/2024)] Number of results: 10 per page Embedded large eddy simulation of boundary layer transition behind a micro-ramp Yujing Lin, Jian Wang & Andy Augousti Engineering Applications of Computational Fluid Mechanics, Volume 18, 2024 - Issue 1 Article | Published Online: 07 May 2024 https://doi.org/10.1080/19942060.2024.2350745 Abstract Full Text";
  const items = parseTandfItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.1080/19942060.2024.2350745");
  assert.equal(items[0].year, 2024);
});
