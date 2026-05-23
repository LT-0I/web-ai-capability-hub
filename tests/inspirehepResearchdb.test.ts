const test = require("node:test");
const assert = require("node:assert/strict");
import { buildInspirehepSearchUrl, buildInspirehepFilterUrl, buildInspirehepRecordExportUrl, buildInspirehepResultsetExportUrl, parseInspirehepResultCount, parseInspirehepItemsFromHtml, researchInspirehepExport, WebAiToolError } from "../src/handlers/researchdb/legacy/inspirehep";

test("INSPIRE-HEP URL builders preserve structured-query, facet, and first-party export contracts", () => {
  assert.equal(
    buildInspirehepSearchUrl({ query: "t neutrino and t oscillation", page_size: 25 }),
    "https://inspirehep.net/literature?sort=mostrecent&size=25&page=1&q=t+neutrino+and+t+oscillation"
  );
  assert.equal(
    buildInspirehepFilterUrl({ query: "t neutrino and t oscillation", doc_type: "article", page_size: 25 }),
    "https://inspirehep.net/literature?sort=mostrecent&size=25&page=1&q=t+neutrino+and+t+oscillation&doc_type=article"
  );
  assert.equal(
    buildInspirehepRecordExportUrl("3155375", "bibtex"),
    "https://inspirehep.net/api/literature/3155375?format=bibtex"
  );
  assert.equal(
    buildInspirehepResultsetExportUrl({ query: "t neutrino and t oscillation", doc_type: "article", size: 10, format: "bibtex" }),
    "https://inspirehep.net/api/literature?q=t+neutrino+and+t+oscillation&doc_type=article&size=10&format=bibtex"
  );
});

test("INSPIRE-HEP result count and item parsing works from deterministic SPA fixture DOM", () => {
  const html = `
    <html><body>
      <span>2,192 results</span>
      <a data-test-id="literature-result-title-link" class="result-item-title" href="/literature/3155375">Effective Matter Flavor Conversion Mediated by Pseudo-Sterile States as the Possible Origin of Neutrino Oscillation Anomalies</a>
      <ul><li>Sabya Sachi Chatterjee(KIT, Karlsruhe, IAP), Antonio Palazzo(Bari U. and INFN, Bari)</li></ul>
      <span>(May 14, 2026)</span><span>e-Print: 2605.15146 [hep-ph]</span><span>0 citations</span>
      <a data-test-id="literature-result-title-link" class="result-item-title" href="/literature/2604202">A Lightning-Fast Three-Flavor Neutrino Oscillation Calculator in Constant-Density Matter with Built-In Uncertainty Propagation</a>
      <span>Aaryan Chaulagain, Daya Nidhi Chhatkuli and Anju Dhakal (Apr 22, 2026) e-Print: 2604.20275 [hep-ph] 0 citations</span>
    </body></html>`;
  assert.equal(parseInspirehepResultCount("Document Type article 985 985 results"), 985);
  assert.equal(parseInspirehepResultCount("Number of authors Single author 1,068 10 authors or fewer 1,976 2,192 results"), 2192);
  const items = parseInspirehepItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].control_number, "3155375");
  assert.equal(items[0].title, "Effective Matter Flavor Conversion Mediated by Pseudo-Sterile States as the Possible Origin of Neutrino Oscillation Anomalies");
  assert.equal(items[0].arxiv_eprint, "2605.15146");
  assert.equal(items[0].year, 2026);
  assert.equal(items[0].url, "https://inspirehep.net/literature/3155375");
});

test("INSPIRE-HEP export rejects unsupported formats deterministically without live network", async () => {
  await assert.rejects(
    () => researchInspirehepExport({ control_number: "3155375", format: "ris" }),
    (error: unknown) => error instanceof WebAiToolError && error.errorCode === "INVALID_ARGS"
  );
});
