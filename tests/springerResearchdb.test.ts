const test = require("node:test");
const assert = require("node:assert/strict");
import { buildSpringerSearchUrl, buildSpringerFilterUrl, buildSpringerCitationUrl, parseSpringerResultCount, parseSpringerItemsFromHtml, parseSpringerItemsFromVisibleText, researchSpringerExport, WebAiToolError } from "../src/handlers/researchdb/legacy/springer";

test("Springer URL builders preserve verified search, refine, and citation contracts", () => {
  assert.equal(
    buildSpringerSearchUrl({ query: '"unmanned aerial vehicle" AND navigation', date_from: 2020, date_to: 2025 }),
    "https://link.springer.com/search?query=%22unmanned+aerial+vehicle%22+AND+navigation&dateFrom=2020&dateTo=2025&date=custom"
  );
  assert.equal(
    buildSpringerFilterUrl({ query: '"unmanned aerial vehicle" AND navigation', date_from: 2020, date_to: 2025, content_type: '"Article"' }),
    "https://link.springer.com/search?query=%22unmanned+aerial+vehicle%22+AND+navigation&dateFrom=2020&dateTo=2025&date=custom&content-type=%22Article%22"
  );
  assert.equal(
    buildSpringerCitationUrl("10.3103/S1068799825030067"),
    "https://citation-needed.springer.com/v2/references/10.3103/S1068799825030067?format=refman&flavour=citation"
  );
});

test("Springer result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><body>
      <span data-test="results-data-total">Showing 1-20 of 3,120 results</span>
      <ol data-test="darwin-search">
        <li data-test="search-result-item">
          <h3><a class="app-card-open__link" href="/article/10.3103/S1068799825030067">Development of an Algorithm for Absolute Visual Navigation of an Unmanned Aerial Vehicle</a></h3>
          <span>Lazareva, P. A.; Malikov, A. I.</span><span>Article Published 2025</span>
          <span>Journal: Russian Aeronautics</span>
        </li>
        <li data-test="search-result-item">
          <h3><a class="app-card-open__link" href="/chapter/10.1007/978-981-99-0000-1_4">UAV navigation in complex terrain</a></h3>
          <span>Jane Smith and Wei Zhang</span><span>Chapter Published 2024</span>
        </li>
      </ol>
    </body></html>`;
  assert.equal(parseSpringerResultCount("Showing 1-20 of 3,120 results"), 3120);
  const items = parseSpringerItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Development of an Algorithm for Absolute Visual Navigation of an Unmanned Aerial Vehicle");
  assert.equal(items[0].doi, "10.3103/S1068799825030067");
  assert.equal(items[0].year, 2025);
  assert.equal(items[0].url, "https://link.springer.com/article/10.3103/S1068799825030067");
  assert.equal(items[1].doi, "10.1007/978-981-99-0000-1_4");
});

test("Springer visible-text fallback and bulk blocker are deterministic", async () => {
  const text = "Showing 1-20 of 1,656 results Article Development of an Algorithm for Absolute Visual Navigation of an Unmanned Aerial Vehicle Lazareva, P. A. Published 2025 DOI 10.3103/S1068799825030067 Download citation";
  const items = parseSpringerItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.3103/S1068799825030067");
  assert.equal(items[0].year, 2025);
  await assert.rejects(
    () => researchSpringerExport({ format: "csv", bulk_export: true }),
    (error: unknown) => error instanceof WebAiToolError && error.errorCode === "HUMAN_HANDOFF_REQUIRED"
  );
});
