const test = require("node:test");
const assert = require("node:assert/strict");
import { buildScienceDirectSearchUrl, buildScienceDirectFilterUrl, parseScienceDirectResultCount, parseScienceDirectItemsFromHtml, parseScienceDirectItemsFromVisibleText, scienceDirectFacetInputId } from "../src/mcp/researchdb/sciencedirect/flow";

test("ScienceDirect URL builders preserve verified advanced-search and facet parameters", () => {
  assert.equal(
    buildScienceDirectSearchUrl({ query: "unmanned aerial vehicle AND trajectory optimization", date: "2021-2024" }),
    "https://www.sciencedirect.com/search?qs=unmanned+aerial+vehicle+AND+trajectory+optimization&date=2021-2024"
  );
  assert.equal(
    buildScienceDirectFilterUrl({ query: "unmanned aerial vehicle AND trajectory optimization", date: "2021-2024", article_type: "REV" }),
    "https://www.sciencedirect.com/search?qs=unmanned+aerial+vehicle+AND+trajectory+optimization&date=2021-2024&articleTypes=REV&lastSelectedFacet=articleTypes"
  );
  assert.equal(
    buildScienceDirectFilterUrl({ query: "uav", date: "2024", facet_input_id: "accessTypes-openaccess" }),
    "https://www.sciencedirect.com/search?qs=uav&date=2024&accessTypes=openaccess&lastSelectedFacet=accessTypes"
  );
  assert.equal(scienceDirectFacetInputId({ query: "uav", year: 2024 }), "years-2024");
});

test("ScienceDirect result-count and DOM item parsing work from deterministic fixture HTML", () => {
  const html = `
    <html><body>
      <aside id="srp-facets">501 results Set search alert Refine by: Article type Review articles (501)</aside>
      <ol id="results-content">
        <li id="S123"><span>Review article</span><span>Open access</span>
          <a id="title-S123">A systematic review on metaheuristic approaches for autonomous path planning of unmanned aerial vehicles</a>
          <span>Drone Systems and Applications</span><span>5 June 2024</span><span>Sameer Agrawal; Bhumeshwar K. Patle</span>
        </li>
        <li id="S456"><span>Research article</span><span>Full text access</span>
          <a id="title-S456">Optimization of multi-target continuous dynamic trajectory for unmanned aerial vehicles</a>
          <span>Aerospace Science and Technology</span><span>July 2024</span><span>Ze Yu and Naiming Qi</span>
        </li>
      </ol>
    </body></html>`;
  assert.equal(parseScienceDirectResultCount("Skip to results 4,269 results Set search alert"), 4269);
  const items = parseScienceDirectItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].pii, "123");
  assert.equal(items[0].title, "A systematic review on metaheuristic approaches for autonomous path planning of unmanned aerial vehicles");
  assert.equal(items[0].year, 2024);
  assert.equal(items[0].article_type, "Review article");
});

test("ScienceDirect visible-text fallback extracts records without live network", () => {
  const text = "501 results Download selected articles Export sorted by relevance | date 1 Review articleOpen access A survey on UAV placement and trajectory optimization in communication networks ICT Express June 2023 Jonghyeon Won Do-Yup Kim View PDF Abstract Export";
  const items = parseScienceDirectItemsFromVisibleText(text);
  assert.equal(items.length, 1);
  assert.equal(items[0].article_type, "Review article");
  assert.equal(items[0].access, "Open access");
  assert.equal(items[0].year, 2023);
});
