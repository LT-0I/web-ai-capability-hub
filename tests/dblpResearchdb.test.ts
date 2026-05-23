const test = require("node:test");
const assert = require("node:assert/strict");
import { buildDblpSearchUrl, buildDblpFilterUrl, buildDblpBibtexUrl, buildDblpBulkApiUrl, parseDblpResultCount, parseDblpItemsFromHtml, parseDblpItemsFromVisibleText, researchDblpExport, WebAiToolError } from "../src/handlers/researchdb/legacy/dblp";

test("DBLP URL builders preserve verified CompleteSearch, refine, and export contracts", () => {
  assert.equal(
    buildDblpSearchUrl({ query: "graph neural network" }),
    "https://dblp.org/search?q=graph+neural+network"
  );
  assert.equal(
    buildDblpFilterUrl({ query: "graph neural network", type: "Journal_Articles" }),
    "https://dblp.org/search?q=graph+neural+network+type%3AJournal_Articles%3A"
  );
  assert.equal(
    buildDblpFilterUrl({ query: "graph neural network", refine_token: "type:Journal_Articles:", mode: "publ" }),
    "https://dblp.org/search/publ?q=graph+neural+network+type%3AJournal_Articles%3A"
  );
  assert.equal(
    buildDblpBibtexUrl("journals/access/AmpratwumEN26"),
    "https://dblp.org/rec/journals/access/AmpratwumEN26.bib"
  );
  assert.equal(
    buildDblpBulkApiUrl({ query: "graph neural network", format: "xml", h: 1000 }),
    "https://dblp.org/search/publ/api?q=graph+neural+network&h=1000&format=xml"
  );
});

test("DBLP result/count parsing works from deterministic fixture DOM", () => {
  const html = `
    <html><body>
      <p id="completesearch-info-matches">found 6,368 matches</p>
      <ul class="publ-list">
        <li id="journals/access/AmpratwumEN26" class="entry article" itemtype="http://schema.org/ScholarlyArticle">
          <cite>
            <span class="authors"><span itemprop="author">Emmanuel A. Ampratwum</span>, Jane Example and Wei Zhang</span>
            <span class="title">Graph Neural Networks for Example Systems.</span>
            <span class="venue">IEEE Access</span>
            <span itemprop="datePublished">2026</span>
          </cite>
          <nav class="publ"><a href="https://dblp.org/rec/journals/access/AmpratwumEN26.html?view=bibtex">BibTeX</a></nav>
        </li>
        <li id="conf/example/Smith26" class="entry inproceedings">
          <span class="authors">Jane Smith</span><span class="title">Neural network graph search.</span><span class="venue">ExampleConf</span><span>2026</span>
        </li>
      </ul>
    </body></html>`;
  assert.equal(parseDblpResultCount("found 16,536 matches"), 16536);
  const items = parseDblpItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].key, "journals/access/AmpratwumEN26");
  assert.equal(items[0].title, "Graph Neural Networks for Example Systems.");
  assert.equal(items[0].venue, "IEEE Access");
  assert.equal(items[0].year, 2026);
  assert.equal(items[0].type, "article");
  assert.equal(items[0].bibtex_url, "https://dblp.org/rec/journals/access/AmpratwumEN26.bib");
});

test("DBLP visible-text fallback and bulk BibTeX blocker are deterministic", async () => {
  const text = "found 2 matches Graph Neural Networks for Example Systems. Emmanuel A. Ampratwum, Jane Example IEEE Access 2026 export record Neural network graph search. Jane Smith ExampleConf 2025 export record";
  const items = parseDblpItemsFromVisibleText(text);
  assert.equal(items[0].year, 2026);
  await assert.rejects(
    () => researchDblpExport({ query: "graph neural network", bulk: true, format: "bibtex" }),
    (error: unknown) => error instanceof WebAiToolError && error.errorCode === "INVALID_ARGS"
  );
});
