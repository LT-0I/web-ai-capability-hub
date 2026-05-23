const test = require("node:test");
const assert = require("node:assert/strict");
import { buildNatureSearchUrl, buildNatureFilterUrl, buildNatureArticleUrl, buildNatureCitationUrl, parseNatureResultCount, parseNatureItemsFromHtml, parseNatureItemsFromVisibleText, natureFacetParam } from "../src/handlers/researchdb/legacy/nature";

test("Nature URL builders preserve verified advanced-search, facet, and citation endpoints", () => {
  assert.equal(
    buildNatureSearchUrl({ query: "unmanned aerial vehicle AND trajectory optimization", start_year: 2021, end_year: 2024 }),
    "https://www.nature.com/search?q=unmanned+aerial+vehicle+AND+trajectory+optimization&order=relevance&date_range=2021-2024"
  );
  assert.equal(
    buildNatureFilterUrl({ query: "unmanned aerial vehicle AND trajectory optimization", start_year: 2021, end_year: 2024, article_type: "reviews" }),
    "https://www.nature.com/search?q=unmanned+aerial+vehicle+AND+trajectory+optimization&order=relevance&date_range=2021-2024&article_type=reviews"
  );
  assert.equal(
    buildNatureFilterUrl({ query: "uav", facet_param: "journal", facet_value: "srep" }),
    "https://www.nature.com/search?q=uav&order=relevance&journal=srep"
  );
  assert.equal(natureFacetParam({ query: "uav", subject: "ecology" }), "subject");
  assert.equal(buildNatureArticleUrl("10.1038/s41598-024-65383-9"), "https://www.nature.com/articles/s41598-024-65383-9");
  assert.equal(buildNatureCitationUrl("10.1038/s41598-024-65383-9"), "https://citation-needed.springer.com/v2/references/10.1038%2Fs41598-024-65383-9?format=refman&flavour=citation");
});

test("Nature result-count and DOM item parsing work from deterministic fixture HTML", () => {
  const html = `
    <html><body>
      <div data-test="search-results-title">62 results</div>
      <ol>
        <li><span>Article</span>
          <a href="/articles/s41598-024-65383-9">Application of improved grey wolf model in collaborative trajectory optimization of unmanned aerial vehicle swarm</a>
          <span>Scientific Reports</span><span>Published: 12 July 2024</span><span>Jian Wang, Mei Liu and Qiang Chen</span>
        </li>
        <li><span>Review Article</span>
          <a href="/articles/s41598-023-12345-6">A review of unmanned aerial vehicle trajectory optimization methods</a>
          <span>Nature Communications</span><span>2023</span><span>Alice Zhang; Bob Li</span>
        </li>
      </ol>
    </body></html>`;
  assert.equal(parseNatureResultCount("Search results 1 - 20 of 1,234 results"), 1234);
  const items = parseNatureItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Application of improved grey wolf model in collaborative trajectory optimization of unmanned aerial vehicle swarm");
  assert.equal(items[0].doi, "10.1038/s41598-024-65383-9");
  assert.equal(items[0].article_url, "https://www.nature.com/articles/s41598-024-65383-9");
  assert.equal(items[0].year, 2024);
  assert.equal(items[1].doi, "10.1038/s41598-023-12345-6");
});

test("Nature visible-text fallback extracts records without live network", () => {
  const text = "62 results Sort by Relevance Article Application of improved grey wolf model in collaborative trajectory optimization of unmanned aerial vehicle swarm Scientific Reports Published: 12 July 2024 Jian Wang and Mei Liu Review Article A review of UAV trajectory planning Nature Communications 2023 Alice Zhang";
  const items = parseNatureItemsFromVisibleText(text);
  assert.equal(items.length, 2);
  assert.equal(items[0].article_type, "Article");
  assert.equal(items[0].year, 2024);
  assert.equal(items[1].article_type, "Review Article");
  assert.equal(items[1].year, 2023);
});
