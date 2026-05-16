const test = require("node:test");
const assert = require("node:assert/strict");
import { buildAsmeSearchUrl, buildAsmeFilterUrl, buildAsmeDoiUrl, buildAsmeCitationDownloadPath, parseAsmeResultCount, parseAsmeItemsFromHtml, parseAsmeItemsFromVisibleText } from "../src/mcp/researchdb/asme/flow";

test("ASME URL builders preserve verified Silverchair search, refine, and citation contracts", () => {
  assert.equal(
    buildAsmeSearchUrl({ query: "heat transfer", page_size: 20 }),
    "https://asmedigitalcollection.asme.org/search-results?page=1&q=heat+transfer&pageSize=20"
  );
  assert.equal(
    buildAsmeFilterUrl({ query: "heat transfer", format: "Journal Articles", topic: "Heat transfer" }),
    "https://asmedigitalcollection.asme.org/search-results?page=1&q=heat+transfer&fl_ContentType=Journal+Articles&fl_Topics=Heat+transfer"
  );
  assert.equal(buildAsmeDoiUrl("10.1115/1.4014186"), "https://doi.org/10.1115/1.4014186");
  assert.equal(buildAsmeCitationDownloadPath("1137566", "bibtex"), "/Citation/Download?resourceId=1137566&resourceType=3&citationFormat=2");
  assert.equal(buildAsmeCitationDownloadPath("1137566", "ris"), "/Citation/Download?resourceId=1137566&resourceType=3&citationFormat=0");
});

test("ASME result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><head><title>heat transfer | Page 1 | Search Results | ASME Digital Collection</title></head><body>
      <span>1-20 of 167115</span>
      <div class="al-search-result">
        <h4><a>Discussion: “Effect of Turbine-Blade Cooling on Efficiency of a Simple Gas-Turbine Power Plant”</a></h4>
        <span>Free David G. Wilson</span>
        <span>Journal: Journal of Fluids Engineering Publisher: ASME Article Type: Discussions</span>
        <span>J. Fluids Eng. December 1956, 78(8): 1794. https://doi.org/10.1115/1.4014186 Published Online: December 1, 1956</span>
      </div>
      <div class="al-search-result">
        <h4><a>Forced Convection Heat Transfer in Turbine Blades</a></h4>
        <span>A. Smith, B. Jones</span>
        <span>Journal: ASME Journal of Heat and Mass Transfer Publisher: ASME</span>
        <span>Published Online: May 1, 2024 https://doi.org/10.1115/1.4050000</span>
      </div>
    </body></html>`;
  assert.equal(parseAsmeResultCount("Availability Available 1-20 of 167115 Search Results for heat transfer"), 167115);
  const items = parseAsmeItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Discussion: “Effect of Turbine-Blade Cooling on Efficiency of a Simple Gas-Turbine Power Plant”");
  assert.equal(items[0].doi, "10.1115/1.4014186");
  assert.equal(items[0].year, 1956);
  assert.equal(items[1].doi, "10.1115/1.4050000");
});

test("ASME visible-text fallback extracts DOI records without live network", () => {
  const text = "1-20 of 47055 Search Results for heat transfer Save search Sort by Sort Order Select JOURNAL ARTICLES Forced Convection Heat Transfer in Turbine Blades Free A. Smith, B. Jones Journal: ASME Journal of Heat and Mass Transfer Publisher: ASME Article Type: Research Papers J. Heat Mass Transfer. May 2024, 146(5): 050001. https://doi.org/10.1115/1.4050000 Published Online: May 1, 2024 View Article";
  const items = parseAsmeItemsFromVisibleText(text);
  assert.equal(items[0].title, "Forced Convection Heat Transfer in Turbine Blades");
  assert.equal(items[0].publication, "ASME Journal of Heat and Mass Transfer");
  assert.equal(items[0].doi, "10.1115/1.4050000");
  assert.equal(items[0].year, 2024);
});
