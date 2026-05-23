const test = require("node:test");
const assert = require("node:assert/strict");
import { buildScoap3SearchUrl, buildScoap3FilterUrl, buildScoap3ResultsetExportUrl, buildScoap3RecordExportUrl, parseScoap3ResultCount, parseScoap3ItemsFromHtml, parseScoap3ItemsFromVisibleText, researchScoap3Export, WebAiToolError } from "../src/handlers/researchdb/legacy/scoap3";

test("SCOAP3 URL builders preserve search_simple_query_string, facets, and export contracts", () => {
  assert.equal(
    buildScoap3SearchUrl({ query: "Higgs boson" }),
    "https://repo.scoap3.org/search?search_simple_query_string=Higgs+boson"
  );
  assert.equal(
    buildScoap3FilterUrl({ query: "Higgs boson", journal: "Physical Review Letters", country: ["Germany", "France"], country_logic: "OR", publication_year_gte: 2022, publication_year_lte: 2024 }),
    "https://repo.scoap3.org/search?search_simple_query_string=Higgs+boson&journal=Physical+Review+Letters&country=Germany&country=France&country_logic=OR&publication_year__gte=2022-01-01&publication_year__lte=2024-12-31"
  );
  assert.equal(
    buildScoap3ResultsetExportUrl({ query: "Higgs boson", journal: "Physical Review Letters", format: "csv" }),
    "https://repo.scoap3.org/api/search/article/?search_simple_query_string=Higgs+boson&journal=Physical+Review+Letters&all=true&format=csv"
  );
  assert.equal(buildScoap3RecordExportUrl(107171), "https://repo.scoap3.org/api/records/107171/");
});

test("SCOAP3 result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><body>
      <a role="download" href="/api/search/article/?search_simple_query_string=Higgs+boson&all=true&format=csv">Found 4,655 results.</a>
      <main>
        <a class="mb-2 block text-lg" href="/records/107171">Measurement of Higgs boson production in association with a top quark pair</a>
        <a href="https://doi.org/10.17182/hepdata.152313">10.17182/hepdata.152313</a>
        <span>Physical Review Letters</span><span>2025-01-10</span><a href="https://arxiv.org/abs/2407.10904">arXiv:2407.10904</a>
        <a class="mb-2 block text-lg" href="/records/98765">Search for Higgs boson decays to invisible particles</a>
        <a href="https://doi.org/10.1007/JHEP01(2024)001">10.1007/JHEP01(2024)001</a>
      </main>
    </body></html>`;
  assert.equal(parseScoap3ResultCount("Found 4,655 results."), 4655);
  const items = parseScoap3ItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "107171");
  assert.equal(items[0].title, "Measurement of Higgs boson production in association with a top quark pair");
  assert.equal(items[0].doi, "10.17182/hepdata.152313");
  assert.equal(items[0].url, "https://repo.scoap3.org/records/107171");
});

test("SCOAP3 visible-text fallback and unsupported export formats are deterministic", async () => {
  const text = "Found 123 results. 107171 Measurement of Higgs boson production in association with a top quark pair PDF XML doi 10.17182/hepdata.152313 arXiv:2407.10904 2025-01-10";
  const items = parseScoap3ItemsFromVisibleText(text);
  assert.equal(items[0].id, "107171");
  assert.equal(items[0].doi, "10.17182/hepdata.152313");
  await assert.rejects(
    () => researchScoap3Export({ query: "Higgs boson", format: "ris" }),
    (error: unknown) => error instanceof WebAiToolError && error.errorCode === "INVALID_ARGS"
  );
});
