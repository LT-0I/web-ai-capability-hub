const test = require("node:test");
const assert = require("node:assert/strict");
import { buildApsSearchUrl, buildApsFilterUrl, buildApsArticleUrl, buildApsExportUrl, parseApsResultCount, parseApsItemsFromHtml, parseApsItemsFromVisibleText } from "../src/handlers/researchdb/legacy/aps";

test("APS URL builders preserve verified React search, date refine, and export endpoints", () => {
  assert.equal(
    buildApsSearchUrl({ query: "quantum", field: "title" }),
    "https://journals.aps.org/search/results?clauses=%5B%7B%22field%22%3A%22title%22%2C%22value%22%3A%22quantum%22%2C%22operator%22%3A%22AND%22%7D%5D&sort=recent&per_page=20"
  );
  assert.equal(
    buildApsSearchUrl({ clauses: [{ field: "title", value: "unmanned aerial vehicle", operator: "AND" }, { field: "abstract", value: "control", operator: "AND" }], page_size: 50 }),
    "https://journals.aps.org/search/results?clauses=%5B%7B%22field%22%3A%22title%22%2C%22value%22%3A%22unmanned+aerial+vehicle%22%2C%22operator%22%3A%22AND%22%7D%2C%7B%22field%22%3A%22abstract%22%2C%22value%22%3A%22control%22%2C%22operator%22%3A%22AND%22%7D%5D&sort=recent&per_page=50"
  );
  assert.equal(
    buildApsFilterUrl({ query: "quantum", field: "title", date_range: "Past Year" }),
    "https://journals.aps.org/search/results?clauses=%5B%7B%22field%22%3A%22title%22%2C%22value%22%3A%22quantum%22%2C%22operator%22%3A%22AND%22%7D%5D&sort=recent&date=year&per_page=20"
  );
  assert.equal(buildApsArticleUrl("prl", "10.1103/hr5f-lvy7"), "https://journals.aps.org/prl/abstract/10.1103/hr5f-lvy7");
  assert.equal(buildApsExportUrl("prl", "10.1103/hr5f-lvy7", "ris"), "https://journals.aps.org/prl/export/10.1103/hr5f-lvy7?type=ris&download=true");
  assert.equal(buildApsExportUrl("prl", "10.1103/hr5f-lvy7", "bibtex"), "https://journals.aps.org/prl/export/10.1103/hr5f-lvy7?type=bibtex&download=true");
});

test("APS result count parsing handles hydrated React count text", () => {
  assert.equal(parseApsResultCount("1-20 of 68,509 Results"), 68509);
  assert.equal(parseApsResultCount("Showing filters 1-20 of 3,430 Results Sort"), 3430);
});

test("APS deterministic fixture DOM extracts per-article links", () => {
  const html = `
    <html><body><p>1-20 of 68,509 Results</p>
      <article class="article panel article-result">
        <h5><a href="/prl/abstract/10.1103/hr5f-lvy7">Quantum Error Correction with Superpositions of Squeezed Fock States</a></h5>
        <span>J. Hastrup, M. V. Larsen and U. L. Andersen</span>
        <span>Phys. Rev. Lett. 136, 190602</span><span>2026</span>
      </article>
      <article class="article panel article-result">
        <h5><a href="/pra/abstract/10.1103/PhysRevA.110.012345">A second quantum result</a></h5>
        <span>A Smith and B Jones</span><span>2024</span>
      </article>
    </body></html>`;
  const items = parseApsItemsFromHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Quantum Error Correction with Superpositions of Squeezed Fock States");
  assert.equal(items[0].doi, "10.1103/hr5f-lvy7");
  assert.equal(items[0].journal, "prl");
  assert.equal(items[0].year, 2026);
  assert.equal(items[0].article_url, "https://journals.aps.org/prl/abstract/10.1103/hr5f-lvy7");
  assert.equal(items[1].doi, "10.1103/PhysRevA.110.012345");
});

test("APS visible-text fallback extracts DOI and year without live network", () => {
  const text = "1-20 of 3,430 Results Quantum Error Correction with Superpositions of Squeezed Fock States J. Hastrup and M. V. Larsen Published 2026 DOI 10.1103/hr5f-lvy7";
  const items = parseApsItemsFromVisibleText(text);
  assert.equal(items[0].doi, "10.1103/hr5f-lvy7");
  assert.equal(items[0].year, 2026);
});

test("APS abstract-page href shape (single-article direct jump) yields one item with journal+doi", () => {
  // Mirrors the regex the article direct-jump path reuses: /(<journal>)/abstract/(10.1103/<doi>)
  const html = `
    <html><head><title>Quantum Error Correction | Phys. Rev. Lett.</title>
      <meta name="citation_title" content="Quantum Error Correction with Superpositions of Squeezed Fock States">
      <meta name="citation_author" content="J. Hastrup">
      <meta name="citation_author" content="M. V. Larsen">
    </head><body>
      <h1 class="article-title">Quantum Error Correction with Superpositions of Squeezed Fock States</h1>
      <a href="/prl/abstract/10.1103/hr5f-lvy7">View abstract</a>
      <span>Published 2026</span>
    </body></html>`;
  const items = parseApsItemsFromHtml(html);
  assert.equal(items.length, 1);
  assert.equal(items[0].journal, "prl");
  assert.equal(items[0].doi, "10.1103/hr5f-lvy7");
  assert.equal(items[0].article_url, "https://journals.aps.org/prl/abstract/10.1103/hr5f-lvy7");
});

test("APS abstract-page href ignores query/fragment suffix when extracting DOI", () => {
  const html = `<a href="/prd/abstract/10.1103/PhysRevD.110.012345?utm=x#abstract">Read</a>`;
  const items = parseApsItemsFromHtml(html);
  assert.equal(items.length, 1);
  assert.equal(items[0].doi, "10.1103/PhysRevD.110.012345");
  assert.equal(items[0].journal, "prd");
});
